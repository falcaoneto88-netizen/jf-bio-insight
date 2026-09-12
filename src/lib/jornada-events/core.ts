import { z } from "zod";

export const eventType = z.enum(["anamnese_recebida", "relatorio_disponivel"]);
export const syncInput = z
  .object({
    consultationId: z.uuid("Identificador da consulta inválido."),
    recordId: z.uuid("Identificador da anamnese ou relatório inválido."),
    eventType,
    ghlContactId: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9_-]{1,128}$/, "Contato HighLevel inválido."),
    confirm: z.literal(true, "Confirme o vínculo e o envio com confirm: true."),
  })
  .strict();
export type SyncInput = z.infer<typeof syncInput>;

export type Source = {
  consultationId: string;
  patientId: string;
  recordId: string;
  occurredAt: string;
};
export function buildEvent(
  input: SyncInput,
  source: Source,
  config: {
    organizationId: string;
    locationId: string;
    keyId: string;
  },
  now = Date.now(),
) {
  syncInput.parse(input);
  if (source.consultationId !== input.consultationId || source.recordId !== input.recordId)
    throw new Error("O registro não pertence à consulta escolhida.");
  z.uuid().parse(source.patientId);
  z.uuid().parse(config.organizationId);
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(config.locationId) ||
    !/^[A-Za-z0-9_-]{1,64}$/.test(config.keyId)
  )
    throw new Error("Integração Jornada AI não configurada.");
  const time = Date.parse(source.occurredAt);
  if (!Number.isFinite(time) || time > now + 60000) throw new Error("Data do registro inválida.");
  return {
    version: 1,
    issuer: "https://jf-bio-insight.lovable.app",
    audience: "https://jornada-ai-conecta.lovable.app",
    key_id: config.keyId,
    organization_id: config.organizationId,
    location_id: config.locationId,
    event_id: `${input.eventType}:${source.recordId}`,
    event_type: input.eventType,
    consultation_id: source.consultationId,
    patient_id: source.patientId,
    record_id: source.recordId,
    ghl_contact_id: input.ghlContactId,
    occurred_at: new Date(time).toISOString(),
    issued_at: Math.floor(now / 1000),
  };
}
