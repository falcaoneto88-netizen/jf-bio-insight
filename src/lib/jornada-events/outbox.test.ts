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
  link_contacts: 1,
  invitation: {
    id: uuid(5),
    location_id: LOCATION,
    contact_id: "contato_sintetico",
    consultation_id: uuid(1),
    revoked_at: null,
    submitted_at: "2026-09-20T10:00:00.000Z",
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
    ["sem vínculo persistido", { links: [], link_contacts: 0 }],
    [
      "convite sem confirmação registrada",
      { invitation: { ...chain().invitation!, submitted_at: null } },
    ],
    [
      "convite apontando para outra resposta",
      { invitation: { ...chain().invitation!, submission_id: uuid(8) } },
    ],
    [
      "convite ainda sem resposta vinculada",
      { invitation: { ...chain().invitation!, submission_id: null } },
    ],
    [
      "confirmação do convite divergente da resposta",
      { invitation: { ...chain().invitation!, submitted_at: "2026-09-21T10:00:00.000Z" } },
    ],
    [
      "vínculo ambíguo",
      {
        links: [
          { location_id: LOCATION, contact_id: "a", patient_id: uuid(3) },
          { location_id: LOCATION, contact_id: "b", patient_id: uuid(3) },
        ],
        link_contacts: 2,
      },
    ],
    [
      "vínculo de outra subconta",
      { links: [{ location_id: "outra", contact_id: "a", patient_id: uuid(3) }], link_contacts: 1 },
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

  it("bloqueia quando a contagem completa de vínculos não bate com a lista recebida", () => {
    // Lista truncada no SQL: nunca pode ser lida como vínculo único.
    const r = resolveDispatch(claim, chain({ link_contacts: 3 }), LOCATION);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("vinculo_indisponivel");
  });

  it("renova a reserva antes de cada envio para o bilhete não vencer no lote", async () => {
    const db = fakeDb({ batches: [[{ ...claim, ...chain() }]] });
    await runOutboxWorker({
      db,
      send: vi.fn().mockResolvedValue({ status: "received" }),
      locationId: LOCATION,
      orgFingerprint: ORG_FP,
      claimKey: CLAIM_KEY,
    });
    const names = db.calls.map((r: Rpc) => r.name);
    expect(names).toEqual([
      "jornada_outbox_claim_signed",
      "jornada_outbox_renew_signed",
      "jornada_outbox_complete_signed",
    ]);
    expect(db.calls[0].args["_org_fp"]).toBe(ORG_FP);
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
const ORG_FP = "c".repeat(64);
const WAKEUP = { ts: 1_790_000_000, nonce: "a".repeat(32), sig: "b".repeat(64) };
const CLAIM_KEY = "d".repeat(64);
const batchItem = (over: Partial<Chain> = {}) => ({ ...claim, ...chain(over) });

function fakeDb(options: { batches: unknown[]; claimError?: boolean }) {
  const calls: Rpc[] = [];
  let batch = 0;
  const db = {
    calls,
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "jornada_outbox_claim_signed")
        return Promise.resolve(
          options.claimError
            ? { data: null, error: { message: "DESPERTADOR_INVALIDO" } }
            : { data: options.batches[batch++] ?? [], error: null },
        );
      return Promise.resolve({ data: true, error: null });
    },
    from() {
      throw new Error("o trabalhador não deve ler tabelas diretamente");
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db as any;
}

describe("trabalhador da fila", () => {
  it("reserva com assinatura de uso único, sem service role e sem ler tabelas", async () => {
    const db = fakeDb({ batches: [[batchItem()]] });
    const send = vi.fn().mockResolvedValue({ status: "received" });
    const summary = await runOutboxWorker({
      db,
      send,
      locationId: LOCATION,
      orgFingerprint: ORG_FP,
      claimKey: CLAIM_KEY,
    });
    expect(summary).toEqual({ claimed: 1, sent: 1, duplicate: 0, blocked: 0, failed: 0 });
    const reserva = db.calls[0] as Rpc;
    expect(reserva.name).toBe("jornada_outbox_claim_signed");
    // A reserva leva prova própria do servidor, nunca a assinatura do despertador.
    expect(reserva.args["_location_id"]).toBe(LOCATION);
    expect(reserva.args["_sig"]).not.toBe(WAKEUP.sig);
    expect(reserva.args["_nonce"]).not.toBe(WAKEUP.nonce);
    expect(String(reserva.args["_sig"])).toMatch(/^[a-f0-9]{64}$/);
    const complete = db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete_signed");
    expect(complete.args["_lease"]).toBe(claim.lease_token);
    expect(complete.args["_status"]).toBe("sent");
    // Nenhuma rotina privilegiada é usada.
    expect(db.calls.some((r: Rpc) => r.name === "jornada_outbox_claim")).toBe(false);
    expect(db.calls.some((r: Rpc) => r.name === "jornada_outbox_complete")).toBe(false);
  });

  it("assinatura recusada pelo banco interrompe o ciclo sem enviar nada", async () => {
    const db = fakeDb({ batches: [], claimError: true });
    const send = vi.fn();
    await expect(
      runOutboxWorker({ db, send, locationId: LOCATION, orgFingerprint: ORG_FP, claimKey: CLAIM_KEY }),
    ).rejects.toThrow("wakeup");
    expect(send).not.toHaveBeenCalled();
    expect(db.calls).toHaveLength(1);
  });

  it("trata recibo duplicado como confirmado (resposta perdida após processar)", async () => {
    const db = fakeDb({ batches: [[batchItem()]] });
    const summary = await runOutboxWorker({
      db,
      send: vi.fn().mockResolvedValue({ status: "duplicate" }),
      locationId: LOCATION,
      orgFingerprint: ORG_FP,
      claimKey: CLAIM_KEY,
    });
    expect(summary.duplicate).toBe(1);
    expect(
      db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete_signed").args["_status"],
    ).toBe("sent");
  });

  it("marca falha sanitizada quando o destino está indisponível ou o recibo é inválido", async () => {
    const db = fakeDb({ batches: [[batchItem()]] });
    const summary = await runOutboxWorker({
      db,
      send: vi.fn().mockRejectedValue(new Error("Recibo inválido com segredo-abc")),
      locationId: LOCATION,
      orgFingerprint: ORG_FP,
      claimKey: CLAIM_KEY,
    });
    expect(summary.failed).toBe(1);
    const complete = db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete_signed");
    expect(complete.args["_status"]).toBe("failed");
    expect(String(complete.args["_error"])).toBe("envio_indisponivel");
  });

  it("marca pendência de vínculo sem chamar o destino", async () => {
    const db = fakeDb({ batches: [[batchItem({ links: [], link_contacts: 0 })]] });
    const send = vi.fn();
    const summary = await runOutboxWorker({
      db,
      send,
      locationId: LOCATION,
      orgFingerprint: ORG_FP,
      claimKey: CLAIM_KEY,
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.blocked).toBe(1);
    expect(
      db.calls.find((r: Rpc) => r.name === "jornada_outbox_complete_signed").args["_error"],
    ).toBe("vinculo_ausente");
  });

  it("não reprocessa quando a reserva não devolve linhas (concorrência e clique duplo)", async () => {
    const db = fakeDb({ batches: [[]] });
    const send = vi.fn();
    const summary = await runOutboxWorker({
      db,
      send,
      locationId: LOCATION,
      orgFingerprint: ORG_FP,
      claimKey: CLAIM_KEY,
    });
    expect(send).not.toHaveBeenCalled();
    expect(summary.claimed).toBe(0);
  });

  it("ignora lote malformado ou com campo inesperado e limita o tamanho pedido", async () => {
    const db = fakeDb({
      batches: [[{ id: "x" }, { ...batchItem(), submission: { id: "não-uuid" } }]],
    });
    const summary = await runOutboxWorker({
      db,
      send: vi.fn(),
      locationId: LOCATION,
      orgFingerprint: ORG_FP,
      claimKey: CLAIM_KEY,
      limit: 500,
    });
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

  it("distingue falha com nova tentativa de falha que exige intervenção", () => {
    const row = {
      consultation_id: uuid(1),
      record_id: uuid(2),
      attempts: 6,
      last_attempt_at: "2026-09-20T10:00:00Z",
      next_attempt_at: "2026-09-20T10:05:00Z",
      last_error_code: "envio_indisponivel",
      sent_at: null,
      outbox_id: uuid(10),
      status: "exhausted",
    };
    const info = syncInfo(row);
    expect(info.state).toBe("falha_intervencao");
    // Tentativas esgotadas não prometem nova tentativa programada.
    expect(info.nextAttemptAt).toBeNull();
    expect(info.note).toMatch(/Recoloque na fila/);
  });

  it("não mascara falha de leitura nem confirmação elegível fora da fila", () => {
    expect(syncInfo(undefined, { unavailable: true }).state).toBe("indisponivel");
    expect(syncInfo(undefined, { eligible: true }).state).toBe("ausente_na_fila");
    // Falha de leitura prevalece sobre qualquer linha recebida.
    expect(syncInfo(undefined, { unavailable: true, eligible: true }).state).toBe("indisponivel");
    // Sem elegibilidade (antes da primeira ativação) continua sendo "sem aviso a enviar".
    expect(syncInfo(undefined, {})).toEqual(NOT_APPLICABLE);
  });
});
