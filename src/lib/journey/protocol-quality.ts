/**
 * Qualidade dos protocolos GERADOS (generator preenchido).
 * Documentos legados e finais já aprovados não são avaliados aqui.
 *
 * Distinção obrigatória:
 * - pendências ESSENCIAIS (protocolEssentialIssues): bloqueiam a aprovação e
 *   não podem ser dispensadas no painel;
 * - avisos (protocolOpenWarnings): podem ser marcados como revistos.
 */
import { hideMealTimes } from "./meal-presentation";
import type { ProtocolBlock, Protocolo } from "./types";

const UNITS =
  "g|gr|gramas?|kg|mg|ml|l|litros?|un|und|unid|unidades?|colheres?|colher|fatias?|fatia|x[íi]caras?|scoops?|copos?|copo|porç(?:ão|ões)|porcao|porcoes|dose|doses|oz|cup|cups|tbsp|tsp|slices?|pieces?|piece|units?|ovos?|fil[ée]s?";

/** Porção válida: número positivo com unidade legível (ex.: "120 g", "1 unidade"). */
export function isValidPortion(text: string | undefined | null): boolean {
  const raw = String(text ?? "")
    .trim()
    .toLowerCase();
  if (!raw) return false;
  const fraction = /^(\d+\s+)?(\d+)\s*\/\s*(\d+)\s*(.+)$/.exec(raw);
  if (fraction) {
    const den = Number(fraction[3]);
    const num = Number(fraction[2]);
    if (!den || num <= 0) return false;
    return new RegExp(`^(${UNITS})\\b`, "i").test((fraction[4] ?? "").trim());
  }
  const match = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})\\b`, "i").exec(raw);
  if (!match) return false;
  return Number(String(match[1]).replace(",", ".")) > 0;
}

/** Substituição válida: alimento + porção positiva com unidade. */
export function isValidSubstitution(text: string): boolean {
  const raw = text.trim();
  if (raw.length < 3) return false;
  const withPortion = new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${UNITS})\\b`, "i").exec(raw);
  if (!withPortion) return false;
  if (Number(String(withPortion[1]).replace(",", ".")) <= 0) return false;
  // Precisa de nome de alimento além da porção.
  return raw.replace(withPortion[0], "").replace(/[^\p{L}]/gu, "").length >= 3;
}

function distinct(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

export function isGeneratedProtocol(protocolo: Protocolo | null | undefined): boolean {
  return Boolean(protocolo?.generator);
}

/** Preserva o marcador do gerador: não se contorna a validação apagando-o num patch. */
export function preserveGeneratorMarker(
  current: Protocolo | null | undefined,
  next: Protocolo,
): Protocolo {
  if (!current?.generator || next.generator) return next;
  return { ...next, generator: current.generator };
}

/* ---------------------- prescrições estruturadas ---------------------- */

export const REGENERATION_REQUIRED_ISSUE =
  "Os dados de entrada mudaram depois da geração (objetivo, meta, refeições, energia ou instruções). Gere o protocolo novamente antes de aprovar: o plano alimentar atual foi calculado com outros dados.";

/** Uma prescrição só entra no documento com substância, dose, via e frequência. */
export function prescriptionIsComplete(p: PrescriptionEntry): boolean {
  return Boolean(p.substancia.trim() && p.dose.trim() && p.via.trim() && p.frequencia.trim());
}

/** Identidade clínica da entrada: mudar qualquer destes campos anula a confirmação. */
export function prescriptionSignature(p: PrescriptionEntry): string {
  return [p.substancia, p.dose, p.via, p.frequencia]
    .map((v) => v.trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

/**
 * Regras do servidor, aplicadas mesmo a patches diretos: editar substância,
 * dose, via ou frequência retira a confirmação individual.
 */
export function applyPrescriptionRules(
  current: PrescriptionEntry[] | undefined,
  next: PrescriptionEntry[] | undefined,
): PrescriptionEntry[] | undefined {
  if (!next) return next;
  return next.map((entry, index) => {
    const before = current?.[index];
    if (!entry.confirmada) return entry;
    if (before && prescriptionSignature(before) !== prescriptionSignature(entry))
      return { ...entry, confirmada: false };
    return entry;
  });
}

export function protocolEssentialIssues(protocolo: Protocolo): string[] {
  const issues: string[] = [];

  if (protocolo.regenerationRequired) issues.push(REGENERATION_REQUIRED_ISSUE);

  const target = protocolo.energy?.targetKcal;
  if (!protocolo.energy || typeof target !== "number" || !(target > 0))
    issues.push(
      "Sem meta calórica válida: defina a meta profissional ou complete o cálculo interno antes de aprovar.",
    );

  const entradas = (protocolo.prescriptions ?? []).filter((p) => p.substancia.trim());
  for (const p of entradas.filter((p) => !p.confirmada))
    issues.push(
      `Prescrição por confirmar individualmente: ${p.substancia.trim()} ${p.dose.trim()}`.trim(),
    );
  for (const p of entradas.filter((p) => p.confirmada && !prescriptionIsComplete(p)))
    issues.push(
      `Prescrição incompleta: ${p.substancia.trim()} precisa de dose, via e frequência antes de ser confirmada.`,
    );


  const meals = protocolo.sections
    .flatMap((s) => s.blocks)
    .filter((b): b is Extract<ProtocolBlock, { type: "meal" }> => b.type === "meal");

  if (!meals.length) {
    issues.push("O protocolo gerado não tem refeições. Gere novamente ou edite antes de aprovar.");
    return issues;
  }
  if (protocolo.mealCount && meals.length !== protocolo.mealCount) {
    issues.push(
      `Foram pedidas ${protocolo.mealCount} refeições e o protocolo tem ${meals.length}. Corrija antes de aprovar.`,
    );
  }

  const allowedLiquid = new Set(protocolo.liquidMealNumbers ?? []);
  meals.forEach((meal, index) => {
    const n = index + 1;
    const foods = meal.foods.filter((f) => f.name.trim());
    if (!foods.length) issues.push(`Refeição ${n}: sem alimentos.`);
    if (foods.some((f) => !isValidPortion(f.quantity)))
      issues.push(
        `Refeição ${n}: há alimento sem porção válida (número positivo com unidade, ex.: 120 g).`,
      );
    if (meal.liquid && !allowedLiquid.has(n))
      issues.push(`Refeição ${n}: marcada como líquida sem indicação do profissional.`);

    const check = (label: string, raw: string[], required: boolean) => {
      if (!required && !raw.some((s) => s.trim())) return;
      const options = distinct(raw.filter((s) => s.trim()));
      if (options.length !== 3) {
        issues.push(
          `Refeição ${n}: são exigidas exatamente 3 substituições de ${label} distintas.`,
        );
        return;
      }
      if (options.some((o) => !isValidSubstitution(o)))
        issues.push(
          `Refeição ${n}: cada substituição de ${label} precisa de alimento e porção (ex.: 120 g de frango).`,
        );
    };
    check("proteína", meal.substitutions.protein, true);
    check("carboidrato", meal.substitutions.carbohydrate, true);
    // Gordura por categoria explícita do alimento, não por palavras soltas.
    const hasFat = foods.some((f) => f.category === "gordura");
    check("gordura", meal.substitutions.fat, hasFat);

    for (const food of foods) {
      if (hideMealTimes(food.name) !== food.name.trim())
        issues.push(`Refeição ${n}: retire horários do nome do alimento.`);
    }
  });
  return issues;
}

/** Compatibilidade: a completude do protocolo é o conjunto essencial. */
export const protocolCompletenessIssues = protocolEssentialIssues;

/** Avisos ainda abertos: os marcados como revistos saem da lista. */
export function protocolOpenWarnings(protocolo: Protocolo): string[] {
  const resolved = new Set((protocolo.pendenciasResolvidas ?? []).map((p) => p.trim()));
  const essential = new Set(protocolEssentialIssues(protocolo));
  return protocolo.pendencias.filter(
    (p) => p.trim() && !resolved.has(p.trim()) && !essential.has(p),
  );
}
