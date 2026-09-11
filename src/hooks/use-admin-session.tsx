import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export type AdminSessionState = {
  /** true enquanto a sessão ainda está a ser verificada */
  loading: boolean;
  /** existe sessão iniciada */
  signedIn: boolean;
  /** a conta tem papel de administrador */
  isAdmin: boolean;
};

/**
 * Estado de sessão + papel de administrador, usado pelo fluxo legado
 * (histórico, revisão e extração) para exigir login em vez de falhar em silêncio.
 */
export function useAdminSession(): AdminSessionState {
  const [state, setState] = useState<AdminSessionState>({
    loading: true,
    signedIn: false,
    isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) {
        if (!cancelled) setState({ loading: false, signedIn: false, isAdmin: false });
        return;
      }
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (cancelled) return;
      setState({
        loading: false,
        signedIn: true,
        isAdmin: (roles ?? []).some((r) => r.role === "admin"),
      });
    };

    void check();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        void check();
      }
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
