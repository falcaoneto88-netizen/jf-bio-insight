import { useReportStore, type BodyCompositionData, type ClinicalData } from "@/store/report-store";
import { loadConsultation, receivedAnamnesisPatch, saveConsultationDraft } from "./api";
import type { Json } from "@/integrations/supabase/types";
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
  const loaded = await loadConsultation(c.id);
  if (loaded.draft.version !== c.version)
    throw new Error(
      "A consulta foi alterada em outra janela. Reabra a consulta antes de salvar; seu rascunho foi preservado.",
    );
  const received = receivedAnamnesisPatch({
    ...loaded,
    draft: {
      ...loaded.draft,
      body_composition: (patch.bodyComposition ?? loaded.draft.body_composition) as Json | null,
      clinical_data: (patch.clinicalData ?? loaded.draft.clinical_data) as Json | null,
    },
  });
  const next = { ...patch, ...received };
  const version = await saveConsultationDraft(c.id, c.version, next);
  if (useReportStore.getState().consultation?.id === c.id) {
    useReportStore.setState({
      ...(next.clinicalData ? { clinicalData: next.clinicalData } : {}),
      consultation: {
        ...c,
        version,
        anamnesisId: next.anamnesisId !== undefined ? next.anamnesisId : c.anamnesisId,
      },
    });
  }
}
