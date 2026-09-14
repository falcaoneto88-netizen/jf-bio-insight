import { z } from "zod";
import { anamnesisSchema, emptyAnamnesis } from "@/lib/anamnesis/form";
import { computeEvolution } from "@/lib/journey/evolution";
import { dateSortKey } from "@/lib/journey/format";
import { emptyBio } from "@/lib/journey/types";
import { goals, type AnalysisRequest } from "./schema";

const field = z.string().trim().max(100).default("");
const history = z
  .array(z.object({ date: field, value: field }))
  .max(120)
  .default([]);
const bodySchema = z.object({
  patientName: z.string().trim().max(150),
  examDateTime: field,
  sex: field,
  age: field,
  height: field,
  weight: field,
  skeletalMuscleMass: field,
  bodyFatPercentage: field,
  bodyFatMass: field,
  fatFreeMass: field,
  visceralFat: field,
  basalMetabolicRate: field,
  weightHistory: history,
  skeletalMuscleHistory: history,
  bodyFatHistory: history,
});
const sourceSchema = z.object({
  consultation: z.object({
    id: z.uuid(),
    patient_id: z.uuid(),
    patient_name: z.string(),
    consultation_date: z.string(),
  }),
  draft: z.object({
    version: z.number().int(),
    anamnesis_id: z.uuid(),
    body_composition: bodySchema,
    clinical_data: z.record(z.string(), z.string().max(20000)).nullable(),
  }),
  anamnesis: z.object({
    id: z.uuid(),
    accepted: z.literal(true),
    confirmed_at: z.string(),
    answers: z.record(z.string(), z.unknown()),
  }),
});
const normalizeName = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

export function prepareAnalysisContext(raw: unknown, request: AnalysisRequest) {
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error(
      "Carregue uma anamnese confirmada na ficha clínica e salve a bioimpedância antes de gerar a análise.",
    );
  const source = parsed.data;
  if (
    source.consultation.id !== request.consultationId ||
    source.draft.version !== request.expectedVersion ||
    source.draft.anamnesis_id !== source.anamnesis.id
  )
    throw new Error("A consulta foi alterada. Reabra os dados antes de gerar a análise.");
  const validated = anamnesisSchema.safeParse({ ...emptyAnamnesis(), ...source.anamnesis.answers });
  if (!validated.success)
    throw new Error(
      "A anamnese salva tem dados inválidos. Confira a versão antes de gerar a análise.",
    );
  const answers = validated.data;
  const bc = source.draft.body_composition;
  const expectedName = normalizeName(source.consultation.patient_name);
  if (
    normalizeName(answers.patientName) !== expectedName ||
    normalizeName(bc.patientName) !== expectedName ||
    (source.draft.clinical_data?.patientName &&
      normalizeName(source.draft.clinical_data.patientName) !== expectedName)
  )
    throw new Error(
      "Os nomes da consulta, anamnese e exame não coincidem. Confira a identidade do paciente antes da análise.",
    );
  if (!bc.weight || !dateSortKey(bc.examDateTime.split(/[T ]/)[0]))
    throw new Error("Confira o peso e a data do exame antes de gerar a análise.");

  for (const [key, min, max] of [
    ["weight", 1, 600],
    ["height", 30, 280],
    ["age", 0, 120],
    ["skeletalMuscleMass", 0, 300],
    ["fatFreeMass", 0, 500],
    ["bodyFatMass", 0, 500],
    ["bodyFatPercentage", 0, 100],
  ] as const) {
    const value = bc[key];
    if (!value) continue;
    const number = Number(value.replace(",", "."));
    if (
      !/^\d+(?:[.,]\d+)?$/.test(value) ||
      !Number.isFinite(number) ||
      number < min ||
      number > max
    )
      throw new Error(
        "Confira os números e as unidades do exame. Use altura em centímetros, massas em kg e gordura corporal em percentual.",
      );
  }

  const rows = [
    ...bc.weightHistory.map((p) => ({
      data: p.date,
      peso: p.value,
      massaMuscularEsqueletica: "",
      pgc: "",
    })),
    ...bc.skeletalMuscleHistory.map((p) => ({
      data: p.date,
      peso: "",
      massaMuscularEsqueletica: p.value,
      pgc: "",
    })),
    ...bc.bodyFatHistory.map((p) => ({
      data: p.date,
      peso: "",
      massaMuscularEsqueletica: "",
      pgc: p.value,
    })),
    {
      data: bc.examDateTime.split(/[T ]/)[0],
      peso: bc.weight,
      massaMuscularEsqueletica: bc.skeletalMuscleMass,
      pgc: bc.bodyFatPercentage,
    },
  ];
  const evolution = computeEvolution({ ...emptyBio, historico: rows });
  const issues = [
    ...evolution.conflicts,
    ...evolution.ignoredDatesWithValues.map((d) => `Data inválida no histórico: ${d}.`),
    ...(bc.age && answers.age !== bc.age
      ? ["A idade do exame difere da idade informada na anamnese; confira as datas."]
      : []),
  ];
  const evolutionUsable = !evolution.conflicts.length && !evolution.ignoredDatesWithValues.length;
  const missing = (
    [
      [bc.age, "Idade no exame"],
      [bc.height, "Altura no exame"],
      [bc.sex, "Sexo no exame"],
      [bc.skeletalMuscleMass, "Massa muscular esquelética"],
      [bc.bodyFatPercentage, "Percentual de gordura corporal"],
      [bc.fatFreeMass, "Massa livre de gordura"],
      [bc.bodyFatMass, "Massa de gordura"],
      [bc.visceralFat, "Gordura visceral"],
      [bc.basalMetabolicRate, "TMB do exame"],
    ] as const
  )
    .filter(([value]) => !value)
    .map(([, label]) => `${label}: Não informado.`);
  if (!evolution.hasTrend)
    missing.push("Há apenas uma data de exame válida; não é possível avaliar tendência.");
  const stripIdentity = (data: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(data).filter(([key]) => !["patientName", "email", "phone"].includes(key)),
    );
  const context = {
    objetivo: goals[request.goal],
    instrucoesDoProfissional: request.professionalInstructions,
    dataConsulta: source.consultation.consultation_date,
    anamnese: stripIdentity(answers),
    fichaClinica: stripIdentity(source.draft.clinical_data ?? {}),
    bioimpedancia: {
      ...stripIdentity(bc),
      unidades: {
        height: "cm",
        weight: "kg",
        skeletalMuscleMass: "kg",
        bodyFatMass: "kg",
        fatFreeMass: "kg",
        bodyFatPercentage: "%",
        basalMetabolicRate: "kcal/dia",
      },
    },
    evolucaoCalculada: {
      comparavel: evolutionUsable && evolution.hasTrend,
      resumo: evolutionUsable ? evolution.summaryLines : [],
      limitacoes: issues,
    },
    lacunasIdentificadas: missing,
  };
  if (new TextEncoder().encode(JSON.stringify(context)).length > 70000)
    throw new Error(
      "Os dados desta consulta excedem o limite de análise. Reduza as observações e o histórico antes de continuar.",
    );
  return { context, missing, issues };
}
