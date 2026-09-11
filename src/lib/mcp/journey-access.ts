import type { ToolContext } from "@lovable.dev/mcp-js";

import { requireAdminClient, supabaseForUser } from "./supabase";

/**
 * Acesso do assistente às jornadas clínicas: administrador autenticado
 * e sempre limitado às jornadas do próprio utilizador.
 */
export async function requireJourneyAccess(
  ctx: ToolContext,
): Promise<
  | { ok: true; supabase: ReturnType<typeof supabaseForUser>; userId: string }
  | { ok: false; message: string }
> {
  const access = await requireAdminClient(ctx);
  if (!access.ok) return access;
  const token = ctx.getToken();
  const { data, error } = await access.supabase.auth.getUser(token ?? undefined);
  if (error || !data.user) return { ok: false, message: "Não autenticado." };
  return { ok: true, supabase: access.supabase, userId: data.user.id };
}

export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export function toolJson(value: unknown) {
  const json = JSON.stringify(value);
  return {
    content: [{ type: "text" as const, text: json }],
    // JSON puro: aceite pelo SDK como structuredContent.
    structuredContent: JSON.parse(json) as never,
  };
}
