import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

type RuntimeGlobals = typeof globalThis & {
  Deno?: { env?: { get?: (name: string) => string | undefined } };
  process?: { env?: Record<string, string | undefined> };
};

function runtimeEnv(name: string): string | undefined {
  const runtime = globalThis as RuntimeGlobals;
  return runtime.Deno?.env?.get?.(name) ?? runtime.process?.env?.[name];
}

function configuredEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = runtimeEnv(name)?.trim();
    if (value) return value;
  }
  return undefined;
}

function supabaseProjectUrl(): string {
  const url = configuredEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"]);
  if (!url) throw new Error("SUPABASE_URL (or VITE_SUPABASE_URL) is required");
  return url;
}

function supabasePublishableKey(): string {
  const direct = configuredEnv(["SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  if (direct) return direct;
  const keyset = runtimeEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyset) {
    try {
      const parsed: unknown = JSON.parse(keyset);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const keys = parsed as Record<string, unknown>;
        const key = [keys.default, ...Object.values(keys)]
          .find((v): v is string => typeof v === "string" && v.trim().startsWith("sb_publishable_"))
          ?.trim();
        if (key) return key;
      }
    } catch {
      // malformed dictionary; fall through to legacy names
    }
  }
  const legacy = configuredEnv(["SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY"]);
  if (legacy) return legacy;
  throw new Error("SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY is required");
}

/** Forwards the verified bearer token so RLS runs as the signed-in user. */
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  return createClient(supabaseProjectUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Só contas com o papel de administrador podem usar as ferramentas do assistente.
 * Devolve o cliente Supabase autenticado ou uma mensagem de recusa.
 */
export async function requireAdminClient(
  ctx: ToolContext,
): Promise<
  { ok: true; supabase: ReturnType<typeof supabaseForUser> } | { ok: false; message: string }
> {
  if (!ctx.isAuthenticated()) return { ok: false, message: "Não autenticado." };

  const token = ctx.getToken();
  if (!token) return { ok: false, message: "Não autenticado." };

  try {
    const supabase = supabaseForUser(ctx);
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return { ok: false, message: "Não autenticado." };

    const { data: isAdmin, error } = await supabase.rpc("has_role", {
      _user_id: userData.user.id,
      _role: "admin",
    });
    if (error) return { ok: false, message: "Não foi possível verificar as permissões de acesso." };
    if (isAdmin !== true) {
      return {
        ok: false,
        message: "Acesso restrito: apenas administradores podem consultar os relatórios.",
      };
    }
    return { ok: true, supabase };
  } catch {
    return {
      ok: false,
      message: "Não foi possível validar a sessão. Verifique a configuração e tente novamente.",
    };
  }
}
