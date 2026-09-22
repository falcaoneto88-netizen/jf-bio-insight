import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Source, SyncInput } from "./core";
import { batchItemSchema, resolveDispatch, splitBatchItem } from "./outbox";

/**
 * Trabalhador da fila: roda apenas no servidor, sem depender de aba aberta.
 * Não usa acesso privilegiado (service role). Autoridades separadas: o
 * despertador apenas acorda este endpoint e NÃO autoriza leitura, reserva ou
 * conclusão; reservar, renovar e concluir exigem uma prova própria do servidor
 * (finalidade distinta + escopo clínica/organização + carimbo de tempo + nonce
 * de uso único), assinada com a subchave derivada do segredo já configurado.
 * Não toca em conteúdo clínico e nunca registra segredos, cabeçalhos ou corpo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type Wakeup = { ts: number; nonce: string; sig: string };

export type WorkerDeps = {
  db: Db;
  send: (input: SyncInput, source: Source) => Promise<{ status: "received" | "duplicate" }>;
  locationId: string;
  /** Impressão digital (SHA-256) da organização de destino: escopo fixado no banco. */
  orgFingerprint: string;
  /** Subchave derivada (hex) da prova de reserva; nunca é registrada nem devolvida. */
  claimKey: string;
  limit?: number;
};

const PROOF_PURPOSES = ["claim", "renew", "complete"] as const;
type ProofPurpose = (typeof PROOF_PURPOSES)[number];
export type Proof = { _epoch: number; _nonce: string; _sig: string };

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Subchave de finalidade exclusiva: derivada do segredo de assinatura já configurado. */
export async function deriveClaimKey(signingSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("jornada-outbox-claim-v1")),
  );
}

/** Prova do servidor para uma operação específica da fila. */
export async function buildProof(
  claimKey: string,
  purpose: ProofPurpose,
  payload: string,
): Promise<Proof> {
  const epoch = Math.floor(Date.now() / 1000);
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(claimKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = `jornada-outbox-${purpose}|${payload}|${epoch}|${nonce}`;
  const sig = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return { _epoch: epoch, _nonce: nonce, _sig: sig };
}

/** Cliente público do servidor: apenas as duas rotinas assinadas da fila. */
export function createOutboxClient(): Db {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  return createClient(process.env["SUPABASE_URL"] ?? "", key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`)
          headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

export type WorkerSummary = {
  claimed: number;
  sent: number;
  duplicate: number;
  blocked: number;
  failed: number;
};

export async function runOutboxWorker(deps: WorkerDeps): Promise<WorkerSummary> {
  const summary: WorkerSummary = { claimed: 0, sent: 0, duplicate: 0, blocked: 0, failed: 0 };
  const limit = Math.max(1, Math.min(deps.limit ?? 10, 25));
  // Reserva: prova do servidor com finalidade "claim", escopo fixado
  // (clínica + organização), carimbo de tempo e nonce de uso único. A
  // assinatura do despertador não é aceita aqui. Sem config ativa e escopo
  // correspondente, nada é reservado.
  const claimed = await deps.db.rpc("jornada_outbox_claim_signed", {
    ...(await buildProof(
      deps.claimKey,
      "claim",
      `${deps.orgFingerprint}:${deps.locationId}:${limit}`,
    )),
    _org_fp: deps.orgFingerprint,
    _location_id: deps.locationId,
    _limit: limit,
  });
  if (claimed.error) throw new Error("claim");

  const batch = Array.isArray(claimed.data) ? (claimed.data as unknown[]) : [];
  for (const raw of batch) {
    const parsed = batchItemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const { claim, chain } = splitBatchItem(parsed.data);
    summary.claimed += 1;

    // Reserva curta renovada antes de cada envio: o bilhete não vence no meio do lote.
    const renewed = await deps.db.rpc("jornada_outbox_renew_signed", {
      _id: claim.id,
      _lease: claim.lease_token,
      ...(await buildProof(deps.claimKey, "renew", `${claim.id}:${claim.lease_token}`)),
    });
    if (renewed.error || renewed.data !== true) continue;

    let outcome: { status: "sent" | "failed" | "blocked"; code: string | null; receipt?: string };
    try {
      const resolution = resolveDispatch(claim, chain, deps.locationId);
      if (!resolution.ok) {
        outcome = { status: "blocked", code: resolution.code };
      } else {
        // Repetir o mesmo event_id é idempotente: "duplicate" conta como confirmado.
        const receipt = await deps.send(resolution.input, resolution.source);
        outcome = { status: "sent", code: null, receipt: receipt.status };
      }
    } catch {
      // Nenhum detalhe do provedor é persistido ou registrado.
      outcome = { status: "failed", code: "envio_indisponivel" };
    }

    if (outcome.status === "sent") {
      if (outcome.receipt === "duplicate") summary.duplicate += 1;
      else summary.sent += 1;
    } else if (outcome.status === "blocked") summary.blocked += 1;
    else summary.failed += 1;

    const completed = await deps.db.rpc("jornada_outbox_complete_signed", {
      _id: claim.id,
      _lease: claim.lease_token,
      _status: outcome.status,
      _error: outcome.code,
      _receipt: outcome.receipt ?? null,
    });
    // Lease vencida ou reivindicada por outro trabalhador: a linha volta pela fila.
    if (completed.error) console.error("[jornada-outbox] conclusão recusada");
  }
  return summary;
}
