import type { DietBase } from "@/lib/diet-base";
import {
  CARBS_DINNER,
  CARBS_LUNCH_MULTI,
  CARBS_PRE_POS,
  CARBS_SNACK_PERF,
  FAT_AZEITE,
  PROTEINS_ANIMAL,
  PROTEINS_BREAKFAST,
  PROTEIN_DINNER,
  PROTEIN_POS_TREINO,
  PROTEIN_SNACK,
  PROTEIN_SNACK_AFTERNOON,
  VEGS_DINNER,
  VEGS_LUNCH,
  mkBlock,
} from "./shared-foods";

// Template oficial — Alta Performance (Dr. João).
// 6 refeições, foco em peri-treino e recuperação. Hidratação 45–50 ml/kg.
export const DIET_ALTA_PERFORMANCE: DietBase = {
  name: "Dieta Base Dr. João",
  meals: [
    {
      id: "pre_treino",
      name: "Pré-treino",
      time: "06:30",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEINS_BREAKFAST),
        mkBlock("carboidrato", "Carboidrato", CARBS_PRE_POS),
      ],
    },
    {
      id: "pos_treino",
      name: "Pós-treino",
      time: "09:00",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEIN_POS_TREINO),
        mkBlock("carboidrato", "Carboidrato", CARBS_PRE_POS),
      ],
    },
    {
      id: "almoco",
      name: "Almoço",
      time: "13:00",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEINS_ANIMAL),
        mkBlock("carboidrato", "Carboidrato", CARBS_LUNCH_MULTI, "multi", 2),
        mkBlock("vegetais", "Vegetais", VEGS_LUNCH, "all"),
        mkBlock("gorduras_boas", "Gordura boa", FAT_AZEITE),
      ],
    },
    {
      id: "lanche_tarde",
      name: "Lanche da tarde",
      time: "16:30",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEIN_SNACK_AFTERNOON),
        mkBlock("carboidrato", "Carboidrato", CARBS_SNACK_PERF),
      ],
    },
    {
      id: "jantar",
      name: "Jantar",
      time: "19:30",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEIN_DINNER),
        mkBlock("carboidrato", "Carboidrato", CARBS_DINNER),
        mkBlock("vegetais", "Vegetais", VEGS_DINNER, "all"),
        mkBlock("gorduras_boas", "Gordura boa", FAT_AZEITE),
      ],
    },
    {
      id: "ceia",
      name: "Ceia",
      time: "22:00",
      required: true,
      blocks: [mkBlock("proteina", "Proteína", PROTEIN_SNACK)],
    },
  ],
  generalRules: [
    "Pré e pós-treino obrigatórios.",
    "Proteína em todas as refeições (1,8–2,2 g/kg).",
    "Carboidrato elevado ao redor do treino.",
    "Hidratação: peso × 45–50 ml/dia.",
    "Priorizar recuperação muscular e sono ≥ 7h.",
  ],
};
