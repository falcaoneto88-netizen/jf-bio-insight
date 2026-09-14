import { z } from "zod";
export const INTAKE_WORKFLOW_ID = "7d031041-4aa6-42c7-b98d-28c8571d1b87";
export const INTAKE_LOCATION_ID = "ok2UHC2QMZsd8UHsAgEa";
export const INTAKE_ORIGIN = "https://jf-bio-insight.lovable.app";
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ghlId = z.string().regex(/^[a-zA-Z0-9_-]{10,100}$/);
export const issueRequestSchema = z.strictObject({
  location_id: z.literal(INTAKE_LOCATION_ID),
  workflow_id: z.literal(INTAKE_WORKFLOW_ID),
  contact_id: ghlId,
  appointment_id: ghlId,
});
export const invitationSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("submitted"), confirmed_at: z.iso.datetime({ offset: true }) }),
  z.object({
    status: z.literal("pending"),
    consultation_id: z.uuid(),
    patient_name: z.string().min(2).max(150),
    consultation_date: z.iso.date(),
    expires_at: z.iso.datetime({ offset: true }),
  }),
]);
export type Invitation = z.infer<typeof invitationSchema>;
export type PendingInvitation = Extract<Invitation, { status: "pending" }>;
export class IntakeError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function intakeDatabaseError(error: { code?: string }) {
  if (error.code === "22023")
    return new IntakeError(
      "invalid_data",
      "Confira o nome, a data e a confirmação da anamnese. Se o cadastro divergir, fale com a clínica.",
    );
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? ""))
    return new IntakeError(
      "not_installed",
      "O recebimento de anamneses ainda não está habilitado. Avise a clínica.",
      503,
    );
  if (error.code === "P0001")
    return new IntakeError("rate_limit", "Limite de convites atingido. Tente mais tarde.", 429);
  if (["P0003", "23505", "23503"].includes(error.code ?? ""))
    return new IntakeError(
      "conflict",
      "O convite já foi respondido ou os dados do agendamento mudaram. Peça à clínica para conferir.",
      409,
    );
  if (error.code === "42501")
    return new IntakeError(
      "unavailable",
      "Convite indisponível, vencido ou revogado. Solicite um novo link à clínica.",
      403,
    );
  return new IntakeError(
    "unavailable",
    "Não foi possível concluir. Confira a conexão e tente novamente.",
    503,
  );
}
