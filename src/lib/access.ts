import { supabase } from "@/integrations/supabase/client";

export type AccessCode = "guest" | "expired" | "forbidden" | "unavailable";
export class AccessError extends Error {
  constructor(public code: AccessCode) {
    super(
      {
        guest: "Entre para acessar os relatórios clínicos.",
        expired:
          "Sua sessão expirou. Entre novamente para continuar. O rascunho foi preservado neste dispositivo.",
        forbidden:
          "Acesso restrito a administradores. Esta conta não tem permissão para consultar ou gravar relatórios.",
        unavailable: "Não foi possível verificar seu acesso. Confira a conexão e tente novamente.",
      }[code],
    );
  }
}
export const ACCESS_EVENT = "bioreport-access-error";
export const clinicalPaths = [
  "/consulta",
  "/jornada",
  "/upload",
  "/body-composition",
  "/clinical-form",
  "/review",
  "/success",
  "/history",
];
export function safeReturnTo(value: unknown): string {
  return typeof value === "string" &&
    (clinicalPaths.includes(value) ||
      /^\/jornada\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))
    ? value
    : "/history";
}
export async function checkAdminAccess() {
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw new AccessError("expired");
    if (!session) throw new AccessError("guest");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new AccessError(
        userError && userError.status !== 401 && userError.status !== 403
          ? "unavailable"
          : "expired",
      );
    }
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    if (roleError) throw new AccessError(roleError.code === "PGRST301" ? "expired" : "unavailable");
    if (isAdmin !== true) throw new AccessError("forbidden");
    return user;
  } catch (error) {
    throw error instanceof AccessError ? error : new AccessError("unavailable");
  }
}
export async function requireAdminAccess() {
  try {
    return await checkAdminAccess();
  } catch (error) {
    if (typeof window !== "undefined" && error instanceof AccessError) {
      window.dispatchEvent(new CustomEvent(ACCESS_EVENT, { detail: error }));
    }
    throw error;
  }
}
export async function reportFailure(error: { code?: string }): Promise<never> {
  await requireAdminAccess();
  if (error.code === "42501") {
    const denied = new AccessError("forbidden");
    if (typeof window !== "undefined")
      window.dispatchEvent(new CustomEvent(ACCESS_EVENT, { detail: denied }));
    throw denied;
  }
  throw new Error(
    "Não foi possível concluir a operação no histórico. Tente novamente; seus dados preenchidos foram preservados.",
  );
}
