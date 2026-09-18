import { z } from "zod";

export const ANALYSIS_RULES_VERSION = "joao-falcao-analysis-2026-09-14-v1";
export const goals = {
  analise: "Análise dos dados",
  emagrecimento: "Emagrecimento",
  recomposicao: "Recomposição corporal",
  hipertrofia: "Hipertrofia",
} as const;
export const analysisRequestSchema = z.strictObject({
  requestId: z.uuid(),
  consultationId: z.uuid(),
  expectedVersion: z.number().int().min(0).max(2147483646),
  goal: z.enum(["analise", "emagrecimento", "recomposicao", "hipertrofia"]),
  professionalInstructions: z.string().trim().max(3000),
  confirm: z.literal(true),
});
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

const paragraph = z.string().trim().min(1).max(4000);
export const analysisOutputSchema = z.strictObject({
  synthesis: paragraph,
  correlations: z.array(z.string().trim().min(1).max(1200)).max(12),
  missingInformation: z.array(z.string().trim().min(1).max(700)).max(20),
  pointsForReview: z.array(z.string().trim().min(1).max(1200)).max(15),
  professionalDraft: paragraph,
});
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;
export const analysisRecordSchema = z.object({
  id: z.uuid(),
  consultation_id: z.uuid(),
  anamnesis_id: z.uuid(),
  source_version: z.number().int(),
  source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string(),
  prompt_version: z.string(),
  goal: z.enum(["analise", "emagrecimento", "recomposicao", "hipertrofia"]),
  professional_instructions: z.string(),
  status: z.enum(["pending", "draft", "failed", "stale"]),
  result: analysisOutputSchema.nullable(),
  error_code: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  is_current: z.boolean().optional(),
});
export type AnalysisRecord = z.infer<typeof analysisRecordSchema>;
export type AnalysisReply<T> = { ok: true; data: T } | { ok: false; message: string };

export const failureMessages: Record<string, string> = {
  configuration:
    "A análise por IA ainda não está configurada. A equipe precisa cadastrar OPENAI_API_KEY nos Secrets do BioReport.",
  credentials:
    "A credencial da OpenAI foi recusada. A equipe precisa conferir a configuração no servidor.",
  quota:
    "O limite ou os créditos da OpenAI foram atingidos. Tente mais tarde ou peça à equipe para verificar a conta.",
  timeout: "A análise demorou demais. Confira o histórico antes de gerar novamente.",
  invalid_response: "A IA não devolveu uma análise válida. Nenhum resultado foi aprovado.",
  rejected:
    "O serviço de IA recusou o pedido de análise. Peça à equipe para conferir o modelo configurado.",
  unavailable: "O serviço de análise está indisponível. Tente novamente mais tarde.",
  interrupted: "A geração foi interrompida. Você pode solicitar uma nova análise.",
  stale:
    "Os dados da consulta mudaram durante a análise. Reabra a consulta e gere uma nova versão.",
};
