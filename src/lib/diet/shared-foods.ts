// Opções alimentares reutilizadas pelos 3 templates de dieta
// (jejum intermitente, alta performance, recomposição corporal).
// baseGrams são quantidades-padrão; o `diet-adjuster` aplica escalonamento
// (carbo e gordura) conforme peso/perfil clínico.

import type { FoodOption, MealBlock, PickMode } from "@/lib/diet-base";

export const PROTEINS_ANIMAL: FoodOption[] = [
  { id: "frango", label: "frango grelhado", baseGrams: 150, unit: "g", scalable: true, category: "protein", proteinDensity: 31 },
  { id: "tilapia", label: "tilápia grelhada", baseGrams: 180, unit: "g", scalable: true, category: "protein", proteinDensity: 22 },
  { id: "patinho", label: "patinho magro", baseGrams: 150, unit: "g", scalable: true, category: "protein", proteinDensity: 26 },
];

export const PROTEINS_BREAKFAST: FoodOption[] = [
  { id: "whey", label: "whey protein", baseGrams: 30, unit: "scoop", scalable: false, category: "protein", proteinDensity: 80 },
  { id: "ovos_inteiros", label: "ovos inteiros (3 un.)", baseGrams: 150, unit: "g", scalable: false, category: "protein", proteinDensity: 13 },
  { id: "iogurte_desnatado", label: "iogurte natural desnatado", baseGrams: 170, unit: "g", scalable: false, category: "protein", proteinDensity: 10 },
];

export const PROTEIN_SNACK: FoodOption[] = [
  { id: "whey", label: "whey protein", baseGrams: 30, unit: "scoop", scalable: false, category: "protein", proteinDensity: 80 },
  { id: "ovos_snack", label: "ovos (2 un.)", baseGrams: 100, unit: "g", scalable: false, category: "protein", proteinDensity: 13 },
  { id: "queijo_minas", label: "queijo minas", baseGrams: 60, unit: "g", scalable: false, category: "protein" },
];

export const PROTEIN_SNACK_AFTERNOON: FoodOption[] = [
  { id: "whey", label: "whey protein", baseGrams: 30, unit: "scoop", scalable: false, category: "protein", proteinDensity: 80 },
  { id: "ovos_snack", label: "ovos (2 un.)", baseGrams: 100, unit: "g", scalable: false, category: "protein", proteinDensity: 13 },
  { id: "iogurte_desnatado", label: "iogurte natural", baseGrams: 170, unit: "g", scalable: false, category: "protein", proteinDensity: 10 },
];

export const PROTEIN_DINNER: FoodOption[] = [
  { id: "tilapia", label: "tilápia", baseGrams: 180, unit: "g", scalable: true, category: "protein", proteinDensity: 22 },
  { id: "frango", label: "frango", baseGrams: 150, unit: "g", scalable: true, category: "protein", proteinDensity: 31 },
  { id: "salmao", label: "salmão", baseGrams: 150, unit: "g", scalable: true, category: "protein", proteinDensity: 20 },
];

export const PROTEIN_POS_TREINO: FoodOption[] = [
  { id: "whey", label: "whey protein", baseGrams: 30, unit: "scoop", scalable: false, category: "protein", proteinDensity: 80 },
  { id: "frango", label: "frango", baseGrams: 150, unit: "g", scalable: true, category: "protein", proteinDensity: 31 },
  { id: "tilapia", label: "tilápia", baseGrams: 180, unit: "g", scalable: true, category: "protein", proteinDensity: 22 },
];

export const CARBS_MAIN: FoodOption[] = [
  { id: "arroz_branco", label: "arroz branco", baseGrams: 100, unit: "g", scalable: true, category: "carb", carbDensity: 28 },
  { id: "batata_doce", label: "batata-doce", baseGrams: 120, unit: "g", scalable: true, category: "carb", carbDensity: 20 },
  { id: "mandioca", label: "mandioca", baseGrams: 100, unit: "g", scalable: true, category: "carb", carbDensity: 30 },
];

export const CARBS_LUNCH_MULTI: FoodOption[] = [
  { id: "arroz", label: "arroz", baseGrams: 100, unit: "g", scalable: true, category: "carb", carbDensity: 28 },
  { id: "feijao", label: "feijão", baseGrams: 80, unit: "g", scalable: true, category: "carb", carbDensity: 14 },
  { id: "batata_doce", label: "batata-doce", baseGrams: 120, unit: "g", scalable: true, category: "carb", carbDensity: 20 },
];

export const CARBS_DINNER: FoodOption[] = [
  { id: "arroz_integral", label: "arroz integral", baseGrams: 100, unit: "g", scalable: true, category: "carb", carbDensity: 25 },
  { id: "batata_doce", label: "batata-doce", baseGrams: 120, unit: "g", scalable: true, category: "carb", carbDensity: 20 },
  { id: "quinoa", label: "quinoa", baseGrams: 80, unit: "g", scalable: true, category: "carb", carbDensity: 21 },
];

export const CARBS_BREAKFAST: FoodOption[] = [
  { id: "aveia", label: "aveia", baseGrams: 30, unit: "g", scalable: true, category: "carb", carbDensity: 60 },
  { id: "banana", label: "banana", baseGrams: 100, unit: "un", scalable: false, category: "carb" },
  { id: "mamao", label: "mamão", baseGrams: 150, unit: "g", scalable: false, category: "carb" },
];

export const CARBS_PRE_POS: FoodOption[] = [
  { id: "banana", label: "banana", baseGrams: 100, unit: "un", scalable: false, category: "carb" },
  { id: "aveia", label: "aveia", baseGrams: 30, unit: "g", scalable: true, category: "carb", carbDensity: 60 },
  { id: "arroz_branco", label: "arroz branco", baseGrams: 100, unit: "g", scalable: true, category: "carb", carbDensity: 28 },
];

export const CARBS_SNACK_AFTERNOON: FoodOption[] = [
  { id: "aveia", label: "aveia", baseGrams: 30, unit: "g", scalable: true, category: "carb", carbDensity: 60 },
  { id: "banana", label: "banana", baseGrams: 100, unit: "un", scalable: false, category: "carb" },
  { id: "pera", label: "pera", baseGrams: 150, unit: "un", scalable: false, category: "carb" },
];

export const CARBS_SNACK_PERF: FoodOption[] = [
  { id: "aveia", label: "aveia", baseGrams: 30, unit: "g", scalable: true, category: "carb", carbDensity: 60 },
  { id: "banana", label: "banana", baseGrams: 100, unit: "un", scalable: false, category: "carb" },
  { id: "mamao", label: "mamão", baseGrams: 150, unit: "g", scalable: false, category: "carb" },
];

export const VEGS_LUNCH: FoodOption[] = [
  { id: "brocolis", label: "brócolis", baseGrams: 100, unit: "g", scalable: false, category: "veg" },
  { id: "tomate", label: "tomate", baseGrams: 80, unit: "g", scalable: false, category: "veg" },
];

export const VEGS_DINNER: FoodOption[] = [
  { id: "brocolis", label: "brócolis", baseGrams: 100, unit: "g", scalable: false, category: "veg" },
  { id: "abobrinha", label: "abobrinha", baseGrams: 100, unit: "g", scalable: false, category: "veg" },
  { id: "vagem", label: "vagem", baseGrams: 100, unit: "g", scalable: false, category: "veg" },
];

export const VEGS_JEJUM: FoodOption[] = [
  { id: "brocolis", label: "brócolis", baseGrams: 100, unit: "g", scalable: false, category: "veg" },
  { id: "cenoura", label: "cenoura", baseGrams: 80, unit: "g", scalable: false, category: "veg" },
  { id: "tomate", label: "tomate", baseGrams: 80, unit: "g", scalable: false, category: "veg" },
];

export const FAT_AZEITE: FoodOption[] = [
  { id: "azeite", label: "azeite extra virgem", baseGrams: 10, unit: "ml", scalable: true, category: "fat" },
];

export function mkBlock(
  id: string,
  title: string,
  options: FoodOption[],
  pick: PickMode = "one",
  pickCount?: number,
): MealBlock {
  const block: MealBlock = { id, title, required: true, pick, options };
  if (pickCount !== undefined) block.pickCount = pickCount;
  return block;
}
