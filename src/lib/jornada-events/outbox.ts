import { z } from "zod";

import type { Source, SyncInput } from "./core";

/**
 * Núcleo puro da fila de avisos administrativos ao Jornada AI.
 * Sem rede, sem banco e sem segredos: apenas validação da cadeia persistida
 * subconta → contato → paciente → consulta → submissão (e convite, quando existe).
 */

export const claimSchema = z.object({
  id: z.uuid(),
  event_type: z.literal("anamnese_recebida"),
  record_id: z.uuid(),
  consultation_id: z.uuid(),
  scope_location_id: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  lease_token: z.uuid(),
});
export type OutboxClaim = z.infer<typeof claimSchema>;

export type SubmissionRow = {
  id: string;
  consultation_id: string;
  accepted: boolean;
  confirmed_at: string;
  invitation_id: string | null;
};
export type ConsultationRow = { id: string; patient_id: string };
export type LinkRow = { location_id: string; contact_id: string; patient_id: string };
export type InvitationRow = {
  id: string;
  location_id: string;
  contact_id: string;
  consultation_id: string;
  revoked_at: string | null;
  submission_id: string | null;
};

export type Chain = {
  submission: SubmissionRow | null;
  consultation: ConsultationRow | null;
  links: LinkRow[];
  invitation: InvitationRow | null;
};

export type Resolution =
  | { ok: true; input: SyncInput; source: Source }
  | { ok: false; code: string; blocked: boolean };

const blocked = (code: string): Resolution => ({ ok: false, code, blocked: true });

/** Decide se o aviso administrativo pode ser enviado. Nunca adivinha por nome ou e-mail. */
export function resolveDispatch(
  claim: OutboxClaim,
  chain: Chain,
  expectedLocationId: string,
): Resolution {
  if (!expectedLocationId || claim.scope_location_id !== expectedLocationId)
    return blocked("escopo_divergente");

  const s = chain.submission;
  if (!s || s.id !== claim.record_id || s.consultation_id !== claim.consultation_id)
    return blocked("registro_ausente");
  if (s.accepted !== true) return blocked("registro_nao_confirmado");
  if (!Number.isFinite(Date.parse(s.confirmed_at))) return blocked("data_invalida");

  const c = chain.consultation;
  if (!c || c.id !== claim.consultation_id) return blocked("consulta_ausente");
  if (!z.uuid().safeParse(c.patient_id).success) return blocked("paciente_invalido");

  const links = chain.links.filter(
    (l) => l.location_id === expectedLocationId && l.patient_id === c.patient_id,
  );
  const contacts = new Set(links.map((l) => l.contact_id));
  if (contacts.size === 0) return blocked("vinculo_ausente");
  if (contacts.size > 1) return blocked("vinculo_ambiguo");
  const contactId = [...contacts][0] as string;

  if (s.invitation_id) {
    const i = chain.invitation;
    if (!i || i.id !== s.invitation_id) return blocked("convite_ausente");
    if (
      i.location_id !== expectedLocationId ||
      i.consultation_id !== claim.consultation_id ||
      i.contact_id !== contactId ||
      (i.submission_id !== null && i.submission_id !== s.id)
    )
      return blocked("convite_divergente");
    if (i.revoked_at) return blocked("convite_revogado");
  }

  return {
    ok: true,
    input: {
      consultationId: claim.consultation_id,
      recordId: claim.record_id,
      eventType: "anamnese_recebida",
      ghlContactId: contactId,
      confirm: true,
    },
    source: {
      consultationId: c.id,
      patientId: c.patient_id,
      recordId: s.id,
      occurredAt: new Date(s.confirmed_at).toISOString(),
    },
  };
}

export const BLOCK_REASON: Record<string, string> = {
  escopo_divergente: "A clínica configurada mudou. Confira a integração antes de reenviar.",
  registro_ausente: "O registro da anamnese não foi encontrado nesta consulta.",
  registro_nao_confirmado: "A anamnese não está definitivamente confirmada.",
  data_invalida: "A data de confirmação registrada é inválida.",
  consulta_ausente: "A consulta vinculada não foi encontrada.",
  paciente_invalido: "O paciente da consulta não tem identificador válido.",
  vinculo_ausente: "Não há vínculo persistido entre o paciente e um contato da clínica.",
  vinculo_ambiguo: "Há mais de um contato vinculado a este paciente. Confira o cadastro.",
  convite_ausente: "O convite indicado na resposta não foi encontrado.",
  convite_divergente: "O convite não corresponde à consulta ou ao contato vinculado.",
  convite_revogado: "O convite desta resposta foi revogado.",
};

/** Situação da sincronização mostrada ao administrador, separada da etapa da anamnese. */
export type SyncState = "nao_aplicavel" | "pendente" | "confirmada" | "falha" | "pendencia_vinculo";

export const SYNC_LABEL: Record<SyncState, string> = {
  nao_aplicavel: "Sem aviso a enviar",
  pendente: "Aviso na fila",
  confirmada: "Aviso confirmado",
  falha: "Falha no envio — nova tentativa programada",
  pendencia_vinculo: "Pendência de vínculo — não enviado",
};

export type OutboxStatusRow = {
  consultation_id: string;
  record_id: string;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  next_attempt_at: string | null;
  last_error_code: string | null;
  sent_at: string | null;
  outbox_id: string;
};

export type SyncInfo = {
  state: SyncState;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  note: string | null;
  outboxId: string | null;
};

export const NOT_APPLICABLE: SyncInfo = {
  state: "nao_aplicavel",
  attempts: 0,
  lastAttemptAt: null,
  nextAttemptAt: null,
  note: null,
  outboxId: null,
};

/** Mapeia a linha persistida da fila para a situação exibida; nunca inventa vínculo. */
export function syncInfo(row: OutboxStatusRow | undefined): SyncInfo {
  if (!row) return NOT_APPLICABLE;
  const state: SyncState =
    row.status === "sent"
      ? "confirmada"
      : row.status === "blocked"
        ? "pendencia_vinculo"
        : row.status === "failed"
          ? "falha"
          : "pendente";
  return {
    state,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
    nextAttemptAt: state === "falha" ? row.next_attempt_at : null,
    note:
      state === "pendencia_vinculo"
        ? (BLOCK_REASON[row.last_error_code ?? ""] ??
          "Pendência de vínculo. Confira o cadastro do paciente.")
        : null,
    outboxId: row.outbox_id,
  };
}
