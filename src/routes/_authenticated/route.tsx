import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { proximo: typeof window !== "undefined" ? window.location.pathname : undefined },
      });
    }
    return { user: data.user };
  },
  component: SessionBoundary,
});

/**
 * Fronteira de sessão: nada de um utilizador pode sobreviver ao logout ou à
 * troca de conta. Ao sair/mudar de utilizador cancelamos pedidos em curso,
 * limpamos o cache (queries ["jornada", id], listas, prévias) e remontamos a
 * árvore com key={sessionKey}, o que descarta rascunhos e HTML em memória.
 * Nada clínico é persistido localmente.
 */
function SessionBoundary() {
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sessionKey, setSessionKey] = useState<string>(user.id);

  useEffect(() => {
    let active = true;

    const purge = async () => {
      await queryClient.cancelQueries();
      queryClient.clear();
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const nextId = session?.user?.id ?? null;

      if (event === "SIGNED_OUT" || !nextId) {
        void purge().then(() => {
          if (!active) return;
          setSessionKey("signed-out");
          void navigate({ to: "/auth", search: { proximo: undefined }, replace: true });
        });
        return;
      }

      if (nextId !== sessionKey) {
        // Troca de conta: cache e estado de ecrã do utilizador anterior caem.
        void purge().then(() => {
          if (active) setSessionKey(nextId);
        });
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient, navigate, sessionKey]);

  if (sessionKey === "signed-out") return null;

  return <Outlet key={sessionKey} />;
}
