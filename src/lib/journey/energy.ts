/**
 * Cálculo energético determinístico (interno).
 * Nada aqui é inventado pela IA: a fórmula, os fatores e os ajustes vêm de
 * dados do exame e de escolhas explícitas do profissional.
 *
 * Fórmula usada: Cunningham — TMB = 500 + 22 × MLG (massa livre de gordura, kg).
 * As entradas e o método ficam no painel profissional, nunca no documento do paciente.
 *
 * Meta escrita pelo profissional: é uma meta por si só (método "profissional").
 * Não inventa massa livre de gordura, fator nem manutenção para a justificar.
 */
import { z } from "zod";

import { dateSortKey } from "./format";
import type { Bio } from "./types";

export const FACTOR_MIN = 0.9;
export const FACTOR_MAX = 2.5;
export const ADJUST_MAX = 40;
export const TARGET_MIN = 400;
export const TARGET_MAX = 10000;

const calculatedPlanSchema = z.object({
  method: z.literal("cunningham"),
  ffmKg: z.number(),
  ffmOrigin: z.enum(["exame", "derivada", "informada"]),
  ffmFormula: z.string().max(200),
  bmrKcal: z.number(),
  activityFactor: z.number(),
  factorReviewed: z.literal(true),
  maintenanceKcal: z.number(),
  adjustmentPercent: z.number(),
  targetKcal: z.number(),
  /** Mantido tolerante para ler registos gravados antes desta correção. */
  source: z.enum(["calculado", "profissional"]).default("calculado"),
  professionalTarget: z.string().max(200).optional(),
});

const professionalPlanSchema = z.object({
  method: z.literal("profissional"),
  targetKcal: z.number(),
  professionalTarget: z.string().max(200),
  source: z.literal("profissional"),
});

export const energyPlanSchema = z.discriminatedUnion("method", [
  calculatedPlanSchema,
  professionalPlanSchema,
]);
export type EnergyPlan = z.infer<typeof energyPlanSchema>;

export const energyInputSchema = z.object({
  /** Fator de atividade escolhido e revisto pelo profissional (as instruções não definem tabela). */
  activityFactor: z.string().trim().max(20).optional(),
  factorReviewed: z.boolean().optional(),
  /** Ajuste em % sobre a manutenção: negativo = défice. */
  adjustmentPercent: z.string().trim().max(20).optional(),
  /** Meta calórica escrita pelo profissional; substitui o cálculo. */
  professionalTarget: z.string().trim().max(200).optional(),
  /** Massa livre de gordura escrita à mão, quando não vem do exame. */
  ffmManualKg: z.string().trim().max(20).optional(),
});
export type EnergyInput = z.infer<typeof energyInputSchema>;

export function parseDecimal(value: string | undefined | null): number | null {
  const raw = String(value ?? "")
    .trim()
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Meta calórica escrita pelo profissional: número claro em kcal.
 * Aceita "1800", "1800 kcal", "1800 kcal/dia" e "1.800 kcal"; recusa o resto.
 */
export function parseCalorieTarget(value: string | undefined | null): number | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*(kcal|calorias|cal)\s*(\/\s*(dia|day|día))?\.?$/u, "")
    .trim();
  const thousands = /^(\d{1,2})[.,](\d{3})$/.exec(raw);
  const digits = thousands ? `${thousands[1]}${thousands[2]}` : raw;
  if (!/^\d{1,5}$/.test(digits)) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < TARGET_MIN || n > TARGET_MAX) return null;
  return n;
}

export type FfmResolution = {
  ffmKg: number;
  origin: "exame" | "derivada" | "informada";
  formula: string;
} | null;

function validFfm(value: number | null): boolean {
  return value !== null && value > 0 && value < 200;
}

/**
 * Prioridade: valor escrito à mão → valor do exame → derivação peso × (1 − PGC/100).
 * Um valor presente mas inválido nunca é substituído em silêncio pela derivação.
 */
export function resolveFfmDetailed(source: {
  ffmExameKg?: string;
  ffmManualKg?: string;
  pesoKg?: string;
  pgc?: string;
}): { ffm: FfmResolution; issues: string[] } {
  const issues: string[] = [];
  const peso = parseDecimal(source.pesoKg);
  const pesoOk = peso !== null && peso > 0 && peso < 400;

  const check = (
    text: string | undefined,
    origin: "exame" | "informada",
    formula: string,
  ): { ffm: FfmResolution; issues: string[] } | null => {
    const written = String(text ?? "").trim();
    if (!written) return null;
    const value = parseDecimal(written);
    if (!validFfm(value)) {
      issues.push(
        origin === "informada"
          ? `Massa livre de gordura informada ("${written}") não é um valor válido em kg. Corrija antes de calcular.`
          : `Massa livre de gordura do exame ("${written}") não é um valor válido em kg. Corrija antes de calcular.`,
      );
      return { ffm: null, issues };
    }
    if (pesoOk && (value as number) > (peso as number)) {
      issues.push(
        `Conflito: a massa livre de gordura (${format1(value as number)} kg) é maior do que o peso (${format1(peso as number)} kg). Confira o exame.`,
      );
      return { ffm: null, issues };
    }
    return { ffm: { ffmKg: round1(value as number), origin, formula }, issues };
  };

  const manual = check(source.ffmManualKg, "informada", "Massa livre de gordura informada");
  if (manual) return manual;
  const exam = check(source.ffmExameKg, "exame", "Massa livre de gordura do exame");
  if (exam) return exam;

  const pgc = parseDecimal(source.pgc);
  if (pesoOk && pgc !== null && pgc >= 0 && pgc < 80) {
    return {
      ffm: {
        ffmKg: round1((peso as number) * (1 - pgc / 100)),
        origin: "derivada",
        formula: `Derivada: ${format1(peso as number)} kg × (1 − ${format1(pgc)}%/100)`,
      },
      issues,
    };
  }
  return { ffm: null, issues };
}

export function cunninghamBmr(ffmKg: number): number {
  return Math.round(500 + 22 * ffmKg);
}

export type EnergyResult = { plan: EnergyPlan | null; pendencias: string[] };

/**
 * Regras por objetivo:
 * - hipertrofia: manutenção (sem superávit nem défice automáticos);
 * - recomposição: défice escolhido pelo profissional entre 15% e 25%;
 * - emagrecimento: défice definido pelo profissional (1% a 40%, nunca por omissão).
 */
export function computeEnergyPlan(args: {
  objetivo: "hipertrofia" | "recomposicao" | "emagrecimento";
  ffm: FfmResolution;
  input: EnergyInput;
  /** Meta escrita noutro campo da interface (unificada com energyInput.professionalTarget). */
  professionalTarget?: string;
}): EnergyResult {
  const { objetivo, ffm, input } = args;
  const pendencias: string[] = [];
  const targetText = (input.professionalTarget ?? args.professionalTarget ?? "").trim();

  // 1) Meta explícita do profissional: vale por si, sem inventar MLG nem fator.
  if (targetText) {
    const targetKcal = parseCalorieTarget(targetText);
    if (targetKcal === null) {
      pendencias.push(
        `A meta calórica escrita ("${targetText}") não é um valor válido em kcal/dia (entre ${TARGET_MIN} e ${TARGET_MAX}). Corrija a meta ou apague-a para usar o cálculo.`,
      );
      return { plan: null, pendencias };
    }
    return {
      plan: {
        method: "profissional",
        targetKcal,
        professionalTarget: `${targetKcal} kcal/dia`,
        source: "profissional",
      },
      pendencias,
    };
  }

  // 2) Cálculo interno de Cunningham.
  if (!ffm) {
    pendencias.push(
      "Sem massa livre de gordura válida (do exame, informada ou derivada de peso com PGC): o cálculo energético não foi feito.",
    );
    return { plan: null, pendencias };
  }
  const factor = parseDecimal(input.activityFactor);
  const reviewed = input.factorReviewed === true;
  if (factor === null || !reviewed) {
    pendencias.push(
      "Defina e confirme o fator de atividade na interface: as instruções clínicas não fixam uma tabela de fatores.",
    );
    return { plan: null, pendencias };
  }
  if (factor < FACTOR_MIN || factor > FACTOR_MAX) {
    pendencias.push(
      `Fator de atividade fora do intervalo aceite (${format1(FACTOR_MIN)} a ${format1(FACTOR_MAX)}). Reveja o valor.`,
    );
    return { plan: null, pendencias };
  }

  const bmrKcal = cunninghamBmr(ffm.ffmKg);
  const maintenanceKcal = Math.round(bmrKcal * factor);
  const adjustmentRaw = parseDecimal(input.adjustmentPercent);
  let adjustmentPercent = 0;

  if (adjustmentRaw !== null && Math.abs(adjustmentRaw) > ADJUST_MAX) {
    pendencias.push(
      `Ajuste percentual fora do intervalo aceite (−${ADJUST_MAX}% a +${ADJUST_MAX}%). Reveja o valor.`,
    );
    return { plan: null, pendencias };
  }

  if (objetivo === "hipertrofia") {
    if (adjustmentRaw !== null && adjustmentRaw !== 0)
      pendencias.push(
        "Hipertrofia segue em manutenção: o ajuste percentual informado não foi aplicado automaticamente.",
      );
  } else if (objetivo === "recomposicao") {
    if (adjustmentRaw === null || Math.abs(adjustmentRaw) < 15 || Math.abs(adjustmentRaw) > 25) {
      pendencias.push(
        "Recomposição exige um ajuste escolhido entre 15% e 25% de défice. Nenhum valor foi assumido.",
      );
      return { plan: null, pendencias };
    }
    adjustmentPercent = -Math.abs(adjustmentRaw);
  } else {
    if (adjustmentRaw === null || adjustmentRaw === 0) {
      pendencias.push(
        "Emagrecimento: indique o défice percentual definido pelo profissional. Nenhum valor é assumido.",
      );
      return { plan: null, pendencias };
    }
    if (adjustmentRaw > 0) {
      pendencias.push(
        "Emagrecimento exige um défice (percentagem negativa). Reveja o ajuste indicado.",
      );
      return { plan: null, pendencias };
    }
    adjustmentPercent = adjustmentRaw;
  }

  const targetKcal = Math.round(maintenanceKcal * (1 + adjustmentPercent / 100));
  if (targetKcal < TARGET_MIN || targetKcal > TARGET_MAX) {
    pendencias.push(
      `O cálculo resultou em ${targetKcal} kcal/dia, fora do intervalo aceite (${TARGET_MIN} a ${TARGET_MAX}). Reveja a massa livre de gordura, o fator e o ajuste.`,
    );
    return { plan: null, pendencias };
  }

  return {
    plan: {
      method: "cunningham",
      ffmKg: ffm.ffmKg,
      ffmOrigin: ffm.origin,
      ffmFormula: ffm.formula,
      bmrKcal,
      activityFactor: factor,
      factorReviewed: true,
      maintenanceKcal,
      adjustmentPercent,
      targetKcal,
      source: "calculado",
    },
    pendencias,
  };
}

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
export function format1(value: number): string {
  return round1(value).toFixed(1).replace(".", ",");
}
/** Linha do documento do paciente: apenas a meta, nunca o método nem as entradas. */
export function energyTargetLine(plan: EnergyPlan | null): string {
  if (!plan) return "";
  if (plan.method === "profissional") return plan.professionalTarget.trim();
  return `${plan.targetKcal} kcal/dia`;
}

/** Resumo interno do painel profissional (nunca vai para o documento). */
export function energyInternalSummary(plan: EnergyPlan | null): string[] {
  if (!plan) return [];
  if (plan.method === "profissional")
    return [
      `Meta definida pelo profissional: ${plan.targetKcal} kcal/dia (substitui o cálculo interno).`,
    ];
  const origem =
    plan.ffmOrigin === "exame"
      ? "do exame"
      : plan.ffmOrigin === "informada"
        ? "informada por si"
        : "derivada de peso e PGC";
  return [
    `Massa livre de gordura: ${format1(plan.ffmKg)} kg (${origem}) — ${plan.ffmFormula}.`,
    `Cunningham: 500 + 22 × ${format1(plan.ffmKg)} = ${plan.bmrKcal} kcal/dia de taxa metabólica basal.`,
    `Manutenção: ${plan.bmrKcal} × ${format1(plan.activityFactor)} = ${plan.maintenanceKcal} kcal/dia.`,
    plan.adjustmentPercent === 0
      ? `Sem ajuste: meta igual à manutenção, ${plan.targetKcal} kcal/dia.`
      : `Ajuste de ${plan.adjustmentPercent}%: meta de ${plan.targetKcal} kcal/dia.`,
  ];
}

/**
 * Peso e PGC da MESMA data: a do exame atual, ou a data válida mais recente.
 * Posição na lista nunca decide; valores em conflito na mesma data bloqueiam.
 */
export function measuresForExam(bio: Bio): {
  pesoKg: string;
  pgc: string;
  date: string;
  issues: string[];
} {
  const empty = { pesoKg: "", pgc: "", date: "", issues: [] as string[] };
  if (bio.semExame) return empty;
  const rows = bio.historico
    .map((row) => ({
      ...row,
      key: dateSortKey(
        String(row.data)
          .trim()
          .split(/[\s,]+/)[0] ?? "",
      ),
    }))
    .filter((row) => row.key);
  if (!rows.length) return empty;

  const examKey = dateSortKey(
    String(bio.dataHoraExame ?? "")
      .trim()
      .split(/[\s,]+/)[0] ?? "",
  );
  const target =
    examKey && rows.some((r) => r.key === examKey)
      ? examKey
      : [...rows].sort((a, b) => a.key.localeCompare(b.key)).at(-1)!.key;

  const sameDate = rows.filter((r) => r.key === target);
  const issues: string[] = [];
  const pick = (field: "peso" | "pgc", label: string) => {
    const values = [...new Set(sameDate.map((r) => r[field].trim()).filter(Boolean))];
    if (values.length > 1) {
      issues.push(
        `Conflito no histórico: há mais de um valor de ${label} para a data ${sameDate[0]!.data}. Corrija antes de calcular.`,
      );
      return "";
    }
    return values[0] ?? "";
  };
  return {
    pesoKg: pick("peso", "peso"),
    pgc: pick("pgc", "percentual de gordura"),
    date: target,
    issues,
  };
}

/**
 * Cálculo completo a partir do exame e das escolhas do profissional.
 * Puro e partilhado: a interface mostra exatamente o que o servidor calcula.
 */
export function resolveEnergyForBio(args: {
  bio: Bio;
  objetivo: "hipertrofia" | "recomposicao" | "emagrecimento";
  energyInput?: EnergyInput;
  calorieTarget?: string;
}): EnergyResult & { ffm: FfmResolution } {
  const measures = measuresForExam(args.bio);
  const { ffm, issues } = resolveFfmDetailed({
    ffmExameKg: args.bio.semExame ? "" : (args.bio.massaLivreGorduraKg ?? ""),
    ffmManualKg: args.energyInput?.ffmManualKg ?? "",
    pesoKg: measures.pesoKg,
    pgc: measures.pgc,
  });
  const result = computeEnergyPlan({
    objetivo: args.objetivo,
    ffm,
    input: args.energyInput ?? {},
    ...(args.calorieTarget ? { professionalTarget: args.calorieTarget } : {}),
  });
  return {
    plan: result.plan,
    pendencias: [...measures.issues, ...issues, ...result.pendencias],
    ffm,
  };
}
