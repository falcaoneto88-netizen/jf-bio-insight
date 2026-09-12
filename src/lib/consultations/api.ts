import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { requireAdminAccess, AccessError } from "@/lib/access";
import { consultationDb as db, type Consultation, type ConsultationDraft } from "./types";
import { parseSavedAnswers } from "./mapping";
import { confirmationSchema } from "@/lib/anamnesis/form";
import type { Json } from "@/integrations/supabase/types";
import type { BodyCompositionData, ClinicalData } from "@/store/report-store";
const uuid = z.uuid();
export const newConsultationSchema = z.object({
  id: uuid,
  patientId: uuid,
  name: z.string().trim().min(2).max(150),
  email: z.union([z.email().max(254), z.literal("")]),
  date: z.iso.date(),
  existingPatient: z.boolean(),
});
export function databaseError(error: { code?: string }): Error {
  if (["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"].includes(error.code ?? ""))
    return new Error(
      "A estrutura de consultas ainda não está disponível no banco. A equipe precisa aplicar a migração antes de salvar.",
    );
  if (error.code === "42501")
    return new Error("Acesso restrito. Confira sua conta e a permissão para esta consulta.");
  return new Error(
    "Não foi possível salvar ou carregar a consulta. Confira sua conexão e tente novamente.",
  );
}
export async function listConsultations() {
  await requireAdminAccess();
  const [consultations, patients] = await Promise.all([
    db.from("consultations").select("*").order("created_at", { ascending: false }).limit(100),
    db.from("patients").select("*").order("name").limit(200),
  ]);
  if (consultations.error || patients.error)
    throw databaseError(consultations.error ?? patients.error!);
  await requireAdminAccess();
  return { consultations: consultations.data!, patients: patients.data! };
}
export async function createConsultation(input: z.infer<typeof newConsultationSchema>) {
  const a = newConsultationSchema.parse(input);
  await requireAdminAccess();
  const result = await db.rpc("create_patient_consultation", {
    _id: a.id,
    _patient_id: a.patientId,
    _name: a.name,
    _email: a.email,
    _date: a.date,
    _existing_patient: a.existingPatient,
  });
  if (result.error) throw databaseError(result.error);
  if (!result.data) throw databaseError({});
  return result.data;
}
export async function loadConsultation(id: string) {
  uuid.parse(id);
  await requireAdminAccess();
  const [c, draft, submissions, reports] = await Promise.all([
    db.from("consultations").select("*").eq("id", id).single(),
    db.from("consultation_drafts").select("*").eq("consultation_id", id).single(),
    db
      .from("anamnesis_submissions")
      .select("*")
      .eq("consultation_id", id)
      .order("confirmed_at", { ascending: false })
      .limit(30),
    db
      .from("reports")
      .select("id,generated_at,pdf_file_name,anamnesis_id")
      .eq("consultation_id", id)
      .order("generated_at", { ascending: false })
      .limit(30),
  ]);
  const error = c.error ?? draft.error ?? submissions.error ?? reports.error;
  if (error) throw databaseError(error);
  await requireAdminAccess();
  return {
    consultation: c.data!,
    draft: draft.data!,
    submissions: submissions.data!,
    reports: reports.data!,
  };
}
export async function saveConsultationDraft(
  id: string,
  version: number,
  patch: {
    bodyComposition?: BodyCompositionData;
    clinicalData?: ClinicalData;
    anamnesisId?: string | null;
  },
) {
  uuid.parse(id);
  z.number().int().min(0).max(2147483646).parse(version);
  if (patch.anamnesisId) uuid.parse(patch.anamnesisId);
  await requireAdminAccess();
  const updates: Partial<ConsultationDraft> = { version: version + 1 };
  if (patch.bodyComposition) updates.body_composition = patch.bodyComposition as unknown as Json;
  if (patch.clinicalData) updates.clinical_data = patch.clinicalData as unknown as Json;
  if (patch.anamnesisId !== undefined) updates.anamnesis_id = patch.anamnesisId;
  const result = await db
    .from("consultation_drafts")
    .update(updates)
    .eq("consultation_id", id)
    .eq("version", version)
    .select("version")
    .maybeSingle();
  if (result.error) throw databaseError(result.error);
  if (!result.data)
    throw new Error(
      "A consulta foi alterada em outra janela ou seu acesso mudou. Reabra a consulta antes de salvar; seu rascunho foi preservado.",
    );
  return result.data.version;
}
export async function loadPatientInvitation(id: string): Promise<Consultation> {
  uuid.parse(id);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new AccessError("expired");
  if (!sessionData.session) throw new Error("Entre para preencher a anamnese desta consulta.");
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user)
    throw new AccessError(
      error && error.status !== 401 && error.status !== 403 ? "unavailable" : "expired",
    );
  const c = await db.from("consultations").select("*").eq("id", id).maybeSingle();
  if (c.error) throw databaseError(c.error);
  if (!c.data)
    throw new Error(
      "Convite indisponível ou vencido. Entre com o e-mail informado à clínica ou solicite um novo convite.",
    );
  return c.data;
}
export async function submitAnamnesis(input: {
  id: string;
  consultationId: string;
  answers: unknown;
  name: string;
  accepted: boolean;
}) {
  uuid.parse(input.id);
  uuid.parse(input.consultationId);
  const answers = parseSavedAnswers(input.answers);
  const confirmation = confirmationSchema.parse({ name: input.name, accepted: input.accepted });
  await loadPatientInvitation(input.consultationId);
  const { error } = await db.from("anamnesis_submissions").insert({
    id: input.id,
    consultation_id: input.consultationId,
    answers,
    confirmed_name: confirmation.name,
    accepted: true,
  });
  // A retry of the same confirmed submission must not create a new version.
  if (error && error.code !== "23505") throw databaseError(error);
  const saved = await db
    .from("anamnesis_submissions")
    .select("id,confirmed_at,answers,confirmed_name")
    .eq("id", input.id)
    .eq("consultation_id", input.consultationId)
    .single();
  if (saved.error) throw databaseError(saved.error);
  if (
    JSON.stringify(parseSavedAnswers(saved.data.answers)) !== JSON.stringify(answers) ||
    saved.data.confirmed_name !== confirmation.name
  )
    throw new Error("Não foi possível confirmar esta versão. Reabra a consulta.");
  return saved.data;
}
