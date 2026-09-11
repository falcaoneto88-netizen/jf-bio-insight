/**
 * Evolução corporal: alinhamento por DATA real (nunca por índice de array).
 * Peso em kg; PGC comparado em PONTOS PERCENTUAIS (p.p.).
 * Uma única data não cria tendência.
 *
 * A transcrição literal (o que se mostra) é separada dos cálculos (o que se compara):
 * a tabela imprime exatamente o texto recebido, normalizado apenas na vírgula decimal.
 */
import { dateSortKey, decimalComma, signedDelta, toBrDate, toNumber } from "./format";
import type { Bio, BioHistoryRow } from "./types";

export type EvolutionPoint = {
  data: string; // DD/MM/AAAA
  sortKey: string;
  /** Transcrição literal, tal como fornecida (só a vírgula decimal é normalizada). */
  literal: { peso: string; massaMuscular: string; pgc: string };
  /** Apenas para cálculo de variações. */
  peso: number | null;
  massaMuscular: number | null;
  pgc: number | null;
};

export type EvolutionResult = {
  points: EvolutionPoint[];
  ignoredDates: string[];
  /** Datas inválidas cujas linhas TÊM valores — perda silenciosa se ignoradas. */
  ignoredDatesWithValues: string[];
  /** Conflitos entre linhas da mesma data — nunca resolvidos em silêncio. */
  conflicts: string[];
  hasTrend: boolean;
  deltaPesoKg: number | null;
  deltaMassaMuscularKg: number | null;
  deltaPgcPP: number | null;
  first: EvolutionPoint | null;
  last: EvolutionPoint | null;
  summaryLines: string[];
};

const CELLS = [
  { key: "peso", label: "peso" },
  { key: "massaMuscular", label: "massa muscular esquelética" },
  { key: "pgc", label: "PGC" },
] as const;

function toPoint(row: BioHistoryRow): EvolutionPoint | null {
  const sortKey = dateSortKey(row.data);
  if (!sortKey) return null;
  const literal = {
    peso: decimalComma(row.peso),
    massaMuscular: decimalComma(row.massaMuscularEsqueletica),
    pgc: decimalComma(row.pgc),
  };
  return {
    data: toBrDate(row.data),
    sortKey,
    literal,
    peso: toNumber(row.peso),
    massaMuscular: toNumber(row.massaMuscularEsqueletica),
    pgc: toNumber(row.pgc),
  };
}

export function computeEvolution(bio: Bio): EvolutionResult {
  const ignoredDates: string[] = [];
  const ignoredDatesWithValues: string[] = [];
  const conflicts: string[] = [];
  const byDate = new Map<string, EvolutionPoint>();

  for (const row of bio.historico ?? []) {
    const point = toPoint(row);
    if (!point) {
      if (row.data?.trim()) {
        ignoredDates.push(row.data.trim());
        const temValores = [row.peso, row.massaMuscularEsqueletica, row.pgc].some((v) =>
          String(v ?? "").trim(),
        );
        if (temValores) ignoredDatesWithValues.push(row.data.trim());
      }
      continue;
    }

    const existing = byDate.get(point.sortKey);
    if (!existing) {
      byDate.set(point.sortKey, point);
      continue;
    }
    // Linhas complementares da mesma data: preenche células vazias sem perder dados.
    for (const { key, label } of CELLS) {
      const prev = existing.literal[key];
      const next = point.literal[key];
      if (!next) continue;
      if (!prev) {
        existing.literal[key] = next;
        existing[key] = point[key];
        continue;
      }
      if (prev !== next) {
        conflicts.push(`${point.data}: valores diferentes de ${label} (${prev} e ${next}).`);
      }
    }
  }

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
    ignoredDatesWithValues,
    hasTrend,
    deltaPesoKg,
    deltaMassaMuscularKg,
    deltaPgcPP,
    first,
    last,
    summaryLines,
  };
}

/** Linhas prontas para tabela — transcrição literal, sem reconversão numérica. */
export function evolutionTableRows(result: EvolutionResult): string[][] {
  return result.points.map((p) => [p.data, p.literal.peso, p.literal.massaMuscular, p.literal.pgc]);
}
