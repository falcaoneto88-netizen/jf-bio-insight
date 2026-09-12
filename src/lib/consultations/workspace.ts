import { useReportStore, type BodyCompositionData, type ClinicalData } from "@/store/report-store";
import { saveConsultationDraft } from "./api";
export type ConsultationContext = {
  id: string;
  patientId: string;
  patientName: string;
  version: number;
  anamnesisId: string | null;
};
export async function saveActiveConsultation(patch: {
  bodyComposition?: BodyCompositionData;
  clinicalData?: ClinicalData;
  anamnesisId?: string | null;
}) {
  const c = useReportStore.getState().consultation;
  if (!c) return;
  const version = await saveConsultationDraft(c.id, c.version, patch);
  if (useReportStore.getState().consultation?.id === c.id)
    useReportStore.getState().setConsultation({
      ...c,
      version,
      anamnesisId: patch.anamnesisId !== undefined ? patch.anamnesisId : c.anamnesisId,
    });
}
