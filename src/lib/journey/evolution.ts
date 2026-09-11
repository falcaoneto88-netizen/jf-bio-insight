/**
 * Evolução corporal: alinhamento por DATA real (nunca por índice de array).
 * Peso em kg; PGC comparado em PONTOS PERCENTUAIS (p.p.).
 * Uma única data não cria tendência.
 */
import { dateSortKey, decimalComma, signedDelta, toBrDate, toNumber } from "./format";
import type { Bio, BioHistoryRow } from "./types";

export type EvolutionPoint = {
  data: string; // DD/MM/AAAA
  sortKey: string;
  peso: number | null;
  massaMuscular: number | null;
  pgc: number | null;
};

export type EvolutionResult = {
  points: EvolutionPoint[];
  ignoredDates: string[];
  hasTrend: boolean;
  deltaPesoKg: number | null;
  deltaMassaMuscularKg: number | null;
  deltaPgcPP: number | null;
  first: EvolutionPoint | null;
  last: EvolutionPoint | null;
  summaryLines: string[];
};

function toPoint(row: BioHistoryRow): EvolutionPoint | null {
  const sortKey = dateSortKey(row.data);
  if (!sortKey) return null;
  return {
    data: toBrDate(row.data),
    sortKey,
    peso: toNumber(row.peso),
    massaMuscular: toNumber(row.massaMuscularEsqueletica),
    pgc: toNumber(row.pgc),
  };
}

export function computeEvolution(bio: Bio): EvolutionResult {
  const ignoredDates: string[] = [];
  const points: EvolutionPoint[] = [];

  for (const row of bio.historico ?? []) {
    const point = toPoint(row);
    if (!point) {
      if (row.data?.trim()) ignoredDates.push(row.data.trim());
      continue;
    }
    points.push(point);
  }

  // Alinhamento por data real: agrupa por chave de data, mantém a última leitura.
  const byDate = new Map<string, EvolutionPoint>();
  for (const point of points) byDate.set(point.sortKey, point);
  const ordered = [...byDate.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const first = ordered[0] ?? null;
  const last = ordered.length > 1 ? ordered[ordered.length - 1]! : null;
  const hasTrend = ordered.length >= 2;

  const delta = (a: number | null | undefined, b: number | null | undefined) =>
    hasTrend && a != null && b != null ? b - a : null;

  const deltaPesoKg = delta(first?.peso, last?.peso);
  const deltaMassaMuscularKg = delta(first?.massaMuscular, last?.massaMuscular);
  const deltaPgcPP = delta(first?.pgc, last?.pgc);

  const summaryLines: string[] = [];
  if (hasTrend && first && last) {
    summaryLines.push(`Período comparado: ${first.data} a ${last.data}.`);
    if (deltaPesoKg != null) summaryLines.push(`Peso: ${signedDelta(deltaPesoKg, 1)} kg.`);
    if (deltaMassaMuscularKg != null) {
      summaryLines.push(`Massa muscular esquelética: ${signedDelta(deltaMassaMuscularKg, 1)} kg.`);
    }
    if (deltaPgcPP != null) {
      summaryLines.push(`Percentual de gordura corporal: ${signedDelta(deltaPgcPP, 1)} p.p.`);
    }
  }

  return {
    points: ordered,
    ignoredDates,
    hasTrend,
    deltaPesoKg,
    deltaMassaMuscularKg,
    deltaPgcPP,
    first,
    last,
    summaryLines,
  };
}

/** Linhas prontas para tabela (valores já com vírgula decimal). */
export function evolutionTableRows(result: EvolutionResult): string[][] {
  return result.points.map((p) => [
    p.data,
    p.peso == null ? "" : decimalComma(String(p.peso)),
    p.massaMuscular == null ? "" : decimalComma(String(p.massaMuscular)),
    p.pgc == null ? "" : decimalComma(String(p.pgc)),
  ]);
}
