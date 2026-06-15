import type { DietBase } from "@/lib/diet-base";
import {
  CARBS_BREAKFAST,
  CARBS_DINNER,
  CARBS_LUNCH_MULTI,
  CARBS_SNACK_AFTERNOON,
  FAT_AZEITE,
  PROTEINS_ANIMAL,
  PROTEINS_BREAKFAST,
  PROTEIN_DINNER,
  PROTEIN_SNACK,
  PROTEIN_SNACK_AFTERNOON,
  VEGS_DINNER,
  VEGS_LUNCH,
  mkBlock,
} from "./shared-foods";

// Template oficial — Recomposição Corporal (Dr. João).
// 5 refeições, foco em proteína 2,0–2,4 g/kg e controle de gordura visceral.
export const DIET_RECOMPOSICAO: DietBase = {
  name: "Dieta Base Dr. João",
  meals: [
    {
      id: "cafe",
      name: "Café da manhã",
      time: "08:00",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEINS_BREAKFAST),
        mkBlock("carboidrato", "Carboidrato", CARBS_BREAKFAST),
      ],
    },
    {
      id: "lanche_manha",
      name: "Lanche da manhã",
      time: "10:30",
      required: true,
      blocks: [mkBlock("proteina", "Proteína", PROTEIN_SNACK)],
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
        mkBlock("carboidrato", "Carboidrato", CARBS_SNACK_AFTERNOON),
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
  ],
  generalRules: [
    "Proteína em todas as refeições (2,0–2,4 g/kg).",
    "Vegetais no almoço e jantar.",
    "Hidratação: peso × 40 ml/dia.",
    "Controle de gordura visceral — evitar ultraprocessados.",
    "Carboidratos distribuídos conforme meta calórica.",
  ],
};
