import { describe, expect, it, vi } from "vitest";

import { buildEvent } from "./core";
import { NOT_APPLICABLE, resolveDispatch, syncInfo, type Chain, type OutboxClaim } from "./outbox";
import { runOutboxWorker } from "./outbox.server";

/** Todos os dados são sintéticos: nenhum paciente, contato ou clínica reais. */
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LOCATION = "loc_sintetica";
const claim: OutboxClaim = {
  id: uuid(10),
  event_type: "anamnese_recebida",
  record_id: uuid(2),
  consultation_id: uuid(1),
  scope_location_id: LOCATION,
  attempts: 1,
  lease_token: uuid(11),
};
const chain = (over: Partial<Chain> = {}): Chain => ({
  submission: {
    id: uuid(2),
    consultation_id: uuid(1),
    accepted: true,
    confirmed_at: "2026-09-20T10:00:00.000Z",
    invitation_id: uuid(5),
  },
  consultation: { id: uuid(1), patient_id: uuid(3) },
  links: [{ location_id: LOCATION, contact_id: "contato_sintetico", patient_id: uuid(3) }],
  invitation: {
    id: uuid(5),
    location_id: LOCATION,
    contact_id: "contato_sintetico",
    consultation_id: uuid(1),
    revoked_at: null,
    submission_id: uuid(2),
  },
  ...over,
});

describe("cadeia de vínculo da fila", () => {
  it("aceita anamnese confirmada com vínculo único e convite correspondente", () => {
    const r = resolveDispatch(claim, chain(), LOCATION);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({
      consultationId: uuid(1),
      recordId: uuid(2),
      eventType: "anamnese_recebida",
      ghlContactId: "contato_sintetico",
      confirm: true,
    });
    expect(Object.keys(r.input)).toHaveLength(5);
  });

  it("aceita resposta do consultório sem convite, com vínculo persistido único", () => {
    const c = chain();
    c.submission = { ...c.submission!, invitation_id: null };
    c.invitation = null;
    expect(resolveDispatch(claim, c, LOCATION).ok).toBe(true);
  });

  it.each([
    ["rascunho não confirmado", { submission: { ...chain().submission!, accepted: false } }],
    ["registro ausente", { submission: null }],
    ["consulta ausente", { consultation: null }],
    ["sem vínculo persistido", { links: [] }],
    [
      "vínculo ambíguo",
      {
        links: [
          { location_id: LOCATION, contact_id: "a", patient_id: uuid(3) },
          { location_id: LOCATION, contact_id: "b", patient_id: uuid(3) },
        ],
      },
    ],
    [
      "vínculo de outra subconta",
      { links: [{ location_id: "outra", contact_id: "a", patient_id: uuid(3) }] },
    ],
    [
      "contato divergente do convite",
      { invitation: { ...chain().invitation!, contact_id: "outro_contato" } },
    ],
    [
      "convite revogado",
      { invitation: { ...chain().invitation!, revoked_at: "2026-09-20T11:00:00Z" } },
    ],
    [
      "convite de outra consulta",
      { invitation: { ...chain().invitation!, consultation_id: uuid(9) } },
    ],
    ["convite ausente", { invitation: null }],
  ])("bloqueia %s sem enviar", (_label, over) => {
    const r = resolveDispatch(claim, chain(over as Partial<Chain>), LOCATION);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.blocked).toBe(true);
  });

  it("bloqueia escopo de clínica divergente", () => {
    expect(resolveDispatch(claim, chain(), "outra_clinica").ok).toBe(false);
  });

  it("gera sempre o mesmo event_id para o mesmo registro (retentativa idempotente)", () => {
    const r = resolveDispatch(claim, chain(), LOCATION);
    if (!r.ok) throw new Error("esperava resolução");
    const config = { organizationId: uuid(4), locationId: LOCATION, keyId: "k1" };
    const a = buildEvent(r.input, r.source, config);
    const b = buildEvent(r.input, r.source, config, Date.now() + 60_000);
    expect(a.event_id).toBe(b.event_id);
    expect(Object.keys(a)).toHaveLength(14);
    expect(JSON.stringify(a)).not.toMatch(/answers|peso|medic|relatorio_conteudo/i);
  });
});

type Rpc = { name: string; args: Record<string, unknown> };
function fakeDb(options: { claims: unknown[][]; chain?: Chain; dbError?: boolean }) {
  const calls: Rpc[] = [];
  const selects: string[] = [];
  const c = options.chain ?? chain();
  let batch = 0;
  const db = {
    calls,
    selects,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "jornada_outbox_claim")
        return Promise.resolve({ data: options.claims[batch++] ?? [], error: null });
      return Promise.resolve({ data: true, error: null });
    },
    from(table: string) {
      const chainable = {
        select(columns: string) {
          selects.push(columns);
          return chainable;
        },
        eq: () => chainable,
        limit: () =>
          Promise.resolve(
            options.dbError
              ? { data: null, error: { message: "x" } }
              : { data: c.links, error: null },
          ),
        maybeSingle: () =>
          Promise.resolve(
            options.dbError
              ? { data: null, error: { message: "x" } }
              : {
                  data:
                    table === "anamnesis_submissions"
                      ? c.submission
                      : table === "consultations"
                        ? c.consultation
                        : c.invitation,
                  error: null,
                },
          ),
      };
      return chainable;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db as any;
}

describe("trabalhador da fila", () => {
  it("envia, confirma com fencing pela lease e não lê conteúdo clínico", async () => {
    const db = fakeDb({ claims: [[claim]] });
    const send = vi.fn().mockResolvedValue({ status: "received" });
    const summary = await runOutboxWorker({ db, send, locationId: LOCATION });
    expect(summary).toEqual({ claimed: 1, sent: 1, duplicate: 0, blocked: 0, failed: 0 });
    const complete = db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete");
    expect(complete.args["_lease"]).toBe(claim.lease_token);
    expect(complete.args["_status"]).toBe("sent");
    for (const columns of db.selects)
      expect(columns).not.toMatch(/answers|clinical_data|token_hash/);
  });

  it("trata recibo duplicado como confirmado (resposta perdida após processar)", async () => {
    const db = fakeDb({ claims: [[claim]] });
    const summary = await runOutboxWorker({
      db,
      send: vi.fn().mockResolvedValue({ status: "duplicate" }),
      locationId: LOCATION,
    });
    expect(summary.duplicate).toBe(1);
    expect(db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete").args["_status"]).toBe(
      "sent",
    );
  });

  it("marca falha sanitizada quando o destino está indisponível ou o recibo é inválido", async () => {
    const db = fakeDb({ claims: [[claim]] });
    const summary = await runOutboxWorker({
      db,
      send: vi.fn().mockRejectedValue(new Error("Recibo inválido com segredo-abc")),
      locationId: LOCATION,
    });
    expect(summary.failed).toBe(1);
    const complete = db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete");
    expect(complete.args["_status"]).toBe("failed");
    expect(String(complete.args["_error"])).toBe("envio_indisponivel");
  });

  it("marca pendência de vínculo sem chamar o destino", async () => {
    const db = fakeDb({ claims: [[claim]], chain: chain({ links: [] }) });
    const send = vi.fn();
    const summary = await runOutboxWorker({ db, send, locationId: LOCATION });
    expect(send).not.toHaveBeenCalled();
    expect(summary.blocked).toBe(1);
    expect(db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete").args["_error"]).toBe(
      "vinculo_ausente",
    );
  });

  it("falha de leitura do banco vira retentativa, não pendência definitiva", async () => {
    const db = fakeDb({ claims: [[claim]], dbError: true });
    const summary = await runOutboxWorker({ db, send: vi.fn(), locationId: LOCATION });
    expect(summary.failed).toBe(1);
  });

  it("não reprocessa quando a reserva não devolve linhas (concorrência e clique duplo)", async () => {
    const db = fakeDb({ claims: [[]] });
    const send = vi.fn();
    const summary = await runOutboxWorker({ db, send, locationId: LOCATION });
    expect(send).not.toHaveBeenCalled();
    expect(summary.claimed).toBe(0);
  });

  it("ignora reserva malformada e limita o lote pedido", async () => {
    const db = fakeDb({ claims: [[{ id: "x" }]] });
    const summary = await runOutboxWorker({ db, send: vi.fn(), locationId: LOCATION, limit: 500 });
    expect(summary.claimed).toBe(0);
    expect(db.calls[0].args["_limit"]).toBe(25);
  });
});

describe("situação exibida ao administrador", () => {
  it("separa não aplicável, pendente, confirmada, falha e pendência de vínculo", () => {
    const base = {
      consultation_id: uuid(1),
      record_id: uuid(2),
      attempts: 2,
      last_attempt_at: "2026-09-20T10:00:00Z",
      next_attempt_at: "2026-09-20T10:05:00Z",
      last_error_code: null,
      sent_at: null,
      outbox_id: uuid(10),
    };
    expect(syncInfo(undefined)).toEqual(NOT_APPLICABLE);
    expect(syncInfo({ ...base, status: "pending" }).state).toBe("pendente");
    expect(syncInfo({ ...base, status: "sent" }).state).toBe("confirmada");
    expect(syncInfo({ ...base, status: "failed" }).nextAttemptAt).toBe("2026-09-20T10:05:00Z");
    const blockedRow = syncInfo({ ...base, status: "blocked", last_error_code: "vinculo_ambiguo" });
    expect(blockedRow.state).toBe("pendencia_vinculo");
    expect(blockedRow.note).toMatch(/mais de um contato/);
  });
});
