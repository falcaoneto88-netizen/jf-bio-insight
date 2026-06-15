import type { DietBase } from "@/lib/diet-base";
import {
  CARBS_MAIN,
  FAT_AZEITE,
  PROTEINS_ANIMAL,
  VEGS_JEJUM,
  mkBlock,
} from "./shared-foods";

// Template oficial — Jejum Intermitente (Dr. João).
// Padrão 16/8 com janela 12:00–20:00 (editável posteriormente no DietEditorCard).
export const DIET_JEJUM: DietBase = {
  name: "Dieta Base Dr. João",
  meals: [
    {
      id: "quebra_jejum",
      name: "Refeição 1 — Quebra do jejum",
      time: "13:00",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEINS_ANIMAL),
        mkBlock("carboidrato", "Carboidrato", CARBS_MAIN),
        mkBlock("vegetais", "Vegetais", VEGS_JEJUM, "all"),
      ],
    },
    {
      id: "refeicao_2",
      name: "Refeição 2",
      time: "16:00",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEINS_ANIMAL),
        mkBlock("carboidrato", "Carboidrato", CARBS_MAIN),
        mkBlock("vegetais", "Vegetais", VEGS_JEJUM, "all"),
      ],
    },
    {
      id: "refeicao_3",
      name: "Refeição 3 — Encerramento da janela",
      time: "19:00",
      required: true,
      blocks: [
        mkBlock("proteina", "Proteína", PROTEINS_ANIMAL),
        mkBlock("carboidrato", "Carboidrato", CARBS_MAIN),
        mkBlock("vegetais", "Vegetais", VEGS_JEJUM, "all"),
        mkBlock("gorduras_boas", "Gordura boa", FAT_AZEITE),
      ],
    },
  ],
  generalRules: [
    "Janela alimentar padrão 16/8 (12:00 às 20:00) — ajustável conforme rotina.",
    "Proteína em todas as refeições.",
    "Vegetais no almoço e jantar.",
    "Hidratação: peso × 40 ml/dia.",
    "Pelo menos uma fonte de gordura boa por dia.",
    "Fora da janela: somente água, chá, café sem açúcar.",
  ],
};
