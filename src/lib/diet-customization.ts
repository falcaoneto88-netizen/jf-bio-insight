// Customização do usuário sobre a dieta-base ativa.
// Permite REMOVER itens originais e ADICIONAR itens livres por bloco,
// sem mutar a base e sem alterar a lógica de ajuste de gramas.
//
// As chaves de bloco são `${mealId}.${blockId}` e variam conforme o objetivo
// selecionado (cada template tem seu próprio conjunto de refeições/blocos).
// Por isso `DietBlockKey` é apenas `string` — a validação acontece no
// `applyDietCustomization` (overrides que não casam com nenhum bloco da base
// ativa simplesmente são ignorados).

import type { DietBase, FoodOption, Meal, MealBlock } from "@/lib/diet-base";
import { isValidTime } from "@/lib/extra-meals";

export const MAX_CUSTOM_ITEM_LABEL = 60;

export type DietBlockKey = string;

export type CustomFoodItem = {
  id: string;
  label: string;
};

export type DietBlockOverride = {
  removedIds: string[];
  added: CustomFoodItem[];
};

export type DietCustomization = Record<string, DietBlockOverride>;

export function makeBlockKey(
  mealId: string,
  blockId: string,
): DietBlockKey | null {
  if (!mealId || !blockId) return null;
  return `${mealId}.${blockId}`;
}

export function emptyOverride(): DietBlockOverride {
  return { removedIds: [], added: [] };
}

export function normalizeDietCustomization(raw: unknown): DietCustomization {
  const out: DietCustomization = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k.includes(".")) continue;
    if (!v || typeof v !== "object") continue;
    const obj = v as Partial<DietBlockOverride>;
    const removedIds = Array.isArray(obj.removedIds)
      ? obj.removedIds.filter((s): s is string => typeof s === "string")
      : [];
    const added = Array.isArray(obj.added)
      ? obj.added
          .filter(
            (x): x is CustomFoodItem =>
              !!x &&
              typeof x === "object" &&
              typeof (x as CustomFoodItem).id === "string" &&
              typeof (x as CustomFoodItem).label === "string",
          )
          .map((x) => ({
            id: x.id,
            label: x.label.slice(0, MAX_CUSTOM_ITEM_LABEL),
          }))
      : [];
    if (removedIds.length || added.length) {
      out[k] = { removedIds, added };
    }
  }
  return out;
}

export function newCustomItemId(): string {
  return `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function customToFoodOption(item: CustomFoodItem): FoodOption {
  return {
    id: item.id,
    label: item.label,
    baseGrams: null,
    unit: "g",
    scalable: false,
    category: "free",
  };
}

/**
 * Aplica overrides do usuário SEM mutar a base. Clona profundamente cada
 * meal/block antes de filtrar (importante porque blocos compartilhados
 * — vegetais, gorduras boas — podem aparecer em mais de uma refeição).
 */
export function applyDietCustomization(
  base: DietBase,
  custom: DietCustomization | null | undefined,
): DietBase {
  const c = custom ?? {};
  const meals: Meal[] = base.meals.map((meal) => {
    const blocks: MealBlock[] = meal.blocks.map((block) => {
      const key = makeBlockKey(meal.id, block.id);
      const override = key ? c[key] : undefined;
      const removed = new Set(override?.removedIds ?? []);
      const kept = block.options.filter((opt) => !removed.has(opt.id));
      const added = (override?.added ?? []).map(customToFoodOption);
      return { ...block, options: [...kept, ...added] };
    });
    return { ...meal, blocks };
  });
  return { ...base, meals };
}

export type MealTimeOverrides = Record<string, string>;

export function normalizeMealTimeOverrides(raw: unknown): MealTimeOverrides {
  const out: MealTimeOverrides = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || !k) continue;
    if (typeof v !== "string" || !isValidTime(v) || v === "") continue;
    out[k] = v;
  }
  return out;
}

/**
 * Substitui `meal.time` por override válido ("HH:MM"). Não muta a base.
 */
export function applyMealTimeOverrides(
  base: DietBase,
  overrides: MealTimeOverrides | null | undefined,
): DietBase {
  const o = overrides ?? {};
  const meals: Meal[] = base.meals.map((meal) => {
    const t = o[meal.id];
    if (t && isValidTime(t) && t !== "") return { ...meal, time: t };
    return meal;
  });
  return { ...base, meals };
}
