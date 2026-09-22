import type { Journey, JourneyStep } from "@/lib/journey/types";

type AnalysisSummary = Pick<
  Journey,
  "id" | "version" | "approvedVersion" | "sourceCurrent" | "confirmations" | "protocolo"
>;

export type ConsultationPrimaryAction =
  | { kind: "analysis-loading"; label: "Conferindo análise…" }
  | { kind: "analysis-error"; label: "Tentar carregar análise" }
  | { kind: "refresh-analysis"; label: "Revisar dados atualizados"; journeyId: string }
  | { kind: "open-approved"; label: "Abrir protocolo aprovado"; journeyId: string }
  | { kind: "continue-analysis"; label: "Continuar análise"; journeyId: string }
  | { kind: "review-received"; label: "Revisar respostas recebidas" }
  | { kind: "start-analysis"; label: "Iniciar análise" }
  | { kind: "fill-anamnesis"; label: "Preencher anamnese" };

export function consultationPrimaryAction(input: {
  analysisPending: boolean;
  analysisError: boolean;
  analysis?: AnalysisSummary | null;
  hasReceivedAnamnesis: boolean;
  selectedAnamnesisApplied: boolean;
  hasClinicalData: boolean;
  hasBodyComposition: boolean;
}): ConsultationPrimaryAction {
  if (input.analysisPending) return { kind: "analysis-loading", label: "Conferindo análise…" };
  if (input.analysisError) return { kind: "analysis-error", label: "Tentar carregar análise" };

  if (input.analysis) {
    if (input.analysis.sourceCurrent === false) {
      return {
        kind: "refresh-analysis",
        label: "Revisar dados atualizados",
        journeyId: input.analysis.id,
      };
    }
    if (isCurrentApprovedProtocol(input.analysis)) {
      return {
        kind: "open-approved",
        label: "Abrir protocolo aprovado",
        journeyId: input.analysis.id,
      };
    }
    return {
      kind: "continue-analysis",
      label: "Continuar análise",
      journeyId: input.analysis.id,
    };
  }

  if (input.hasReceivedAnamnesis && !input.selectedAnamnesisApplied) {
    return { kind: "review-received", label: "Revisar respostas recebidas" };
  }

  if (input.hasClinicalData || input.hasBodyComposition || input.hasReceivedAnamnesis) {
    return { kind: "start-analysis", label: "Iniciar análise" };
  }

  return { kind: "fill-anamnesis", label: "Preencher anamnese" };
}

export function isCurrentApprovedProtocol(
  analysis: Pick<Journey, "approvedVersion" | "version" | "sourceCurrent">,
) {
  return analysis.approvedVersion === analysis.version && analysis.sourceCurrent !== false;
}

/** Estado do protocolo atual; PDFs históricos não indicam se esta análise já foi gerada. */
export function consultationReportState(input: {
  analysisPending: boolean;
  analysisError: boolean;
  analysis?: AnalysisSummary | null;
}): "loading" | "error" | "stale" | "approved" | "draft" | "missing" {
  if (input.analysisPending) return "loading";
  if (input.analysisError) return "error";
  if (!input.analysis) return "missing";
  if (input.analysis.sourceCurrent === false) return "stale";
  if (isCurrentApprovedProtocol(input.analysis)) return "approved";
  return input.analysis.protocolo?.sections.length ? "draft" : "missing";
}

export function journeyNaturalStep(journey: Journey): JourneyStep {
  if (isCurrentApprovedProtocol(journey)) return 6;
  if (journey.protocolo && journey.protocolo.sections.length > 0) return 5;
  if (journey.confirmations.revisao) return 4;
  if (journey.confirmations.bio) return 3;
  if (journey.confirmations.anamnese) return 2;
  return 1;
}

/**
 * Etapa de abertura quando o link pede uma etapa específica. Rascunho com
 * protocolo persistido pode abrir direto na etapa 6 (documento sai marcado
 * como RASCUNHO), sem marcar a aprovação como concluída. Sem protocolo, o
 * destino nunca passa do ponto natural da jornada.
 */
export function journeyInitialStep(
  journey: Journey,
  etapaInicial: JourneyStep | null | undefined,
): JourneyStep {
  const natural = journeyNaturalStep(journey);
  if (!etapaInicial) return natural;
  if (etapaInicial === 6 && journey.protocolo && journey.protocolo.sections.length > 0) return 6;
  return Math.min(etapaInicial, natural) as JourneyStep;
}

export function journeyCompletedSteps(journey: Journey): ReadonlySet<JourneyStep> {
  const completed = new Set<JourneyStep>();
  if (journey.confirmations.anamnese) completed.add(1);
  if (journey.confirmations.bio) completed.add(2);
  if (journey.confirmations.revisao) completed.add(3);
  if (journey.protocolo && journey.protocolo.sections.length > 0) completed.add(4);
  if (isCurrentApprovedProtocol(journey)) {
    completed.add(5);
  }
  return completed;
}
