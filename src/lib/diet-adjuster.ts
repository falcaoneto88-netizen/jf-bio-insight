import type { MainGoal } from "@/store/report-store";
import type { ProfileTag } from "@/lib/body-classifier";
import type {
  DietBase,
  FoodOption,
  Meal,
  MealBlock,
} from "@/lib/diet-base";

export type DietTargets = {
  proteinGPerKg: number;
  carbMultiplier: number;
  fatMultiplier: number;
  waterLitersPerDay: number;
  rationale: string[];
};

export type AdjustedFoodOption = FoodOption & {
  adjustedGrams: number | null;
  adjustedDisplay: string;
};

export type AdjustedMealBlock = Omit<MealBlock, "options"> & {
  options: AdjustedFoodOption[];
};

export type AdjustedMeal = Omit<Meal, "blocks"> & {
  blocks: AdjustedMealBlock[];
};

export type AdjustedDiet = {
  base: DietBase;
  targets: DietTargets;
  meals: AdjustedMeal[];
  generalRules: string[];
};

type ProfileKey = ProfileTag | MainGoal | "default";

const PROFILE_MATRIX: Record<
  ProfileKey,
  Omit<DietTargets, "waterLitersPerDay" | "rationale"> & { note: string }
> = {
  emagrecimento_metabolico_prioritario: {
    proteinGPerKg: 2.2,
    carbMultiplier: 0.7,
    fatMultiplier: 0.8,
    note: "Emagrecimento metabólico prioritário — déficit firme com proteção muscular.",
  },
  emagrecimento: {
    proteinGPerKg: 2.0,
    carbMultiplier: 0.8,
    fatMultiplier: 0.9,
    note: "Emagrecimento — déficit moderado com proteína alta.",
  },
  gordura_visceral_elevada: {
    proteinGPerKg: 2.0,
    carbMultiplier: 0.8,
    fatMultiplier: 0.9,
    note: "Gordura visceral elevada — redução de carbo refinado e gordura saturada.",
  },
  recomposicao: {
    proteinGPerKg: 2.0,
    carbMultiplier: 1.0,
    fatMultiplier: 1.0,
    note: "Recomposição — calorias próximas da manutenção.",
  },
  baixa_massa_muscular: {
    proteinGPerKg: 2.2,
    carbMultiplier: 1.1,
    fatMultiplier: 1.0,
    note: "Baixa massa muscular — leve superávit com proteína alta.",
  },
  ganho_massa: {
    proteinGPerKg: 1.9,
    carbMultiplier: 1.3,
    fatMultiplier: 1.1,
    note: "Ganho de massa — superávit calórico moderado.",
  },
  perfil_atletico: {
    proteinGPerKg: 1.8,
    carbMultiplier: 1.2,
    fatMultiplier: 1.0,
    note: "Perfil atlético — suporte à performance.",
  },
  manutencao: {
    proteinGPerKg: 1.8,
    carbMultiplier: 1.0,
    fatMultiplier: 1.0,
    note: "Manutenção — equilíbrio energético.",
  },
  alta_performance: {
    proteinGPerKg: 1.9,
    carbMultiplier: 1.2,
    fatMultiplier: 1.0,
    note: "Alta performance — suporte energético elevado.",
  },
  metabolismo_reduzido: {
    proteinGPerKg: 2.0,
    carbMultiplier: 0.85,
    fatMultiplier: 0.95,
    note: "Metabolismo adaptado — déficit suave para reativação.",
  },
  risco_metabolico_aumentado: {
    proteinGPerKg: 2.0,
    carbMultiplier: 0.8,
    fatMultiplier: 0.9,
    note: "Risco metabólico aumentado — controle de carbo refinado.",
  },
  "": {
    proteinGPerKg: 1.8,
    carbMultiplier: 1.0,
    fatMultiplier: 1.0,
    note: "Padrão — objetivo não informado.",
  },
  default: {
    proteinGPerKg: 1.8,
    carbMultiplier: 1.0,
    fatMultiplier: 1.0,
    note: "Padrão.",
  },
};

function roundTo(n: number, step: number): number {
  return Math.max(step, Math.round(n / step) * step);
}

function fmtGrams(label: string, grams: number, unit: FoodOption["unit"]): string {
  if (unit === "scoop") return `1 scoop de ${label} (${grams} g)`;
  if (unit === "un") return `${grams === 1 ? "1" : grams} ${label}`;
  if (unit === "ml") return `${grams} ml de ${label}`;
  return `${grams} g de ${label}`;
}

function defaultDisplay(opt: FoodOption): string {
  if (opt.baseGrams === null) return opt.label;
  return fmtGrams(opt.label, opt.baseGrams, opt.unit);
}

export function adjustDiet(
  base: DietBase,
  ctx: {
    weightKg: number | null;
    profile: ProfileTag | null;
    mainGoal: MainGoal;
  },
): AdjustedDiet {
  const key: ProfileKey =
    ctx.profile ??
    (ctx.mainGoal && PROFILE_MATRIX[ctx.mainGoal] ? ctx.mainGoal : "default");
  const matrix = PROFILE_MATRIX[key] ?? PROFILE_MATRIX.default;

  const water = ctx.weightKg
    ? Math.max(2.5, Math.round(ctx.weightKg * 0.035 * 10) / 10)
    : 2.5;

  const targets: DietTargets = {
    proteinGPerKg: matrix.proteinGPerKg,
    carbMultiplier: matrix.carbMultiplier,
    fatMultiplier: matrix.fatMultiplier,
    waterLitersPerDay: water,
    rationale: ctx.weightKg
      ? [matrix.note, `Hidratação alvo: ${water.toString().replace(".", ",")} L/dia.`]
      : ["Peso não informado — exibindo quantidades-base."],
  };

  // Distribuição proteica diária entre M1 e M3
  let proteinShareM1 = 0.5;
  let proteinShareM3 = 0.5;
  if (key === "emagrecimento" || key === "emagrecimento_metabolico_prioritario") {
    proteinShareM1 = 0.6;
    proteinShareM3 = 0.4;
  }

  const dailyProteinG = ctx.weightKg ? ctx.weightKg * targets.proteinGPerKg : null;
  // M2 (whey) entrega ~24 g; resto distribuído entre M1 e M3
  const remainingProtein = dailyProteinG !== null ? Math.max(0, dailyProteinG - 24) : null;

  const meals: AdjustedMeal[] = base.meals.map((meal) => {
    const blocks: AdjustedMealBlock[] = meal.blocks.map((block) => {
      const options: AdjustedFoodOption[] = block.options.map((opt) => {
        const adjusted = adjustOption(opt, {
          mealId: meal.id,
          blockCategory: opt.category,
          targets,
          remainingProtein,
          proteinShareM1,
          proteinShareM3,
        });
        return adjusted;
      });
      return { ...block, options };
    });
    return { ...meal, blocks };
  });

  return {
    base,
    targets,
    meals,
    generalRules: base.generalRules,
  };
}

function adjustOption(
  opt: FoodOption,
  args: {
    mealId: "m1" | "m2" | "m3";
    blockCategory: FoodOption["category"];
    targets: DietTargets;
    remainingProtein: number | null;
    proteinShareM1: number;
    proteinShareM3: number;
  },
): AdjustedFoodOption {
  const { mealId, targets, remainingProtein, proteinShareM1, proteinShareM3 } = args;

  // Sem escala possível → mantém base
  if (!opt.scalable || opt.baseGrams === null) {
    return {
      ...opt,
      adjustedGrams: opt.baseGrams,
      adjustedDisplay: defaultDisplay(opt),
    };
  }

  // Proteína — calcula gramas pela cota proteica da refeição
  if (opt.category === "protein" && opt.proteinDensity && remainingProtein !== null) {
    const share = mealId === "m1" ? proteinShareM1 : proteinShareM3;
    const proteinForMeal = remainingProtein * share;
    const grams = (proteinForMeal / opt.proteinDensity) * 100;
    const rounded = clamp(roundTo(grams, 10), 100, 260);
    return {
      ...opt,
      adjustedGrams: rounded,
      adjustedDisplay: fmtGrams(opt.label, rounded, opt.unit),
    };
  }

  // Carboidrato
  if (opt.category === "carb") {
    const grams = clamp(roundTo(opt.baseGrams * targets.carbMultiplier, 10), 60, 180);
    return {
      ...opt,
      adjustedGrams: grams,
      adjustedDisplay: fmtGrams(opt.label, grams, opt.unit),
    };
  }

  // Líquida M2 escalável (aveia)
  if (opt.category === "liquid") {
    const grams = clamp(roundTo(opt.baseGrams * targets.carbMultiplier, 5), 10, 40);
    return {
      ...opt,
      adjustedGrams: grams,
      adjustedDisplay: fmtGrams(opt.label, grams, opt.unit),
    };
  }

  // Gorduras (azeite/abacate)
  if (opt.category === "fat") {
    const grams = clamp(roundTo(opt.baseGrams * targets.fatMultiplier, 5), 5, 40);
    return {
      ...opt,
      adjustedGrams: grams,
      adjustedDisplay: fmtGrams(opt.label, grams, opt.unit),
    };
  }

  return {
    ...opt,
    adjustedGrams: opt.baseGrams,
    adjustedDisplay: defaultDisplay(opt),
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
