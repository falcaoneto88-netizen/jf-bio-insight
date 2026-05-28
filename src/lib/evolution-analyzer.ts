import type { BodyCompositionData, MainGoal } from "@/store/report-store";

export type Alignment = "positive" | "negative" | "neutral";
export type Direction = "up" | "down" | "flat";

export type EvolutionRow = {
  key: string;
  label: string;
  unit: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
  deltaPct: number | null;
  direction: Direction;
  alignment: Alignment;
};

function parseNum(v: string | undefined | null): number | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(",", ".").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Sinal "desejado" do delta para cada indicador, dado o objetivo principal.
// "down" = queremos que o valor diminua; "up" = queremos que aumente;
// "any" = neutro (sem julgamento).
type Desire = "down" | "up" | "any";

function desireFor(key: string, goal: MainGoal): Desire {
  switch (goal) {
    case "emagrecimento":
      if (key === "weight" || key === "bodyFatPercentage" || key === "visceralFat" || key === "bmi") return "down";
      if (key === "skeletalMuscleMass") return "any";
      return "any";
    case "recomposicao":
      if (key === "bodyFatPercentage" || key === "visceralFat") return "down";
      if (key === "skeletalMuscleMass") return "up";
      return "any";
    case "ganho_massa":
      if (key === "skeletalMuscleMass" || key === "weight") return "up";
      if (key === "visceralFat") return "down";
      return "any";
    case "manutencao":
      return "any";
    case "alta_performance":
      if (key === "skeletalMuscleMass") return "up";
      if (key === "visceralFat" || key === "bodyFatPercentage") return "down";
      return "any";
    default:
      return "any";
  }
}

function alignmentOf(direction: Direction, desire: Desire): Alignment {
  if (direction === "flat" || desire === "any") return "neutral";
  if (desire === "down" && direction === "down") return "positive";
  if (desire === "up" && direction === "up") return "positive";
  return "negative";
}

const INDICATORS: { key: keyof BodyCompositionData; label: string; unit: string; rowKey: string }[] = [
  { key: "weight", label: "Peso", unit: "kg", rowKey: "weight" },
  { key: "bmi", label: "IMC", unit: "kg/m2", rowKey: "bmi" },
  { key: "bodyFatPercentage", label: "% gordura corporal", unit: "%", rowKey: "bodyFatPercentage" },
  { key: "skeletalMuscleMass", label: "Massa muscular esquelética", unit: "kg", rowKey: "skeletalMuscleMass" },
  { key: "visceralFat", label: "Gordura visceral", unit: "", rowKey: "visceralFat" },
];

export function compareExams(
  current: BodyCompositionData | null | undefined,
  previous: BodyCompositionData | null | undefined,
  goal: MainGoal,
): EvolutionRow[] {
  if (!current || !previous) return [];
  const rows: EvolutionRow[] = [];
  for (const ind of INDICATORS) {
    const cur = parseNum(current[ind.key] as string);
    const prev = parseNum(previous[ind.key] as string);
    if (cur === null || prev === null) continue;
    const delta = +(cur - prev).toFixed(2);
    const deltaPct = prev !== 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : null;
    const direction: Direction =
      Math.abs(delta) < 1e-6 ? "flat" : delta > 0 ? "up" : "down";
    const alignment = alignmentOf(direction, desireFor(ind.rowKey, goal));
    rows.push({
      key: ind.rowKey,
      label: ind.label,
      unit: ind.unit,
      previous: prev,
      current: cur,
      delta,
      deltaPct,
      direction,
      alignment,
    });
  }
  return rows;
}

export function formatDelta(row: EvolutionRow): string {
  if (row.delta === null) return "-";
  const arrow = row.direction === "up" ? "^" : row.direction === "down" ? "v" : "=";
  const sign = row.delta > 0 ? "+" : "";
  const base = `${arrow} ${sign}${row.delta.toString().replace(".", ",")}`;
  return row.unit ? `${base} ${row.unit}` : base;
}
