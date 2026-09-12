import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  ACCESS_EVENT,
  AccessError,
  checkAdminAccess,
  safeReturnTo,
  type AccessCode,
} from "@/lib/access";
import { useReportStore } from "@/store/report-store";
import { Button } from "@/components/ui/button";

type Status = AccessCode | "loading" | "admin";
const AccessContext = createContext({
  status: "loading" as Status,
  refresh: async () => {},
  signOut: async () => {},
});
// eslint-disable-next-line react-refresh/only-export-components -- shared auth context hook
export const useAccess = () => useContext(AccessContext);

export function AccessProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const generation = useRef(0);
  const hadSession = useRef(false);
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const user = await checkAdminAccess();
      if (current !== generation.current) return;
      const owner = localStorage.getItem("jf-bioreport-draft-owner");
      if (owner && owner !== user.id) useReportStore.getState().reset();
      localStorage.setItem("jf-bioreport-draft-owner", user.id);
      hadSession.current = true;
      setStatus("admin");
    } catch (error) {
      if (current !== generation.current) return;
      queryClient.clear();
      const code = error instanceof AccessError ? error.code : "unavailable";
      setStatus(code === "guest" && hadSession.current ? "expired" : code);
    }
  }, [queryClient]);
  const signOut = useCallback(async () => {
    ++generation.current;
    setStatus("loading");
    useReportStore.getState().reset();
    localStorage.removeItem("jf-bioreport-draft-owner");
    queryClient.clear();
    hadSession.current = false;
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        setStatus("unavailable");
        return;
      }
      window.location.assign("/login");
    } catch {
      setStatus("unavailable");
    }
  }, [queryClient]);
  useEffect(() => {
    void refresh();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // Run outside the auth callback so Supabase can release its session lock.
      if (event === "SIGNED_OUT") {
        ++generation.current;
        queryClient.clear();
        setStatus(hadSession.current ? "expired" : "guest");
      } else if (event !== "INITIAL_SESSION") {
        ++generation.current;
        setStatus("loading");
        setTimeout(() => void refresh(), 0);
      }
    });
    const failure = (event: Event) => {
      ++generation.current;
      queryClient.clear();
      const code = (event as CustomEvent<AccessError>).detail.code;
      setStatus(code === "guest" ? "expired" : code);
    };
    const focus = () => {
      void refresh();
    };
    window.addEventListener(ACCESS_EVENT, failure);
    window.addEventListener("focus", focus);
    const timer = window.setInterval(focus, 60_000);
    return () => {
      // Invalidate pending async work, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ++generation.current;
      data.subscription.unsubscribe();
      window.removeEventListener(ACCESS_EVENT, failure);
      window.removeEventListener("focus", focus);
      window.clearInterval(timer);
    };
  }, [refresh, queryClient]);
  return (
    <AccessContext.Provider value={{ status, refresh, signOut }}>{children}</AccessContext.Provider>
  );
}

export function AccessGate({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const { status, refresh, signOut } = useAccess();
  // New application pages are private by default; consent has its own OAuth flow.
  if (
    ["/", "/login", "/auth", "/anamnese", "/.lovable/oauth/consent"].includes(path) ||
    status === "admin"
  )
    return children;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md space-y-5 text-center">
        <h1 className="font-serif text-3xl">
          {status === "loading"
            ? "Verificando acesso…"
            : status === "forbidden"
              ? "Acesso restrito a admin"
              : status === "expired"
                ? "Sessão expirada"
                : "Acesso aos relatórios"}
        </h1>
        {status !== "loading" && <p role="alert">{new AccessError(status).message}</p>}
        <div className="flex flex-wrap justify-center gap-3">
          {(status === "guest" || status === "expired") && (
            <Button asChild>
              <a
                href={`/login?returnTo=${encodeURIComponent(safeReturnTo(path))}&reason=${status}`}
              >
                Entrar com Google
              </a>
            </Button>
          )}
          {status === "forbidden" && (
            <Button onClick={() => void signOut()}>Sair e trocar de conta</Button>
          )}
          {status === "unavailable" && (
            <Button onClick={() => void refresh()}>Tentar novamente</Button>
          )}
          <Button asChild variant="outline">
            <a href="/">Início</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
