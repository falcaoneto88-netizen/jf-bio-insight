import { consultationDb } from "@/lib/consultations/types";
import { requireAdminAccess, reportFailure } from "@/lib/access";
import { supabase } from "@/integrations/supabase/client";
import type { BodyCompositionData, ClinicalData } from "@/store/report-store";

export type ReportHistoryEntry = {
  id: string;
  consultationId?: string;
  anamnesisId?: string | null;
  patientName: string;
  examDate: string;
  generatedAt: string; // ISO
  mainGoal: string;
  bodyClassification: string;
  pdfFileName: string;
  // Snapshot completo para reabrir como "consulta de retorno"
  bodyComposition?: BodyCompositionData | null;
  clinicalData?: ClinicalData | null;
};

type ReportRow = {
  id: string;
  patient_name: string | null;
  exam_date: string | null;
  generated_at: string;
  main_goal: string | null;
  body_classification: string | null;
  pdf_file_name: string | null;
  body_composition: BodyCompositionData | null;
  clinical_data: ClinicalData | null;
};

function rowToEntry(r: ReportRow): ReportHistoryEntry {
  return {
    id: r.id,
    patientName: r.patient_name ?? "",
    examDate: r.exam_date ?? "",
    generatedAt: r.generated_at,
    mainGoal: r.main_goal ?? "",
    bodyClassification: r.body_classification ?? "",
    pdfFileName: r.pdf_file_name ?? "",
    bodyComposition: r.body_composition,
    clinicalData: r.clinical_data,
  };
}

function entryToRow(entry: Omit<ReportHistoryEntry, "id"> & { id?: string }) {
  return {
    ...(entry.id ? { id: entry.id } : {}),
    ...(entry.consultationId
      ? { consultation_id: entry.consultationId, anamnesis_id: entry.anamnesisId ?? null }
      : {}),
    patient_name: entry.patientName ?? "",
    exam_date: entry.examDate ?? "",
    generated_at: entry.generatedAt,
    main_goal: entry.mainGoal ?? "",
    body_classification: entry.bodyClassification ?? "",
    pdf_file_name: entry.pdfFileName ?? "",
    body_composition: entry.bodyComposition ?? null,
    clinical_data: entry.clinicalData ?? null,
  };
}

export async function getReportHistory(): Promise<ReportHistoryEntry[]> {
  await requireAdminAccess();
  const { data, error } = await supabase
    .from("reports")
    .select(
      "id, patient_name, exam_date, generated_at, main_goal, body_classification, pdf_file_name, body_composition, clinical_data",
    )
    .order("generated_at", { ascending: false })
    .limit(200);
  if (error) {
    return reportFailure(error);
  }
  await requireAdminAccess();
  return (data ?? []).map((r) => rowToEntry(r as unknown as ReportRow));
}

export async function addReportToHistory(
  entry: Omit<ReportHistoryEntry, "id">,
): Promise<ReportHistoryEntry> {
  await requireAdminAccess();
  const { data, error } = await consultationDb
    .from("reports")
    .insert(entryToRow(entry))
    .select(
      "id, patient_name, exam_date, generated_at, main_goal, body_classification, pdf_file_name, body_composition, clinical_data",
    )
    .single();
  if (error) {
    return reportFailure(error);
  }
  return rowToEntry(data as unknown as ReportRow);
}

export async function clearReportHistory(): Promise<void> {
  await requireAdminAccess();
  const { error } = await supabase.from("reports").delete().not("id", "is", null);
  if (error) {
    return reportFailure(error);
  }
  await requireAdminAccess();
}
