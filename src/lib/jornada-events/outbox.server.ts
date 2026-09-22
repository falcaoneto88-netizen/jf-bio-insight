import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Source, SyncInput } from "./core";
import { batchItemSchema, resolveDispatch, splitBatchItem } from "./outbox";

/**
 * Trabalhador da fila: roda apenas no servidor, sem depender de aba aberta.
 * Não usa acesso privilegiado (service role): reserva e conclui pela assinatura
 * de uso único do despertador e pelo bilhete de reserva (lease/fencing).
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
  wakeup: Wakeup;
  limit?: number;
};

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
  // Reserva assinada: o banco verifica a assinatura de uso único, confere o
  // escopo fixado (clínica + organização) e devolve a reserva com bilhete
  // (lease) e a cadeia administrativa. Sem config ativa, nada é reservado.
  const claimed = await deps.db.rpc("jornada_outbox_claim_signed", {
    _epoch: deps.wakeup.ts,
    _nonce: deps.wakeup.nonce,
    _sig: deps.wakeup.sig,
    _org_fp: deps.orgFingerprint,
    _limit: Math.max(1, Math.min(deps.limit ?? 10, 25)),
  });
  if (claimed.error) throw new Error("wakeup");

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
