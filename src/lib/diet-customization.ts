// Customização do usuário sobre a Dieta Base Dr. João.
// Permite REMOVER itens originais e ADICIONAR itens livres por bloco,
// sem mutar a base e sem alterar a lógica de ajuste de gramas.

import type { DietBase, FoodOption, Meal, MealBlock } from "@/lib/diet-base";

export const DIET_BLOCK_KEYS = [
  "m1.proteina",
  "m1.carboidrato",
  "m1.vegetais",
  "m1.liquida_m1",
  "m2.liquida_m2",
  "m3.proteina",
  "m3.carboidrato",
  "m3.vegetais",
  "m3.gorduras_boas",
] as const;

export type DietBlockKey = (typeof DIET_BLOCK_KEYS)[number];

export const MAX_CUSTOM_ITEM_LABEL = 60;

export type CustomFoodItem = {
  id: string;
  label: string;
};

export type DietBlockOverride = {
  removedIds: string[];
  added: CustomFoodItem[];
};

export type DietCustomization = Partial<Record<DietBlockKey, DietBlockOverride>>;

export function makeBlockKey(mealId: Meal["id"], blockId: string): DietBlockKey | null {
  const k = `${mealId}.${blockId}` as DietBlockKey;
  return (DIET_BLOCK_KEYS as readonly string[]).includes(k) ? k : null;
}

export function emptyOverride(): DietBlockOverride {
  return { removedIds: [], added: [] };
}

export function normalizeDietCustomization(
  raw: unknown,
): DietCustomization {
  const out: DietCustomization = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of DIET_BLOCK_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
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
 * meal/block antes de filtrar (importante porque VEG_BLOCK e FAT_BLOCK são
 * compartilhados entre M1 e M3 na base).
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
