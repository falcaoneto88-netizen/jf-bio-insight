/**
 * Regras do Agente Clínico Dr. João Falcão — versão 1.
 * Schemas partilhados entre a UI e as ferramentas MCP.
 */
import { z } from "zod";

export const AGENT_RULES_VERSION = "agente-clinico-v1";

/* ------------------------------------------------------------------ */
/* Anamnese — cabeçalho + 12 secções com numeração fixa                */
/* ------------------------------------------------------------------ */

const txt = z.string().trim().max(4000).default("");

export const anamneseHeaderSchema = z.object({
  paciente: txt,
  dataConsulta: txt, // DD/MM/AAAA
  nascimentoOuIdade: txt,
  telefone: txt,
  email: txt,
});

export const anamneseSchema = z.object({
  header: anamneseHeaderSchema,
  /* 1 */ identificacao: z.object({ estadoCivil: txt, filhos: txt, outras: txt }),
  /* 2 */ rotinaProfissional: z.object({ profissao: txt, tipoHorario: txt, observacoes: txt }),
  /* 3 */ sono: z.object({
    acorda: txt,
    dorme: txt,
    qualidade: txt,
    acordaDescansado: txt,
    disposicao: txt, // 1-10
    observacoes: txt,
  }),
  /* 4 */ historicoClinico: z.object({
    doencas: txt,
    familiar: txt,
    medicacoesAnteriores: txt,
    outras: txt,
  }),
  /* 5 */ alergias: z.object({ medicamentos: txt, alimentares: txt }),
  /* 6 */ medicacoesEmUso: z
    .array(
      z.object({
        nome: txt,
        dose: txt,
        frequencia: txt,
        horario: txt,
        motivo: txt,
      }),
    )
    .max(60)
    .default([]),
  /* 7 */ cirurgias: z.object({ cirurgias: txt, estetica: txt, intercorrencias: txt }),
  /* 8 */ emocional: z.object({
    ansiedade: txt, // 1-10
    estresse: txt,
    humor: txt,
    memoriaConcentracao: txt,
    compulsao: txt,
  }),
  /* 9 */ habitos: z.object({
    tabaco: txt,
    alcool: txt,
    treino: txt,
    modalidade: txt,
    frequencia: txt,
    duracao: txt,
    horario: txt,
  }),
  /* 10 */ alimentacao: z.object({
    refeicoes: txt,
    padrao: txt,
    agua: txt,
    suplementos: txt,
  }),
  /* 11 */ queixaObjetivos: z.object({
    queixa: txt,
    objetivo: txt,
    evolucao: txt,
    tratamentos: txt,
    expectativas: txt,
  }),
  /* 12 */ observacoesClinicas: z.object({ adicionais: txt, pontosAtencao: txt }),
});

export type Anamnese = z.infer<typeof anamneseSchema>;

export const emptyAnamnese: Anamnese = anamneseSchema.parse({
  header: {},
  identificacao: {},
  rotinaProfissional: {},
  sono: {},
  historicoClinico: {},
  alergias: {},
  medicacoesEmUso: [],
  cirurgias: {},
  emocional: {},
  habitos: {},
  alimentacao: {},
  queixaObjetivos: {},
  observacoesClinicas: {},
});

/** Rótulos oficiais — a numeração NUNCA é recalculada quando uma secção é omitida. */
export const ANAMNESE_SECTIONS = [
  { key: "identificacao", n: 1, label: "Identificação e contexto familiar" },
  { key: "rotinaProfissional", n: 2, label: "Rotina profissional" },
  { key: "sono", n: 3, label: "Sono e disposição" },
  { key: "historicoClinico", n: 4, label: "Histórico clínico" },
  { key: "alergias", n: 5, label: "Alergias" },
  { key: "medicacoesEmUso", n: 6, label: "Medicações em uso" },
  { key: "cirurgias", n: 7, label: "Cirurgias e procedimentos" },
  { key: "emocional", n: 8, label: "Saúde emocional e cognitiva" },
  { key: "habitos", n: 9, label: "Hábitos" },
  { key: "alimentacao", n: 10, label: "Alimentação, hidratação e suplementação" },
  { key: "queixaObjetivos", n: 11, label: "Queixa principal e objetivos" },
  { key: "observacoesClinicas", n: 12, label: "Observações clínicas" },
] as const;

export const ANAMNESE_FIELD_LABELS: Record<string, string> = {
  estadoCivil: "Estado civil",
  filhos: "Filhos / idades",
  outras: "Outras informações",
  profissao: "Profissão",
  tipoHorario: "Tipo e horário de trabalho",
  observacoes: "Observações",
  acorda: "Hora que acorda",
  dorme: "Hora que dorme",
  qualidade: "Qualidade do sono",
  acordaDescansado: "Acorda descansado",
  disposicao: "Disposição (1–10)",
  doencas: "Doenças",
  familiar: "Histórico familiar",
  medicacoesAnteriores: "Medicações anteriores",
  medicamentos: "Medicamentos e reações",
  alimentares: "Alergias alimentares",
  cirurgias: "Cirurgias e época",
  estetica: "Procedimentos estéticos",
  intercorrencias: "Intercorrências",
  ansiedade: "Ansiedade (1–10)",
  estresse: "Estresse",
  humor: "Humor",
  memoriaConcentracao: "Memória e concentração",
  compulsao: "Compulsão",
  tabaco: "Tabaco",
  alcool: "Álcool",
  treino: "Treina atualmente",
  modalidade: "Modalidade",
  frequencia: "Frequência",
  duracao: "Duração",
  horario: "Horário",
  refeicoes: "Refeições",
  padrao: "Padrão alimentar",
  agua: "Água",
  suplementos: "Suplementos",
  queixa: "Queixa principal",
  objetivo: "Objetivo",
  evolucao: "Evolução",
  tratamentos: "Tratamentos e resultados",
  expectativas: "Expectativas",
  adicionais: "Informações adicionais",
  pontosAtencao: "Pontos de atenção",
  nome: "Nome",
  dose: "Dose",
  motivo: "Motivo",
};

/* ------------------------------------------------------------------ */
/* Bioimpedância — whitelist EXATA                                     */
/* ------------------------------------------------------------------ */

export const bioHistoryRowSchema = z.object({
  data: txt, // DD/MM/AAAA
  peso: txt, // kg
  massaMuscularEsqueletica: txt, // kg
  pgc: txt, // %
});
export type BioHistoryRow = z.infer<typeof bioHistoryRowSchema>;

export const bioSchema = z.object({
  paciente: txt,
  alturaM: txt,
  idadeAnos: txt,
  sexo: txt,
  dataHoraExame: txt,
  taxaMetabolicaBasalKcal: txt,
  nivelGorduraVisceral: txt,
  historico: z.array(bioHistoryRowSchema).max(60).default([]),
  /** Metadados: nunca entram no documento do paciente. */
  fontes: z.array(z.string().max(500)).max(60).default([]),
  duvidas: z.array(z.string().max(500)).max(60).default([]),
  identityReview: z.boolean().default(false),
  semExame: z.boolean().default(false),
  arquivoNome: txt,
});
export type Bio = z.infer<typeof bioSchema>;

export const emptyBio: Bio = bioSchema.parse({ historico: [], fontes: [], duvidas: [] });

/* ------------------------------------------------------------------ */
/* Protocolo — estrutura versionada, editável, sem JSON cru na UI      */
/* ------------------------------------------------------------------ */

export const PROTOCOL_TEMPLATE_VERSION = "modelo-protocolo-v1";

export const OBJETIVOS = [
  { value: "hipertrofia", label: "Hipertrofia", available: true },
  { value: "recomposicao", label: "Recomposição corporal", available: true },
  { value: "emagrecimento", label: "Emagrecimento", available: false },
] as const;
export type Objetivo = (typeof OBJETIVOS)[number]["value"];

export const protocolBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("paragraph"), text: z.string().max(6000) }),
  z.object({ type: z.literal("list"), items: z.array(z.string().max(1000)).max(60) }),
  z.object({
    type: z.literal("table"),
    columns: z.array(z.string().max(120)).max(8),
    rows: z.array(z.array(z.string().max(600)).max(8)).max(120),
  }),
  z.object({ type: z.literal("patientNote"), text: z.string().max(4000) }),
]);
export type ProtocolBlock = z.infer<typeof protocolBlockSchema>;

export const protocolSectionSchema = z.object({
  id: z.string().max(64),
  title: z.string().max(200),
  blocks: z.array(protocolBlockSchema).max(60).default([]),
});
export type ProtocolSection = z.infer<typeof protocolSectionSchema>;

export const protocolSchema = z.object({
  templateVersion: z.string().max(64).default(PROTOCOL_TEMPLATE_VERSION),
  objetivo: z.enum(["hipertrofia", "recomposicao", "emagrecimento"]).nullable().default(null),
  instrucoes: z.string().max(6000).default(""),
  sections: z.array(protocolSectionSchema).max(40).default([]),
  /** Painel interno — NUNCA exportado para o HTML. */
  pendencias: z.array(z.string().max(600)).max(60).default([]),
});
export type Protocolo = z.infer<typeof protocolSchema>;

export const emptyProtocolo: Protocolo = protocolSchema.parse({});

/* ------------------------------------------------------------------ */
/* Jornada                                                             */
/* ------------------------------------------------------------------ */

export const confirmationsSchema = z.object({
  anamnese: z.boolean().default(false),
  bio: z.boolean().default(false),
  revisao: z.boolean().default(false),
});
export type Confirmations = z.infer<typeof confirmationsSchema>;

export type JourneyStep = 1 | 2 | 3 | 4 | 5 | 6;

export const JOURNEY_STEPS: { step: JourneyStep; label: string; short: string }[] = [
  { step: 1, label: "Anamnese", short: "Anamnese" },
  { step: 2, label: "Bioimpedância", short: "Bio" },
  { step: 3, label: "Revisão e evolução", short: "Revisão" },
  { step: 4, label: "Protocolo", short: "Protocolo" },
  { step: 5, label: "Aprovação", short: "Aprovação" },
  { step: 6, label: "HTML", short: "HTML" },
];

export type Journey = {
  id: string;
  patientName: string;
  status: string;
  version: number;
  anamnese: Anamnese;
  bio: Bio;
  protocolo: Protocolo | null;
  internalNotes: string[];
  confirmations: Confirmations;
  contentHash: string;
  approvedVersion: number | null;
  approvedAt: string | null;
  approvedHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JourneySummary = {
  id: string;
  patientName: string;
  status: string;
  version: number;
  approvedVersion: number | null;
  updatedAt: string;
};
