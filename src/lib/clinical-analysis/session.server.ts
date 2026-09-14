import { getRequest } from "@tanstack/react-start/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AnalysisReply } from "./schema";
import { AnalysisMessageError } from "./errors.server";

export async function withAnalysisSession<T>(
  action: (db: SupabaseClient) => Promise<AnalysisReply<T>>,
): Promise<AnalysisReply<T>> {
  try {
    const authorization = getRequest().headers.get("authorization");
    if (!authorization || !/^Bearer \S+$/.test(authorization))
      return { ok: false, message: "Sua sessão expirou. Entre novamente para acessar a análise." };
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key)
      return {
        ok: false,
        message: "O acesso ao banco não está configurado no servidor. Avise a equipe.",
      };
    const db = createClient(url, key, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    return await action(db);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AnalysisMessageError
          ? error.message
          : "Não foi possível concluir a análise. Confira sua sessão e atualize o histórico antes de tentar novamente.",
    };
  }
}
