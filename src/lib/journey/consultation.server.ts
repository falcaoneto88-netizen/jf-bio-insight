import type { SupabaseClient } from "@supabase/supabase-js";
import type { BodyCompositionData, ClinicalData } from "@/store/report-store";
import type { Journey } from "./types";
import { contentHash, getJourney, JourneyError } from "./core.server";
import { consultationToJourney } from "./consultation-mapping";

// Acesso sempre pelo token do administrador; a RPC valida novamente auth/admin/dono.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = SupabaseClient<any, any, any>;

export async function readConsultationSource(sb: Sb, id: string) {
  const [consultation, draft, latest] = await Promise.all([
    sb
      .from("consultations")
      .select("id, patient_id, patient_name, consultation_date")
      .eq("id", id)
      .maybeSingle(),
    sb
      .from("consultation_drafts")
      .select("version, anamnesis_id, clinical_data, body_composition")
      .eq("consultation_id", id)
      .maybeSingle(),
    sb
      .from("anamnesis_submissions")
      .select("id")
      .eq("consultation_id", id)
      .order("confirmed_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (consultation.error || draft.error || latest.error)
    throw new JourneyError(
      "DB",
      "Não foi possível conferir os dados da consulta. Tente novamente.",
    );
  if (!consultation.data || !draft.data)
    throw new JourneyError("NOT_FOUND", "Consulta não encontrada ou acesso indisponível.");
  return { consultation: consultation.data, draft: draft.data, latestId: latest.data?.id ?? null };
}

export async function consultationSourceIsCurrent(sb: Sb, journey: Journey): Promise<boolean> {
  if (!journey.consultationId) return true;
  const source = await readConsultationSource(sb, journey.consultationId);
  return (
    source.draft.version === journey.sourceDraftVersion &&
    source.latestId === journey.sourceReceivedId
  );
}

export function assertCurrentConsultationSource(journey: Journey) {
  if (journey.consultationId && journey.sourceCurrent !== true)
    throw new JourneyError(
      "FONTE_DESATUALIZADA",
      "A consulta recebeu novos dados. Atualize a análise pela Consulta do paciente antes de continuar.",
    );
}

export async function findConsultationJourney(sb: Sb, ownerId: string, consultationId: string) {
  const { data, error } = await sb
    .from("jornadas_clinicas")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("consultation_id", consultationId)
    .maybeSingle();
  if (error) throw new JourneyError("DB", "Não foi possível carregar a análise da consulta.");
  return data ? getJourney(sb, ownerId, data.id) : null;
}

export async function openConsultationJourney(
  sb: Sb,
  ownerId: string,
  consultationId: string,
  refresh?: { id: string; expectedVersion: number },
) {
  const existing = await findConsultationJourney(sb, ownerId, consultationId);
  if (existing && !refresh) return existing;
  if (
    refresh &&
    (!existing || existing.id !== refresh.id || existing.version !== refresh.expectedVersion)
  )
    throw new JourneyError(
      "VERSAO_DESATUALIZADA",
      "A análise mudou. Reabra a consulta antes de atualizar.",
    );
  const source = await readConsultationSource(sb, consultationId);
  if (source.latestId && !source.draft.anamnesis_id)
    throw new JourneyError(
      "ANAMNESE_PENDENTE",
      "Reabra a Consulta do paciente para carregar a anamnese recebida antes de iniciar a análise.",
    );
  let answers: unknown | null = null;
  if (source.draft.anamnesis_id) {
    const submission = await sb
      .from("anamnesis_submissions")
      .select("answers")
      .eq("id", source.draft.anamnesis_id)
      .eq("consultation_id", consultationId)
      .maybeSingle();
    if (submission.error || !submission.data)
      throw new JourneyError(
        "ANAMNESE_INVALIDA",
        "Não foi possível conferir a anamnese vinculada a esta consulta.",
      );
    answers = submission.data.answers;
  }
  const mapped = consultationToJourney({
    patientName: source.consultation.patient_name,
    consultationDate: source.consultation.consultation_date,
    clinicalData: source.draft.clinical_data as ClinicalData | null,
    bodyComposition: source.draft.body_composition as BodyCompositionData | null,
    answers,
  });
  const { data, error } = await sb.rpc("open_consultation_journey", {
    _consultation_id: consultationId,
    _draft_version: source.draft.version,
    _received_id: source.latestId,
    _anamnese: mapped.anamnese,
    _bio: mapped.bio,
    _content_hash: await contentHash(mapped),
    _refresh_id: refresh?.id ?? null,
    _expected_version: refresh?.expectedVersion ?? null,
  });
  if (error) throw new JourneyError("DB", error.message);
  if (!data?.id) throw new JourneyError("DB", "Não foi possível abrir a análise da consulta.");
  return getJourney(sb, ownerId, data.id);
}
