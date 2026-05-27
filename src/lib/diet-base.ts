// Estrutura de dados da dieta-base "Dieta Base Dr. João".
// Todos os valores em quantidades-base; o ajustador (diet-adjuster.ts) reescalona
// conforme peso, perfil corporal e objetivo do paciente.

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
  // densidade de carbo g/100g — usado p/ opções de carbo (opcional, futuro)
  carbDensity?: number;
};

export type PickMode = "one" | "all" | "free";

export type MealBlock = {
  id: string;
  title: string;
  required: boolean;
  pick: PickMode;
  options: FoodOption[];
};

export type Meal = {
  id: "m1" | "m2" | "m3";
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

const PROTEIN_OPTIONS: FoodOption[] = [
  {
    id: "ovos",
    label: "ovos",
    baseGrams: 200,
    unit: "g",
    scalable: true,
    category: "protein",
    proteinDensity: 13,
  },
  {
    id: "frango",
    label: "frango grelhado",
    baseGrams: 160,
    unit: "g",
    scalable: true,
    category: "protein",
    proteinDensity: 31,
  },
  {
    id: "tilapia",
    label: "tilápia",
    baseGrams: 200,
    unit: "g",
    scalable: true,
    category: "protein",
    proteinDensity: 22,
  },
  {
    id: "carne_magra",
    label: "carne magra",
    baseGrams: 160,
    unit: "g",
    scalable: true,
    category: "protein",
    proteinDensity: 26,
  },
];

const CARB_OPTIONS: FoodOption[] = [
  {
    id: "batata_doce",
    label: "batata-doce",
    baseGrams: 120,
    unit: "g",
    scalable: true,
    category: "carb",
    carbDensity: 20,
  },
  {
    id: "macarrao_integral",
    label: "macarrão integral",
    baseGrams: 90,
    unit: "g",
    scalable: true,
    category: "carb",
    carbDensity: 70,
  },
  {
    id: "arroz_branco",
    label: "arroz branco",
    baseGrams: 100,
    unit: "g",
    scalable: true,
    category: "carb",
    carbDensity: 28,
  },
];

const VEG_BLOCK: MealBlock = {
  id: "vegetais",
  title: "Vegetais",
  required: true,
  pick: "all",
  options: [
    {
      id: "brocolis",
      label: "brócolis",
      baseGrams: 100,
      unit: "g",
      scalable: false,
      category: "veg",
    },
    {
      id: "folhas_verdes",
      label: "folhas verdes (livre)",
      baseGrams: null,
      unit: "g",
      scalable: false,
      category: "free",
    },
  ],
};

const LIQUID_OPTIONS: FoodOption[] = [
  {
    id: "whey",
    label: "whey isolado",
    baseGrams: 30,
    unit: "scoop",
    scalable: false,
    category: "liquid",
    proteinDensity: 80,
  },
  {
    id: "aveia",
    label: "aveia",
    baseGrams: 20,
    unit: "g",
    scalable: true,
    category: "liquid",
    carbDensity: 60,
  },
  {
    id: "banana",
    label: "banana média",
    baseGrams: 100,
    unit: "un",
    scalable: false,
    category: "liquid",
  },
  {
    id: "morangos",
    label: "morangos",
    baseGrams: 7,
    unit: "un",
    scalable: false,
    category: "liquid",
  },
];

const FAT_BLOCK: MealBlock = {
  id: "gorduras_boas",
  title: "Gorduras boas",
  required: true,
  pick: "one",
  options: [
    { id: "castanha_para", label: "castanha-do-pará", baseGrams: 5, unit: "g", scalable: false, category: "fat" },
    { id: "abacate", label: "abacate", baseGrams: 30, unit: "g", scalable: true, category: "fat" },
    { id: "azeite", label: "azeite extra virgem", baseGrams: 10, unit: "ml", scalable: true, category: "fat" },
    { id: "nozes", label: "nozes", baseGrams: 15, unit: "g", scalable: false, category: "fat" },
    { id: "avelas", label: "avelãs", baseGrams: 15, unit: "g", scalable: false, category: "fat" },
    { id: "amendoas", label: "amêndoas", baseGrams: 15, unit: "g", scalable: false, category: "fat" },
  ],
};

function mealMain(id: "m1" | "m3", name: string, time: string, includeFat: boolean): Meal {
  const blocks: MealBlock[] = [
    {
      id: "proteina",
      title: "Proteína",
      required: true,
      pick: "one",
      options: PROTEIN_OPTIONS,
    },
    {
      id: "carboidrato",
      title: "Carboidrato",
      required: true,
      pick: "one",
      options: CARB_OPTIONS,
    },
    VEG_BLOCK,
  ];
  if (id === "m1") {
    blocks.push({
      id: "liquida_m1",
      title: "Opção líquida",
      required: true,
      pick: "all",
      options: LIQUID_OPTIONS,
    });
  }
  if (includeFat) blocks.push(FAT_BLOCK);
  return { id, name, time, required: true, blocks };
}

export const DIETA_BASE_DR_JOAO: DietBase = {
  name: "Dieta Base Dr. João",
  meals: [
    mealMain("m1", "1ª Refeição", "12:00", false),
    {
      id: "m2",
      name: "2ª Refeição",
      time: "15:00",
      required: true,
      blocks: [
        {
          id: "liquida_m2",
          title: "Opção líquida",
          required: true,
          pick: "all",
          options: LIQUID_OPTIONS,
        },
      ],
    },
    mealMain("m3", "3ª Refeição", "19:00", true),
  ],
  generalRules: [
    "Salada verde livre em todas as refeições principais.",
    "Suco somente de limão.",
    "Bebidas zero liberadas com moderação.",
    "Beber no mínimo 2,5 L de água por dia.",
  ],
};
