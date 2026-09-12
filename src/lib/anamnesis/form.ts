import { z } from "zod";

export type IntakeField = {
  id: string;
  label: string;
  kind?: "text" | "textarea" | "number" | "date" | "time" | "choice";
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly string[];
  when?: { field: string; value: string };
  hint?: string;
  wide?: boolean;
};
export type IntakeSection = {
  title: string;
  subtitle: string;
  note?: string;
  fields: readonly IntakeField[];
};
const yesNo = ["Sim", "Não"];
export const anamnesisSections: readonly IntakeSection[] = [
  {
    title: "Identificação",
    subtitle: "Dados principais",
    fields: [
      { id: "patientName", label: "Nome do paciente", required: true, max: 150, wide: true },
      {
        id: "age",
        label: "Idade",
        kind: "number",
        required: true,
        min: 0,
        max: 120,
        step: 1,
        hint: "Em anos completos.",
      },
      { id: "consultationDate", label: "Data da consulta", kind: "date", required: true },
    ],
  },
  {
    title: "Dados Pessoais e Rotina",
    subtitle: "Rotina diária",
    fields: [
      { id: "wakeTime", label: "Acorda às", kind: "time", required: true },
      { id: "sleepTime", label: "Dorme às", kind: "time", required: true },
      { id: "profession", label: "Profissão", max: 150 },
      {
        id: "workSchedule",
        label: "Horário de trabalho",
        hint: "Ex.: 9h às 18h, turnos variáveis ou não se aplica.",
        max: 300,
      },
    ],
  },
  {
    title: "Estado Civil e Família",
    subtitle: "Contexto familiar",
    fields: [
      { id: "maritalStatus", label: "Estado civil", max: 100 },
      { id: "livesWith", label: "Vive com", max: 200 },
      {
        id: "hasChildren",
        label: "Possui filhos?",
        kind: "choice",
        options: yesNo,
        required: true,
        wide: true,
      },
      {
        id: "childrenCount",
        label: "Quantos filhos?",
        kind: "number",
        min: 1,
        max: 30,
        step: 1,
        required: true,
        when: { field: "hasChildren", value: "Sim" },
      },
      {
        id: "childrenAges",
        label: "Idade dos filhos",
        required: true,
        max: 300,
        hint: "Ex.: 3 anos e 8 anos.",
        when: { field: "hasChildren", value: "Sim" },
      },
    ],
  },
  {
    title: "Histórico Clínico",
    subtitle: "Segurança do procedimento",
    note: "É importante informar qualquer doença, diagnóstico ou condição clínica existente. Essas informações são utilizadas para aumentar a segurança do procedimento e não implicam automaticamente em contraindicação ou impedimento da realização do tratamento.",
    fields: [
      {
        id: "hasConditions",
        label: "Possui alguma doença ou condição de saúde?",
        kind: "choice",
        options: yesNo,
        required: true,
        wide: true,
      },
      {
        id: "conditions",
        label: "Quais doenças ou condições de saúde?",
        kind: "textarea",
        required: true,
        when: { field: "hasConditions", value: "Sim" },
      },
      {
        id: "takesMedication",
        label: "Faz uso de medicamentos regularmente?",
        kind: "choice",
        options: yesNo,
        required: true,
        wide: true,
      },
      {
        id: "medications",
        label: "Quais medicamentos utiliza atualmente?",
        kind: "textarea",
        required: true,
        when: { field: "takesMedication", value: "Sim" },
      },
      {
        id: "hasDrugAllergies",
        label: "Possui alergia a medicamentos?",
        kind: "choice",
        options: ["Sim", "Não", "Não sei"],
        required: true,
        wide: true,
      },
      {
        id: "drugAllergies",
        label: "Quais alergias a medicamentos?",
        kind: "textarea",
        required: true,
        when: { field: "hasDrugAllergies", value: "Sim" },
      },
      {
        id: "hasFoodAllergies",
        label: "Possui alergia alimentar?",
        kind: "choice",
        options: ["Sim", "Não", "Não sei"],
        required: true,
        wide: true,
      },
      {
        id: "foodAllergies",
        label: "Quais alergias alimentares?",
        kind: "textarea",
        required: true,
        when: { field: "hasFoodAllergies", value: "Sim" },
      },
    ],
  },
  {
    title: "Atividade Física e Hábitos de Vida",
    subtitle: "Rotina metabólica",
    fields: [
      {
        id: "trains",
        label: "Pratica atividade física ou frequenta ginásio/academia?",
        kind: "choice",
        options: yesNo,
        required: true,
        wide: true,
      },
      {
        id: "trainingFrequency",
        label: "Quantas vezes por semana?",
        kind: "number",
        min: 1,
        max: 21,
        step: 1,
        required: true,
        when: { field: "trains", value: "Sim" },
        hint: "Número de sessões por semana.",
      },
      {
        id: "trainingType",
        label: "Qual modalidade pratica?",
        required: true,
        max: 300,
        when: { field: "trains", value: "Sim" },
      },
      {
        id: "trainingTime",
        label: "Horário habitual dos treinos",
        max: 150,
        hint: "Ex.: 7h ou horários variados.",
        when: { field: "trains", value: "Sim" },
      },
      {
        id: "waterLiters",
        label: "Quanto de água consome em 24 horas?",
        kind: "number",
        min: 0,
        max: 15,
        step: 0.1,
        required: true,
        hint: "Em litros. Ex.: 2,5.",
      },
      {
        id: "drinksAlcohol",
        label: "Consome bebidas alcoólicas?",
        kind: "choice",
        options: yesNo,
        required: true,
        wide: true,
      },
      {
        id: "alcoholFrequency",
        label: "Com qual frequência consome álcool?",
        required: true,
        max: 300,
        when: { field: "drinksAlcohol", value: "Sim" },
      },
      {
        id: "smokes",
        label: "É fumante?",
        kind: "choice",
        options: yesNo,
        required: true,
        wide: true,
      },
      {
        id: "cigarettesPerDay",
        label: "Quantos cigarros por dia?",
        kind: "number",
        min: 0,
        max: 200,
        step: 1,
        required: true,
        hint: "Se fuma ocasionalmente ou usa outro produto, informe 0 e detalhe abaixo.",
        when: { field: "smokes", value: "Sim" },
      },
      {
        id: "smokingNotes",
        label: "Outros produtos ou observações sobre o tabagismo",
        kind: "textarea",
        when: { field: "smokes", value: "Sim" },
      },
      {
        id: "sleepQuality",
        label: "Como considera a qualidade do seu sono?",
        kind: "choice",
        options: ["Bom", "Regular", "Ruim", "Péssimo"],
        required: true,
        wide: true,
      },
      {
        id: "takesSupplements",
        label: "Utiliza suplementos alimentares?",
        kind: "choice",
        options: yesNo,
        required: true,
        wide: true,
      },
      {
        id: "supplements",
        label: "Quais suplementos utiliza atualmente?",
        kind: "textarea",
        required: true,
        when: { field: "takesSupplements", value: "Sim" },
      },
    ],
  },
  {
    title: "Histórico Estético e Cirúrgico",
    subtitle: "Procedimentos prévios",
    fields: [
      {
        id: "previousProcedures",
        label: "Já realizou procedimentos estéticos anteriormente?",
        kind: "textarea",
        hint: "Descreva os procedimentos ou escreva “Nenhum”.",
      },
      {
        id: "previousSurgeries",
        label: "Cirurgias prévias",
        kind: "textarea",
        hint: "Descreva as cirurgias ou escreva “Nenhuma”.",
      },
    ],
  },
  {
    title: "Objetivo da Consulta",
    subtitle: "Expectativa e direcionamento",
    fields: [
      { id: "mainComplaint", label: "Queixa principal", kind: "textarea", required: true },
      { id: "treatmentGoal", label: "Objetivo do tratamento", kind: "textarea", required: true },
      {
        id: "expectations",
        label: "Existe alguma expectativa específica em relação ao resultado desejado?",
        kind: "textarea",
      },
    ],
  },
];
export type AnamnesisAnswers = Record<string, string>;
export const anamnesisFields = anamnesisSections.flatMap((section) => section.fields);
export const emptyAnamnesis = (): AnamnesisAnswers =>
  Object.fromEntries(anamnesisFields.map((field) => [field.id, ""]));
export const isFieldVisible = (field: IntakeField, answers: AnamnesisAnswers) =>
  !field.when || answers[field.when.field] === field.when.value;
export function updateAnswer(
  answers: AnamnesisAnswers,
  id: string,
  value: string,
): AnamnesisAnswers {
  const next = { ...answers, [id]: value };
  for (const field of anamnesisFields) if (!isFieldVisible(field, next)) next[field.id] = "";
  return next;
}
function fieldSchema(field: IntakeField) {
  return z
    .string()
    .trim()
    .max(field.kind === "number" ? 10 : (field.max ?? 2000), "Resposta muito longa.");
}
export const anamnesisSchema = z
  .object(Object.fromEntries(anamnesisFields.map((field) => [field.id, fieldSchema(field)])))
  .superRefine((answers, ctx) => {
    const issue = (field: IntakeField, message: string) =>
      ctx.addIssue({ code: "custom", path: [field.id], message });
    for (const field of anamnesisFields) {
      if (!isFieldVisible(field, answers)) continue;
      const value = answers[field.id];
      if (!value) {
        if (field.required) issue(field, "Preencha este campo.");
        continue;
      }
      if (field.kind === "number") {
        const number = Number(value.replace(",", "."));
        if (
          !/^\d+(?:[.,]\d+)?$/.test(value) ||
          !Number.isFinite(number) ||
          number < (field.min ?? 0) ||
          number > (field.max ?? Infinity)
        )
          issue(field, `Informe um número entre ${field.min ?? 0} e ${field.max}.`);
        else if (field.step === 1 && !Number.isInteger(number))
          issue(field, "Informe um número inteiro.");
        else if (field.step === 0.1 && Math.abs(number * 10 - Math.round(number * 10)) > 1e-8)
          issue(field, "Use no máximo uma casa decimal.");
      }
      if (field.kind === "date" && !z.iso.date().safeParse(value).success)
        issue(field, "Informe uma data válida.");
      if (field.kind === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
        issue(field, "Informe um horário válido.");
      if (field.kind === "choice" && !field.options?.includes(value))
        issue(field, "Selecione uma das opções.");
      if (field.id === "patientName" && !/^\S+\s+\S/.test(value))
        issue(field, "Informe o nome completo do paciente.");
    }
  })
  .transform((answers) =>
    Object.fromEntries(
      anamnesisFields
        .filter((field) => isFieldVisible(field, answers))
        .map((field) => [field.id, answers[field.id]]),
    ),
  );

export const patientDeclaration =
  "Declaro que as informações fornecidas nesta anamnese são verdadeiras e completas. Comprometo-me a informar qualquer alteração clínica, uso de medicamentos, alergias ou condição de saúde que possa interferir na segurança do procedimento.";
export const confirmationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Informe seu nome completo.")
    .max(150, "Use até 150 caracteres.")
    .refine((value) => /^\S+\s+\S/.test(value), "Informe seu nome completo."),
  accepted: z.boolean().refine((value) => value === true, "Confirme a declaração para concluir."),
});
export function formatAnswer(field: IntakeField, value: string) {
  if (!value) return "Não informado";
  if (field.kind === "date") return value.split("-").reverse().join("/");
  if (field.id === "waterLiters") return `${value.replace(".", ",")} litros`;
  return value;
}
