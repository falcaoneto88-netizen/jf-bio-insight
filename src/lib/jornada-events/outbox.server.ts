import type { SupabaseClient } from "@supabase/supabase-js";

import type { Source, SyncInput } from "./core";
import { claimSchema, resolveDispatch, type Chain, type OutboxClaim } from "./outbox";

/**
 * Trabalhador da fila: roda apenas no servidor, sem depender de aba aberta.
 * Não toca em conteúdo clínico e nunca registra segredos, cabeçalhos ou corpo.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type WorkerDeps = {
  db: Db;
  send: (input: SyncInput, source: Source) => Promise<{ status: "received" | "duplicate" }>;
  locationId: string;
  limit?: number;
  leaseSeconds?: number;
};

export type WorkerSummary = {
  claimed: number;
  sent: number;
  duplicate: number;
  blocked: number;
  failed: number;
};

async function readChain(db: Db, claim: OutboxClaim): Promise<Chain> {
  const submission = await db
    .from("anamnesis_submissions")
    .select("id,consultation_id,accepted,confirmed_at,invitation_id")
    .eq("id", claim.record_id)
    .maybeSingle();
  if (submission.error) throw new Error("db");
  const row = submission.data as Chain["submission"];
  if (!row) return { submission: null, consultation: null, links: [], invitation: null };

  const [consultation, invitation] = await Promise.all([
    db.from("consultations").select("id,patient_id").eq("id", row.consultation_id).maybeSingle(),
    row.invitation_id
      ? db
          .from("intake_invitations")
          .select("id,location_id,contact_id,consultation_id,revoked_at,submission_id")
          .eq("id", row.invitation_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (consultation.error || invitation.error) throw new Error("db");

  const patientId = (consultation.data as Chain["consultation"])?.patient_id;
  const links = patientId
    ? await db
        .from("ghl_patient_links")
        .select("location_id,contact_id,patient_id")
        .eq("patient_id", patientId)
        .limit(50)
    : { data: [], error: null };
  if (links.error) throw new Error("db");

  return {
    submission: row,
    consultation: consultation.data as Chain["consultation"],
    links: (links.data ?? []) as Chain["links"],
    invitation: invitation.data as Chain["invitation"],
  };
}

export async function runOutboxWorker(deps: WorkerDeps): Promise<WorkerSummary> {
  const summary: WorkerSummary = { claimed: 0, sent: 0, duplicate: 0, blocked: 0, failed: 0 };
  const claimed = await deps.db.rpc("jornada_outbox_claim", {
    _limit: Math.max(1, Math.min(deps.limit ?? 10, 25)),
    _lease_seconds: deps.leaseSeconds ?? 120,
  });
  if (claimed.error) throw new Error("claim");

  for (const raw of (claimed.data ?? []) as unknown[]) {
    const parsed = claimSchema.safeParse(raw);
    if (!parsed.success) continue;
    const claim = parsed.data;
    summary.claimed += 1;

    let outcome: { status: "sent" | "failed" | "blocked"; code: string | null; receipt?: string };
    try {
      const chain = await readChain(deps.db, claim);
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

    const completed = await deps.db.rpc("jornada_outbox_complete", {
      _id: claim.id,
      _lease: claim.lease_token,
      _status: outcome.status,
      _error: outcome.code,
      _receipt: outcome.receipt ?? null,
    });
    // Lease expirada ou reivindicada por outro trabalhador: a linha volta pela fila.
    if (completed.error) console.error("[jornada-outbox] conclusão recusada");
  }
  return summary;
}
