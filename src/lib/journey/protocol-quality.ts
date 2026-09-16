/**
 * Validação de completude dos protocolos GERADOS (generator preenchido).
 * Documentos legados e finais já aprovados não são avaliados aqui.
 */
import { hideMealTimes } from "./meal-presentation";
import type { ProtocolBlock, Protocolo } from "./types";

const quantity = /\d/;

export function isGeneratedProtocol(protocolo: Protocolo | null | undefined): boolean {
  return Boolean(protocolo?.generator);
}

export function protocolCompletenessIssues(protocolo: Protocolo): string[] {
  const issues: string[] = [];
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
  meals.forEach((meal, index) => {
    const n = index + 1;
    const foods = meal.foods.filter((f) => f.name.trim());
    if (!foods.length) issues.push(`Refeição ${n}: sem alimentos.`);
    if (foods.some((f) => !quantity.test(f.quantity)))
      issues.push(`Refeição ${n}: há alimento sem quantidade em g, ml ou unidades.`);
    const subs = meal.substitutions;
    const protein = subs.protein.filter((s) => s.trim());
    const carbohydrate = subs.carbohydrate.filter((s) => s.trim());
    const fat = subs.fat.filter((s) => s.trim());
    if (protein.length !== 3)
      issues.push(`Refeição ${n}: são exigidas exatamente 3 substituições de proteína.`);
    if (carbohydrate.length !== 3)
      issues.push(`Refeição ${n}: são exigidas exatamente 3 substituições de carboidrato.`);
    const hasFat = foods.some((f) =>
      /azeite|óleo|oleo|manteiga|castanh|abacate|am[eê]ndoa|nozes|gordura|pasta de amendoim|coco|gema/i.test(
        f.name,
      ),
    );
    if ((hasFat || fat.length) && fat.length !== 3)
      issues.push(
        `Refeição ${n}: há gordura prescrita, por isso são exigidas exatamente 3 substituições de gordura.`,
      );
    for (const food of foods) {
      if (hideMealTimes(food.name) !== food.name.trim())
        issues.push(`Refeição ${n}: retire horários do nome do alimento.`);
    }
  });
  return issues;
}
