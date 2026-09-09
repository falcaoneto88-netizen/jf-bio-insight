import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAILS = ["falcaoneto88@gmail.com"];

/**
 * Atribui o papel de administrador à conta autenticada, caso o seu email
 * esteja na lista fixa de administradores autorizados.
 */
export const claimAdminRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = String(context.claims["email"] ?? "").toLowerCase();
    if (!email || !ADMIN_EMAILS.includes(email)) {
      return { isAdmin: false as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: context.userId, role: "admin" }, { onConflict: "user_id,role" });

    if (error) throw new Error(error.message);

    return { isAdmin: true as const };
  });

/** Devolve os papéis da conta autenticada. */
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);

    const roles = (data ?? []).map((row) => row.role);
    return { roles, isAdmin: roles.includes("admin") };
  });
