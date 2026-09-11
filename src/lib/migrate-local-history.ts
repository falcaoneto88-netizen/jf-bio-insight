import { supabase } from "@/integrations/supabase/client";
import type { ReportHistoryEntry } from "./report-history";

const LEGACY_KEY = "jf-bioreport-history";
const MIGRATED_FLAG = "jf-bioreport-history-migrated";

export async function migrateLocalHistoryToCloud(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    if (window.localStorage.getItem(MIGRATED_FLAG) === "true") return 0;
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) {
      window.localStorage.setItem(MIGRATED_FLAG, "true");
      return 0;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      window.localStorage.setItem(MIGRATED_FLAG, "true");
      return 0;
    }
    const rows = (parsed as ReportHistoryEntry[]).map((e) => ({
      id: e.id,
      patient_name: e.patientName ?? "",
      exam_date: e.examDate ?? "",
      generated_at: e.generatedAt ?? new Date().toISOString(),
      main_goal: e.mainGoal ?? "",
      body_classification: e.bodyClassification ?? "",
      pdf_file_name: e.pdfFileName ?? "",
      body_composition: e.bodyComposition ?? null,
      clinical_data: e.clinicalData ?? null,
    }));
    const { error } = await supabase
      .from("reports")
      .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
    if (error) {
      console.error("[reports] migration failed");
      return 0;
    }
    window.localStorage.setItem(MIGRATED_FLAG, "true");
    return rows.length;
  } catch (err) {
    console.error("[reports] migration error");
    return 0;
  }
}
