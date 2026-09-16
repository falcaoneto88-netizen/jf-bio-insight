/**
 * Cálculo energético determinístico (interno).
 * Nada aqui é inventado pela IA: a fórmula, os fatores e os ajustes vêm de
 * dados do exame e de escolhas explícitas do profissional.
 *
 * Fórmula usada: Cunningham — TMB = 500 + 22 × MLG (massa livre de gordura, kg).
 * As entradas e o método ficam no painel profissional, nunca no documento do paciente.
 */
import { z } from "zod";

export const energyPlanSchema = z.object({
  method: z.literal("cunningham"),
  ffmKg: z.number(),
  ffmOrigin: z.enum(["exame", "derivada"]),
  ffmFormula: z.string().max(200),
  bmrKcal: z.number(),
  activityFactor: z.number(),
  factorReviewed: z.literal(true),
  maintenanceKcal: z.number(),
  adjustmentPercent: z.number(),
  targetKcal: z.number(),
  source: z.enum(["calculado", "profissional"]),
  professionalTarget: z.string().max(200).optional(),
});
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

export type FfmResolution =
  | { ffmKg: number; origin: "exame" | "derivada"; formula: string }
  | null;

/** MLG do exame; em alternativa, derivada de peso × (1 − PGC/100), com origem registada. */
export function resolveFfm(source: {
  ffmKg?: string;
  pesoKg?: string;
  pgc?: string;
}): FfmResolution {
  const direct = parseDecimal(source.ffmKg);
  if (direct !== null && direct > 0 && direct < 200)
    return { ffmKg: round1(direct), origin: "exame", formula: "Massa livre de gordura do exame" };
  const peso = parseDecimal(source.pesoKg);
  const pgc = parseDecimal(source.pgc);
  if (peso !== null && pgc !== null && peso > 0 && peso < 400 && pgc >= 0 && pgc < 80) {
    return {
      ffmKg: round1(peso * (1 - pgc / 100)),
      origin: "derivada",
      formula: `Derivada: ${format1(peso)} kg × (1 − ${format1(pgc)}%/100)`,
    };
  }
  return null;
}

export function cunninghamBmr(ffmKg: number): number {
  return Math.round(500 + 22 * ffmKg);
}

export type EnergyResult = { plan: EnergyPlan | null; pendencias: string[] };

/**
 * Regras por objetivo:
 * - hipertrofia: manutenção (sem superávit nem défice automáticos);
 * - recomposição: défice escolhido pelo profissional entre 15% e 25%;
 * - emagrecimento: ajuste definido pelo profissional (não há valor por omissão).
 */
export function computeEnergyPlan(args: {
  objetivo: "hipertrofia" | "recomposicao" | "emagrecimento";
  ffm: FfmResolution;
  input: EnergyInput;
}): EnergyResult {
  const { objetivo, ffm, input } = args;
  const pendencias: string[] = [];
  const manual = parseDecimal(input.ffmManualKg);
  const resolved: FfmResolution =
    ffm ??
    (manual !== null && manual > 0 && manual < 200
      ? { ffmKg: round1(manual), origin: "exame", formula: "Massa livre de gordura informada" }
      : null);
  const professionalTarget = input.professionalTarget?.trim();

  if (!resolved) {
    pendencias.push(
      "Sem massa livre de gordura no exame nem peso com PGC: o cálculo energético não foi feito.",
    );
  }
  const factor = parseDecimal(input.activityFactor);
  const reviewed = input.factorReviewed === true;
  if (!resolved || factor === null || !reviewed) {
    if (resolved && (factor === null || !reviewed))
      pendencias.push(
        "Defina e confirme o fator de atividade na interface: as instruções clínicas não fixam uma tabela de fatores.",
      );
    if (professionalTarget)
      pendencias.push(
        `Meta calórica definida pelo profissional em uso: ${professionalTarget}. O cálculo interno não foi concluído.`,
      );
    return { plan: null, pendencias };
  }
  if (factor <= 0.9 || factor > 2.5) {
    pendencias.push("Fator de atividade fora do intervalo aceite (0,9 a 2,5). Reveja o valor.");
    return { plan: null, pendencias };
  }

  const bmrKcal = cunninghamBmr(resolved.ffmKg);
  const maintenanceKcal = Math.round(bmrKcal * factor);
  const adjustmentRaw = parseDecimal(input.adjustmentPercent);
  let adjustmentPercent = 0;

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
    if (adjustmentRaw === null) {
      pendencias.push(
        "Emagrecimento: indique o ajuste percentual definido pelo profissional. Nenhum défice padrão é assumido.",
      );
      return { plan: null, pendencias };
    }
    adjustmentPercent = adjustmentRaw;
  }

  const calculated = Math.round(maintenanceKcal * (1 + adjustmentPercent / 100));
  const professionalNumber = professionalTarget ? parseDecimal(professionalTarget) : null;
  const source = professionalTarget ? ("profissional" as const) : ("calculado" as const);
  if (professionalTarget && professionalNumber === null)
    pendencias.push(
      `A meta calórica escrita ("${professionalTarget}") não é um número simples; o documento usa o texto tal como foi escrito.`,
    );

  return {
    plan: {
      method: "cunningham",
      ffmKg: resolved.ffmKg,
      ffmOrigin: resolved.origin,
      ffmFormula: resolved.formula,
      bmrKcal,
      activityFactor: factor,
      factorReviewed: true,
      maintenanceKcal,
      adjustmentPercent,
      targetKcal: professionalNumber ?? calculated,
      source,
      ...(professionalTarget ? { professionalTarget } : {}),
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
  if (plan.source === "profissional" && plan.professionalTarget)
    return plan.professionalTarget.trim();
  return `${plan.targetKcal} kcal/dia`;
}
