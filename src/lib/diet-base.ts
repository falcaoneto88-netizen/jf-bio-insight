// Estrutura de dados das dietas-base Dr. João. Há 3 templates oficiais
// (jejum intermitente, alta performance, recomposição corporal) — cada um
// vive em src/lib/diet/*. O ajustador (diet-adjuster.ts) reescalona conforme
// peso, perfil corporal e objetivo do paciente.

export type FoodCategory = "protein" | "carb" | "veg" | "liquid" | "fat" | "free";

export type FoodOption = {
  id: string;
  label: string;
  baseGrams: number | null; // null → quantidade livre / fixa não escalonável
  unit: "g" | "ml" | "scoop" | "un";
  scalable: boolean;
  category: FoodCategory;
  // densidade proteica g/100g — usado p/ recalcular gramas em opções de proteína
  proteinDensity?: number;
  // densidade de carbo g/100g — usado p/ opções de carbo (opcional)
  carbDensity?: number;
};

export type PickMode = "one" | "all" | "free" | "multi";

export type MealBlock = {
  id: string;
  title: string;
  required: boolean;
  pick: PickMode;
  // Quantidade exigida quando pick === "multi" (ex.: "escolher 2").
  pickCount?: number;
  options: FoodOption[];
};

export type Meal = {
  id: string;
  name: string;
  time: string;
  required: true;
  blocks: MealBlock[];
};

export type DietBase = {
  name: "Dieta Base Dr. João";
  meals: Meal[];
  generalRules: string[];
};

// Reexport padrão usado por snapshots antigos do histórico e por testes/imports
// legados. Aponta para o template de recomposição (default seguro).
export { DIET_RECOMPOSICAO as DIETA_BASE_DR_JOAO } from "@/lib/diet/diet-recomposicao";
