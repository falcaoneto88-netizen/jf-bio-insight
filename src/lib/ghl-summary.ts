// Resumo textual de um relatório, partilhado pela app e pelas ferramentas do assistente.

export type ReportSummaryInput = {
  patientName?: string | null;
  examDate?: string | null;
  mainGoal?: string | null;
  bodyClassification?: string | null;
  weight?: string | null;
  bodyFatPercentage?: string | null;
  skeletalMuscleMass?: string | null;
  visceralFatLevel?: string | null;
  basalMetabolicRate?: string | null;
};

const GOAL_LABELS: Record<string, string> = {
  jejum_intermitente: "Jejum intermitente",
  alta_performance: "Alta performance",
  recomposicao: "Recomposição corporal",
};

function line(label: string, value?: string | null): string | null {
  const v = (value ?? "").trim();
  return v ? `${label}: ${v}` : null;
}

export function buildReportNote(input: ReportSummaryInput): string {
  const goal = input.mainGoal ? (GOAL_LABELS[input.mainGoal] ?? input.mainGoal) : "";
  const rows = [
    line("Data do exame", input.examDate),
    line("Objetivo", goal),
    line("Classificação corporal", input.bodyClassification),
    line("Peso (kg)", input.weight),
    line("Gordura corporal (%)", input.bodyFatPercentage),
    line("Massa muscular esquelética (kg)", input.skeletalMuscleMass),
    line("Gordura visceral", input.visceralFatLevel),
    line("Metabolismo basal (kcal)", input.basalMetabolicRate),
  ].filter((r): r is string => r !== null);

  return [
    `Relatório BioReport Studio — ${input.patientName?.trim() || "Paciente"}`,
    ...rows,
  ].join("\n");
}
