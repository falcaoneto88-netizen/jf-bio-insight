// Refeições adicionais opcionais (até 3) acrescentadas pelo usuário
// à Dieta Base Dr. João. São vazias e totalmente editáveis (nome, horário
// e itens livres) — não passam pelo ajuste de gramas.

import type { CustomFoodItem } from "@/lib/diet-customization";

export const MAX_EXTRA_MEALS = 3;
export const MAX_EXTRA_MEAL_ITEMS = 20;
export const MAX_EXTRA_MEAL_NAME = 40;
export const MAX_EXTRA_ITEM_LABEL = 60;

export type ExtraMeal = {
  id: string;
  name: string;
  time: string; // "HH:MM" ou ""
  items: CustomFoodItem[];
};

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function isValidTime(t: string): boolean {
  return t === "" || TIME_RE.test(t);
}

export function newExtraMealId(): string {
  return `extra_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function newExtraItemId(): string {
  return `extraitem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyExtraMeal(): ExtraMeal {
  return { id: newExtraMealId(), name: "", time: "", items: [] };
}

export function normalizeExtraMeals(raw: unknown): ExtraMeal[] {
  if (!Array.isArray(raw)) return [];
  const out: ExtraMeal[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Partial<ExtraMeal>;
    const id = typeof o.id === "string" && o.id ? o.id : newExtraMealId();
    const name =
      typeof o.name === "string" ? o.name.slice(0, MAX_EXTRA_MEAL_NAME) : "";
    const time =
      typeof o.time === "string" && isValidTime(o.time) ? o.time : "";
    const items: CustomFoodItem[] = Array.isArray(o.items)
      ? o.items
          .filter(
            (x): x is CustomFoodItem =>
              !!x &&
              typeof x === "object" &&
              typeof (x as CustomFoodItem).id === "string" &&
              typeof (x as CustomFoodItem).label === "string",
          )
          .slice(0, MAX_EXTRA_MEAL_ITEMS)
          .map((x) => ({
            id: x.id,
            label: x.label.slice(0, MAX_EXTRA_ITEM_LABEL),
          }))
      : [];
    out.push({ id, name, time, items });
    if (out.length >= MAX_EXTRA_MEALS) break;
  }
  return out;
}
