import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  ANALYSIS_RULES_VERSION,
  analysisRecordSchema,
  analysisOutputSchema,
  analysisRequestSchema,
  failureMessages,
  type AnalysisRecord,
  type AnalysisReply,
} from "./schema";
import { AnalysisFailure, readAnalysisConfig, requestAnalysis } from "./provider.server";
import { prepareAnalysisContext } from "./context.server";
import { AnalysisMessageError } from "./errors.server";

export function analysisDatabaseMessage(error: { code?: string }) {
  if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code ?? ""))
    return "O histórico de análises ainda não está instalado. A equipe precisa aplicar a migração de análises clínicas.";
  if (["42501", "PGRST301"].includes(error.code ?? ""))
    return "Acesso restrito ou sessão expirada. Entre novamente com uma conta administradora.";
  if (error.code === "P0001")
    return "Limite de dez análises por hora atingido. Aguarde antes de gerar novamente.";
  if (error.code === "P0002")
    return "Já existe uma análise em andamento nesta consulta. Atualize o histórico em instantes.";
  if (["P0003", "23505", "23503"].includes(error.code ?? ""))
    return "A consulta ou a análise mudou. Reabra a consulta e confira os registros salvos.";
  return "Não foi possível carregar ou salvar a análise. Atualize o histórico antes de tentar novamente.";
}

async function assertAdmin(db: SupabaseClient) {
  const user = await db.auth.getUser();
  if (user.error || !user.data.user)
    throw new AnalysisMessageError("Sua sessão expirou. Entre novamente para acessar a análise.");
  const role = await db.rpc("has_role", { _user_id: user.data.user.id, _role: "admin" });
  if (role.error)
    throw new AnalysisMessageError("Não foi possível verificar sua permissão. Tente novamente.");
  if (role.data !== true) throw new AnalysisMessageError("Acesso restrito a administradores.");
}

export async function listAnalyses(
  db: SupabaseClient,
  consultationId: unknown,
): Promise<AnalysisRecord[]> {
  await assertAdmin(db);
  const id = z.uuid().safeParse(consultationId);
  if (!id.success) throw new AnalysisMessageError("Identificador da consulta inválido.");
  const response = await db.rpc("list_consultation_analyses", { _consultation_id: id.data });
  if (response.error) throw new AnalysisMessageError(analysisDatabaseMessage(response.error));
  const records = z.array(analysisRecordSchema).max(10).safeParse(response.data);
  if (!records.success)
    throw new AnalysisMessageError(
      "O histórico contém uma análise inválida. Peça à equipe para conferir o registro.",
    );
  return records.data;
}

export async function generateAnalysis(
  db: SupabaseClient,
  raw: unknown,
  deps = { config: readAnalysisConfig, generate: requestAnalysis },
): Promise<AnalysisReply<AnalysisRecord>> {
  // Revalidate the live user and role before clinical queries, env or provider.
  await assertAdmin(db);
  const input = analysisRequestSchema.safeParse(raw);
  if (!input.success)
    return {
      ok: false,
      message: "Confira a consulta, o objetivo e a confirmação de envio dos dados para análise.",
    };
  let config: ReturnType<typeof readAnalysisConfig>;
  try {
    config = deps.config();
  } catch {
    return { ok: false, message: failureMessages.configuration };
  }
  const request = input.data;
  const preflight = await db.rpc("clinical_analysis_source", {
    _consultation_id: request.consultationId,
  });
  if (preflight.error) return { ok: false, message: analysisDatabaseMessage(preflight.error) };
  try {
    prepareAnalysisContext(preflight.data, request);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Confira os dados salvos antes de gerar a análise.",
    };
  }
  const reserved = await db.rpc("begin_consultation_analysis", {
    _id: request.requestId,
    _consultation_id: request.consultationId,
    _expected_version: request.expectedVersion,
    _model: config.model,
    _prompt_version: ANALYSIS_RULES_VERSION,
    _goal: request.goal,
    _professional_instructions: request.professionalInstructions,
  });
  if (reserved.error) return { ok: false, message: analysisDatabaseMessage(reserved.error) };
  const reservation = z
    .object({
      created: z.boolean(),
      analysis: analysisRecordSchema,
      source: z.unknown().optional(),
    })
    .safeParse(reserved.data);
  if (!reservation.success)
    return {
      ok: false,
      message: "Não foi possível confirmar o registro da análise. Atualize o histórico.",
    };
  if (!reservation.data.created) {
    const records = await listAnalyses(db, request.consultationId);
    const existing = records.find((a) => a.id === request.requestId);
    return existing
      ? { ok: true, data: existing }
      : { ok: false, message: "Consulte o histórico antes de solicitar uma nova análise." };
  }
  let result: unknown = null;
  let errorCode: string | null = null;
  try {
    const prepared = prepareAnalysisContext(reservation.data.source, request);
    const output = await deps.generate(prepared.context, config);
    const merged = analysisOutputSchema.parse({
      ...output,
      missingInformation: [...new Set([...prepared.missing, ...output.missingInformation])].slice(
        0,
        20,
      ),
      pointsForReview: [...new Set([...prepared.issues, ...output.pointsForReview])].slice(0, 15),
    });
    if (new TextEncoder().encode(JSON.stringify(merged)).length > 38000)
      throw new AnalysisFailure("invalid_response");
    result = merged;
  } catch (error) {
    errorCode =
      error instanceof AnalysisFailure && failureMessages[error.code]
        ? error.code
        : "invalid_response";
  }
  // Role revocation/session expiry during generation cannot bypass RLS on save.
  await assertAdmin(db);
  const saved = await db
    .from("consultation_analyses")
    .update({ status: errorCode ? "failed" : "draft", result, error_code: errorCode })
    .eq("id", request.requestId)
    .eq("consultation_id", request.consultationId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (saved.error) return { ok: false, message: analysisDatabaseMessage(saved.error) };
  const record = analysisRecordSchema.safeParse(saved.data);
  if (!record.success)
    return {
      ok: false,
      message:
        "Não foi possível confirmar o salvamento. Atualize o histórico antes de gerar novamente.",
    };
  return { ok: true, data: { ...record.data, is_current: record.data.status === "draft" } };
}
