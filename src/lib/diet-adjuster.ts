import type { MainGoal, YesNo, YesNoNA } from "@/store/report-store";
import type { ProfileTag } from "@/lib/body-classifier";
import type {
  DietBase,
  FoodOption,
  Meal,
  MealBlock,
} from "@/lib/diet-base";
import type { ExtraMeal } from "@/lib/extra-meals";

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

export type AdjustedMeal = Omit<Meal, "blocks" | "id"> & {
  id: string;
  blocks: AdjustedMealBlock[];
  isExtra?: boolean;
};


export type Supplement = {
  name: string;
  dose: string;
  reason: string;
  mandatory: boolean;
};

export type DietAlert = {
  severity: "info" | "warning" | "risk";
  message: string;
};

export type AdjustedDiet = {
  base: DietBase;
  targets: DietTargets;
  meals: AdjustedMeal[];
  generalRules: string[];
  supplementation: Supplement[];
  alerts: DietAlert[];
  digestiveNotes: string[];
};

export type ClinicalContext = {
  gallbladderRemoved: YesNo;
  menopause: YesNoNA;
  currentlyTraining: YesNo;
  trainingTime: string;
  diabetes: YesNo;
  hypertension: YesNo;
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
    note: "Emagrecimento — proteína alta, carbo reduzido em 20% e vegetais livres.",
  },
  gordura_visceral_elevada: {
    proteinGPerKg: 2.0,
    carbMultiplier: 0.85,
    fatMultiplier: 0.9,
    note: "Gordura visceral elevada — sem carbo refinado, foco em vegetais e hidratação.",
  },
  recomposicao: {
    proteinGPerKg: 2.0,
    carbMultiplier: 1.0,
    fatMultiplier: 1.0,
    note: "Recomposição — proteína alta e carbo moderado próximo ao treino.",
  },
  baixa_massa_muscular: {
    proteinGPerKg: 2.3,
    carbMultiplier: 1.05,
    fatMultiplier: 1.0,
    note: "Baixa massa muscular — proteína reforçada (+15%) sem déficit calórico extremo.",
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
    carbMultiplier: 0.9,
    fatMultiplier: 0.95,
    note: "Metabolismo adaptado — evitar restrição agressiva, foco em força e constância.",
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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
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

function parseHourToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return h * 60 + min;
}

/** Peso de carbo por refeição conforme horário do treino. */
function computeCarbWeights(
  key: ProfileKey,
  clinical: ClinicalContext | null,
): { m1: number; m3: number } {
  const trainingFocusProfiles: ProfileKey[] = [
    "recomposicao",
    "ganho_massa",
    "perfil_atletico",
    "alta_performance",
    "baixa_massa_muscular",
  ];
  if (
    !clinical ||
    clinical.currentlyTraining !== "sim" ||
    !trainingFocusProfiles.includes(key)
  ) {
    return { m1: 1, m3: 1 };
  }
  const t = parseHourToMinutes(clinical.trainingTime);
  if (t === null) return { m1: 1, m3: 1 };
  const dM1 = Math.abs(t - 12 * 60);
  const dM3 = Math.abs(t - 19 * 60);
  if (dM1 <= dM3) return { m1: 1.2, m3: 0.9 };
  return { m1: 0.9, m3: 1.2 };
}

export function adjustDiet(
  base: DietBase,
  ctx: {
    weightKg: number | null;
    profile: ProfileTag | null;
    mainGoal: MainGoal;
    clinical: ClinicalContext | null;
  },
  extras?: ExtraMeal[],
): AdjustedDiet {
  const key: ProfileKey =
    ctx.profile ??
    (ctx.mainGoal && PROFILE_MATRIX[ctx.mainGoal] ? ctx.mainGoal : "default");

  const matrix = PROFILE_MATRIX[key] ?? PROFILE_MATRIX.default;

  const water = ctx.weightKg
    ? Math.max(2.5, Math.round(ctx.weightKg * 0.035 * 10) / 10)
    : 2.5;

  const rationale: string[] = ctx.weightKg
    ? [matrix.note, `Hidratação alvo: ${water.toString().replace(".", ",")} L/dia.`]
    : ["Peso não informado — exibindo quantidades-base."];

  const targets: DietTargets = {
    proteinGPerKg: matrix.proteinGPerKg,
    carbMultiplier: matrix.carbMultiplier,
    fatMultiplier: matrix.fatMultiplier,
    waterLitersPerDay: water,
    rationale,
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

  const carbWeights = computeCarbWeights(key, ctx.clinical);
  if (carbWeights.m1 !== 1 || carbWeights.m3 !== 1) {
    rationale.push(
      `Carbo concentrado na refeição mais próxima do treino (${
        carbWeights.m1 > carbWeights.m3 ? "12:00" : "19:00"
      }).`,
    );
  }

  // Gordura: vesícula → reduz M3 (e redistribui leve em M1 via aveia se disponível)
  const m3FatBonus =
    ctx.clinical?.gallbladderRemoved === "sim" ? 0.6 : 1.0;
  if (m3FatBonus < 1) {
    rationale.push("Vesícula retirada — gorduras reduzidas na 3ª refeição.");
  }

  // Visceral elevada: zera carbo da M2 (líquida)
  const m2CarbZero = key === "gordura_visceral_elevada";

  const meals: AdjustedMeal[] = base.meals.map((meal) => {
    const carbWeight =
      meal.id === "m1" ? carbWeights.m1 : meal.id === "m3" ? carbWeights.m3 : 1;
    const fatWeight = meal.id === "m3" ? m3FatBonus : 1;

    const blocks: AdjustedMealBlock[] = meal.blocks.map((block) => {
      const options: AdjustedFoodOption[] = block.options.map((opt) =>
        adjustOption(opt, {
          mealId: meal.id,
          targets,
          remainingProtein,
          proteinShareM1,
          proteinShareM3,
          carbWeight,
          fatWeight,
          m2CarbZero,
        }),
      );
      return { ...block, options };
    });
    return { ...meal, blocks };
  });

  const extraMeals: AdjustedMeal[] = (extras ?? [])
    .filter((e) => e.items.length > 0 || e.name.trim() || e.time.trim())
    .map((e, idx) => {
      const options: AdjustedFoodOption[] = e.items.map((item) => ({
        id: item.id,
        label: item.label,
        baseGrams: null,
        unit: "g",
        scalable: false,
        category: "free",
        adjustedGrams: null,
        adjustedDisplay: item.label,
      }));
      const ordinal = base.meals.length + idx + 1;
      return {
        id: e.id,
        name: e.name.trim() || `${ordinal}ª Refeição`,
        time: e.time.trim() || "—",
        required: true as const,
        isExtra: true,
        blocks: [
          {
            id: "itens",
            title: "Itens",
            required: false,
            pick: "free" as const,
            options,
          },
        ],
      };
    });

  const generalRules = buildGeneralRules(base, key, ctx.clinical);
  const supplementation = buildSupplementation(key, ctx.clinical);
  const alerts = buildAlerts(key, ctx.clinical);
  const digestiveNotes = buildDigestiveNotes(ctx.clinical);

  return {
    base,
    targets,
    meals: [...meals, ...extraMeals],
    generalRules,
    supplementation,
    alerts,
    digestiveNotes,
  };
}


function adjustOption(
  opt: FoodOption,
  args: {
    mealId: "m1" | "m2" | "m3";
    targets: DietTargets;
    remainingProtein: number | null;
    proteinShareM1: number;
    proteinShareM3: number;
    carbWeight: number;
    fatWeight: number;
    m2CarbZero: boolean;
  },
): AdjustedFoodOption {
  const {
    mealId,
    targets,
    remainingProtein,
    proteinShareM1,
    proteinShareM3,
    carbWeight,
    fatWeight,
    m2CarbZero,
  } = args;

  if (!opt.scalable || opt.baseGrams === null) {
    return {
      ...opt,
      adjustedGrams: opt.baseGrams,
      adjustedDisplay: defaultDisplay(opt),
    };
  }

  // Proteína
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

  // Carboidrato (refeições principais)
  if (opt.category === "carb") {
    const grams = clamp(
      roundTo(opt.baseGrams * targets.carbMultiplier * carbWeight, 10),
      60,
      180,
    );
    return {
      ...opt,
      adjustedGrams: grams,
      adjustedDisplay: fmtGrams(opt.label, grams, opt.unit),
    };
  }

  // Líquida M2 escalável (aveia)
  if (opt.category === "liquid") {
    if (m2CarbZero && opt.id === "aveia") {
      return {
        ...opt,
        adjustedGrams: 0,
        adjustedDisplay: `${opt.label}: opcional / remover (carbo apenas nas principais)`,
      };
    }
    const grams = clamp(roundTo(opt.baseGrams * targets.carbMultiplier, 5), 10, 40);
    return {
      ...opt,
      adjustedGrams: grams,
      adjustedDisplay: fmtGrams(opt.label, grams, opt.unit),
    };
  }

  // Gorduras
  if (opt.category === "fat") {
    const grams = clamp(
      roundTo(opt.baseGrams * targets.fatMultiplier * fatWeight, 5),
      5,
      40,
    );
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

function buildGeneralRules(
  base: DietBase,
  key: ProfileKey,
  clinical: ClinicalContext | null,
): string[] {
  const rules = [...base.generalRules];
  if (key === "emagrecimento" || key === "emagrecimento_metabolico_prioritario") {
    rules.push("Reduzir carboidratos em 20% — manter proteína alta e vegetais livres.");
  }
  if (key === "recomposicao") {
    rules.push("Concentrar carboidratos próximos ao horário do treino.");
  }
  if (key === "baixa_massa_muscular") {
    rules.push("Reforçar whey e creatina; evitar déficit calórico extremo.");
  }
  if (key === "gordura_visceral_elevada") {
    rules.push("Evitar carboidratos refinados; consumir carboidratos apenas nas refeições principais.");
    rules.push("Reforçar vegetais e hidratação.");
  }
  if (key === "metabolismo_reduzido") {
    rules.push("Evitar restrição calórica agressiva; priorizar treino de força e constância.");
    rules.push("Reavaliar evolução em 30 dias.");
  }
  if (clinical?.menopause === "sim") {
    rules.push("Menopausa: reduzir álcool e açúcar; foco em massa muscular e controle de gordura visceral.");
  }
  if (clinical?.gallbladderRemoved === "sim") {
    rules.push("Distribuir gorduras boas em pequenas quantidades ao longo do dia.");
  }
  return rules;
}

function buildSupplementation(
  key: ProfileKey,
  clinical: ClinicalContext | null,
): Supplement[] {
  const list: Supplement[] = [
    {
      name: "Whey isolado",
      dose: "30 g/dia",
      reason: "Reforço proteico (refeição líquida).",
      mandatory: false,
    },
  ];

  if (key === "recomposicao" || key === "baixa_massa_muscular" || key === "ganho_massa") {
    list.push({
      name: "Creatina monohidratada",
      dose: "3–5 g/dia",
      reason: "Suporte à hipertrofia e força.",
      mandatory: true,
    });
  }

  if (key === "baixa_massa_muscular") {
    list.push({
      name: "Whey isolado (2ª dose)",
      dose: "+30 g pós-treino",
      reason: "Reforço de síntese proteica.",
      mandatory: false,
    });
  }

  if (key === "gordura_visceral_elevada" || key === "emagrecimento_metabolico_prioritario") {
    list.push({
      name: "Ômega-3 (EPA/DHA)",
      dose: "2 g/dia",
      reason: "Redução de inflamação e gordura visceral.",
      mandatory: false,
    });
    list.push({
      name: "Fibras solúveis",
      dose: "5–10 g/dia",
      reason: "Saciedade e controle glicêmico.",
      mandatory: false,
    });
  }

  if (clinical?.menopause === "sim") {
    list.push({
      name: "Magnésio (bisglicinato)",
      dose: "300 mg/dia",
      reason: "Sono, humor e função muscular na menopausa.",
      mandatory: false,
    });
    list.push({
      name: "Ômega-3 (EPA/DHA)",
      dose: "2 g/dia",
      reason: "Suporte cardiovascular e anti-inflamatório.",
      mandatory: false,
    });
    list.push({
      name: "Vitamina D3 + K2",
      dose: "4000 UI D3 + 100 mcg K2",
      reason: "Saúde óssea e metabólica.",
      mandatory: false,
    });
  }

  if (clinical?.gallbladderRemoved === "sim") {
    list.push({
      name: "Enzimas digestivas (lipase)",
      dose: "1 cápsula nas refeições com gordura",
      reason: "Apoio digestivo após colecistectomia.",
      mandatory: false,
    });
  }

  // De-duplica por nome mantendo o primeiro com mandatory mais alto
  const seen = new Map<string, Supplement>();
  for (const s of list) {
    const prev = seen.get(s.name);
    if (!prev || (s.mandatory && !prev.mandatory)) seen.set(s.name, s);
  }
  return Array.from(seen.values());
}

function buildAlerts(
  key: ProfileKey,
  clinical: ClinicalContext | null,
): DietAlert[] {
  const alerts: DietAlert[] = [];
  if (key === "gordura_visceral_elevada" || key === "emagrecimento_metabolico_prioritario") {
    alerts.push({
      severity: "risk",
      message: "Risco metabólico aumentado — gordura visceral elevada.",
    });
  }
  if (key === "metabolismo_reduzido") {
    alerts.push({
      severity: "info",
      message: "Reavaliar composição corporal em 30 dias.",
    });
  }
  if (clinical?.gallbladderRemoved === "sim") {
    alerts.push({
      severity: "info",
      message: "Vesícula retirada — atenção à distribuição de gorduras ao longo do dia.",
    });
  }
  if (clinical?.menopause === "sim") {
    alerts.push({
      severity: "info",
      message: "Período de menopausa — foco em massa muscular e controle de gordura visceral.",
    });
  }
  if (clinical?.diabetes === "sim") {
    alerts.push({
      severity: "warning",
      message: "Diabetes — controlar carboidratos refinados e monitorar glicemia.",
    });
  }
  if (clinical?.hypertension === "sim") {
    alerts.push({
      severity: "warning",
      message: "Hipertensão — reduzir sódio e ultraprocessados.",
    });
  }
  return alerts;
}

function buildDigestiveNotes(clinical: ClinicalContext | null): string[] {
  const notes: string[] = [];
  if (clinical?.gallbladderRemoved === "sim") {
    notes.push(
      "Vesícula retirada: distribuir gorduras em pequenas quantidades; evitar refeições muito gordurosas e priorizar gorduras de melhor digestibilidade (azeite, abacate).",
    );
  }
  return notes;
}
