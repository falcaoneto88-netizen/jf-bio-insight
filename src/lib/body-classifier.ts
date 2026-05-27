import type {
  BodyCompositionData,
  ClinicalData,
  Sex,
} from "@/store/report-store";

export type ProfileTag =
  | "emagrecimento"
  | "emagrecimento_metabolico_prioritario"
  | "recomposicao"
  | "ganho_massa"
  | "baixa_massa_muscular"
  | "gordura_visceral_elevada"
  | "metabolismo_reduzido"
  | "perfil_atletico"
  | "risco_metabolico_aumentado";

export type ClassificationFlags = {
  highBodyFat: boolean;
  lowBodyFat: boolean;
  adequateFat: boolean;
  lowMuscle: boolean;
  adequateMuscle: boolean;
  highVisceralFat: boolean;
  veryHighVisceralFat: boolean;
  highWaistHip: boolean;
  lowBMR: boolean;
  highBMI: boolean;
  metabolicRisk: boolean;
};

export type ClassificationResult = {
  primaryProfile: ProfileTag;
  secondaryProfiles: ProfileTag[];
  flags: ClassificationFlags;
  narrative: {
    diagnosis: string;
    strength: string;
    attention: string;
    strategy: string;
  };
};

export const PROFILE_LABELS: Record<ProfileTag, string> = {
  emagrecimento: "Emagrecimento",
  emagrecimento_metabolico_prioritario: "Emagrecimento metabólico prioritário",
  recomposicao: "Recomposição corporal",
  ganho_massa: "Ganho de massa muscular",
  baixa_massa_muscular: "Baixa massa muscular",
  gordura_visceral_elevada: "Gordura visceral elevada",
  metabolismo_reduzido: "Metabolismo adaptado/reduzido",
  perfil_atletico: "Perfil atlético / alta performance",
  risco_metabolico_aumentado: "Risco metabólico aumentado",
};

function parseNumber(v: string | undefined | null): number | null {
  if (!v) return null;
  const cleaned = String(v).replace(/[^\d,.\-]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

type FatRange = { athleticMax: number; healthyMax: number; elevatedMin: number };

function getFatRange(sex: Sex, age: number): FatRange | null {
  if (sex === "feminino") {
    if (age < 40) return { athleticMax: 21, healthyMax: 32, elevatedMin: 33 };
    if (age < 60) return { athleticMax: 23, healthyMax: 33, elevatedMin: 34 };
    return { athleticMax: 24, healthyMax: 35, elevatedMin: 36 };
  }
  if (sex === "masculino") {
    if (age < 40) return { athleticMax: 8, healthyMax: 19, elevatedMin: 20 };
    if (age < 60) return { athleticMax: 11, healthyMax: 21, elevatedMin: 22 };
    return { athleticMax: 13, healthyMax: 24, elevatedMin: 25 };
  }
  return null;
}

function estimateBMR(
  sex: Sex,
  age: number,
  weightKg: number,
  heightCm: number,
): number | null {
  // Mifflin-St Jeor
  if (sex === "masculino")
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  if (sex === "feminino")
    return 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  return null;
}

function fmt1(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function classifyBody(
  body: BodyCompositionData | null,
  clinical: ClinicalData | null,
): ClassificationResult | null {
  if (!body) return null;

  const sex: Sex = body.sex || clinical?.sex || "";
  const age = parseNumber(body.age) ?? parseNumber(clinical?.age ?? "");
  const weight = parseNumber(body.weight) ?? parseNumber(clinical?.weight ?? "");
  const height =
    parseNumber(body.height) ?? parseNumber(clinical?.height ?? "");
  const bodyFatPct = parseNumber(body.bodyFatPercentage);
  const smm = parseNumber(body.skeletalMuscleMass);
  const visceral = parseNumber(body.visceralFat);
  const bmrObs = parseNumber(body.basalMetabolicRate);
  const whr = parseNumber(body.waistHipRatio);
  const bmi =
    parseNumber(body.bmi) ??
    (weight && height ? weight / Math.pow(height / 100, 2) : null);

  if (!sex || age === null || weight === null || bodyFatPct === null) {
    return null;
  }

  const fatRange = getFatRange(sex, age);

  const highBodyFat = !!fatRange && bodyFatPct >= fatRange.elevatedMin;
  const lowBodyFat = !!fatRange && bodyFatPct <= fatRange.athleticMax;
  const adequateFat = !!fatRange && !highBodyFat && !lowBodyFat;

  // SMM/peso
  const smmRatio = smm !== null && weight > 0 ? (smm / weight) * 100 : null;
  const smmLowThreshold = sex === "feminino" ? 33 : 37;
  const lowMuscle = smmRatio !== null && smmRatio < smmLowThreshold;
  const adequateMuscle = smmRatio !== null && smmRatio >= smmLowThreshold;

  const highVisceralFat = visceral !== null && visceral > 9;
  const veryHighVisceralFat = visceral !== null && visceral > 14;

  const whrThreshold = sex === "feminino" ? 0.85 : 0.9;
  const highWaistHip = whr !== null && whr > whrThreshold;

  const bmrEst =
    height !== null ? estimateBMR(sex, age, weight, height) : null;
  const lowBMR =
    bmrObs !== null && bmrEst !== null && bmrObs < bmrEst * 0.92;

  const highBMI = bmi !== null && bmi >= 27;

  const riskCount =
    (highBodyFat ? 1 : 0) + (highVisceralFat ? 1 : 0) + (highWaistHip ? 1 : 0);
  const metabolicRisk = riskCount >= 2;

  const flags: ClassificationFlags = {
    highBodyFat,
    lowBodyFat,
    adequateFat,
    lowMuscle,
    adequateMuscle,
    highVisceralFat,
    veryHighVisceralFat,
    highWaistHip,
    lowBMR,
    highBMI,
    metabolicRisk,
  };

  // Priorização
  let primary: ProfileTag;
  if (highBodyFat && highVisceralFat && (highBMI || veryHighVisceralFat)) {
    primary = "emagrecimento_metabolico_prioritario";
  } else if (highVisceralFat) {
    primary = "gordura_visceral_elevada";
  } else if (highBodyFat) {
    primary = "emagrecimento";
  } else if (adequateFat && lowMuscle) {
    primary = "recomposicao";
  } else if (lowMuscle) {
    primary = "baixa_massa_muscular";
  } else if (lowBodyFat && adequateMuscle) {
    primary = "perfil_atletico";
  } else if (clinical?.mainGoal === "ganho_massa") {
    primary = "ganho_massa";
  } else {
    primary = "recomposicao";
  }

  const secondary: ProfileTag[] = [];
  if (lowBMR) secondary.push("metabolismo_reduzido");
  if (metabolicRisk && primary !== "emagrecimento_metabolico_prioritario")
    secondary.push("risco_metabolico_aumentado");

  const name = (body.patientName || clinical?.patientName || "O paciente").trim();
  const narrative = buildNarrative(primary, flags, {
    name,
    bodyFatPct,
    smmRatio,
    visceral,
    bmi,
    mainGoal: clinical?.mainGoal ?? "",
  });

  return { primaryProfile: primary, secondaryProfiles: secondary, flags, narrative };
}

function buildNarrative(
  profile: ProfileTag,
  flags: ClassificationFlags,
  ctx: {
    name: string;
    bodyFatPct: number;
    smmRatio: number | null;
    visceral: number | null;
    bmi: number | null;
    mainGoal: string;
  },
): ClassificationResult["narrative"] {
  const fat = `${fmt1(ctx.bodyFatPct)}% de gordura corporal`;
  const smm =
    ctx.smmRatio !== null
      ? `${fmt1(ctx.smmRatio)}% de massa muscular esquelética relativa`
      : "massa muscular esquelética não informada";
  const visc =
    ctx.visceral !== null ? `gordura visceral em ${ctx.visceral}` : "gordura visceral não informada";

  switch (profile) {
    case "emagrecimento_metabolico_prioritario":
      return {
        diagnosis: `${ctx.name} apresenta excesso de gordura corporal (${fat}) associado a ${visc} e IMC elevado, configurando prioridade metabólica de emagrecimento.`,
        strength: flags.adequateMuscle
          ? `Massa muscular preservada (${smm}), o que favorece a perda de gordura sem comprometer a TMB.`
          : "Há reserva muscular suficiente para iniciar o protocolo com segurança.",
        attention:
          "Combinação de gordura visceral elevada e excesso ponderal aumenta risco cardiometabólico — exige acompanhamento próximo.",
        strategy:
          "Déficit calórico moderado (300–500 kcal), priorizar proteína (1,8–2,2 g/kg), treino resistido 3–5x/sem + cardio de baixa intensidade diário.",
      };
    case "gordura_visceral_elevada":
      return {
        diagnosis: `${ctx.name} apresenta ${visc}, indicando acúmulo abdominal acima do desejável, mesmo que o % de gordura geral esteja próximo da faixa saudável.`,
        strength: flags.adequateMuscle
          ? `Boa preservação de massa muscular (${smm}).`
          : "Composição corporal periférica dentro do esperado.",
        attention:
          "Gordura visceral é o principal preditor de risco metabólico — resistência insulínica, dislipidemia e hipertensão.",
        strategy:
          "Reduzir ultraprocessados e álcool, aumentar fibras e ômega-3, treino resistido + HIIT 2x/sem, melhorar sono.",
      };
    case "emagrecimento":
      return {
        diagnosis: `${ctx.name} apresenta ${fat}, acima da faixa de referência para sexo e idade. Indicação clara de redução de gordura corporal.`,
        strength: flags.adequateMuscle
          ? `Massa muscular preservada (${smm}) — base sólida para o protocolo.`
          : "Quadro responsivo a déficit calórico bem estruturado.",
        attention:
          "Déficits agressivos podem causar perda de massa magra e queda de TMB — evitar dietas muito restritivas.",
        strategy:
          "Déficit de 15–20% sobre TMB × FA, proteína 1,8–2,2 g/kg, treino resistido 3–4x/sem para preservar massa muscular.",
      };
    case "recomposicao":
      return {
        diagnosis: `${ctx.name} apresenta % de gordura adequado, mas ${smm}${flags.lowMuscle ? " abaixo do ideal" : " com espaço para evolução"}. Perfil de recomposição corporal.`,
        strength: "Composição corporal próxima do equilíbrio — base favorável para ganho de qualidade.",
        attention:
          "Recomposição é lenta: exige consistência por 4–6 meses para mudanças visíveis.",
        strategy:
          "Calorias próximas da manutenção, proteína 2,0–2,2 g/kg, treino resistido progressivo 4x/sem, sono ≥ 7h.",
      };
    case "baixa_massa_muscular":
      return {
        diagnosis: `${ctx.name} apresenta ${smm}, abaixo da faixa esperada. Sinal de hipotrofia ou baixa estimulação muscular crônica.`,
        strength: flags.adequateFat
          ? `% de gordura dentro da faixa saudável (${fat}).`
          : "Quadro reversível com estímulo e aporte proteico adequados.",
        attention:
          "Baixa massa muscular compromete TMB, força funcional e saúde óssea a médio prazo.",
        strategy:
          "Superávit calórico leve (5–10%), proteína 2,0–2,4 g/kg, treino resistido progressivo 4–5x/sem com foco em hipertrofia.",
      };
    case "ganho_massa":
      return {
        diagnosis: `${ctx.name} apresenta composição estável com objetivo declarado de ganho de massa muscular.`,
        strength: flags.adequateMuscle
          ? `Boa base muscular atual (${smm}).`
          : "Margem clara para hipertrofia nos próximos ciclos.",
        attention:
          "Superávit excessivo gera ganho de gordura — monitorar evolução mensal.",
        strategy:
          "Superávit de 10–15%, proteína 1,8–2,2 g/kg, treino resistido 4–5x/sem com sobrecarga progressiva.",
      };
    case "perfil_atletico":
      return {
        diagnosis: `${ctx.name} apresenta ${fat} (faixa atlética) e ${smm}. Perfil de alta performance / manutenção.`,
        strength: "Excelente composição corporal — TMB e desempenho preservados.",
        attention:
          "% de gordura muito baixo de forma prolongada pode comprometer hormônios, imunidade e densidade óssea.",
        strategy:
          "Manutenção calórica periodizada, proteína 1,8–2,0 g/kg, foco em recuperação, mobilidade e qualidade de sono.",
      };
    default:
      return {
        diagnosis: `Composição corporal de ${ctx.name} dentro de parâmetros aceitáveis.`,
        strength: "Quadro estável.",
        attention: "Monitorar evolução periódica.",
        strategy: "Manter rotina atual com ajustes finos conforme objetivo.",
      };
  }
}
