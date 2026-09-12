import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable";
import { useAccess } from "@/components/AccessBoundary";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { safeReturnTo } from "@/lib/access";

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: safeReturnTo(search.returnTo),
    reason: search.reason === "expired" ? "expired" : undefined,
  }),
  component: LoginPage,
});
function LoginPage() {
  const { returnTo, reason } = Route.useSearch();
  const { status, refresh, signOut } = useAccess();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (status === "admin") void navigate({ to: safeReturnTo(returnTo), replace: true });
  }, [status, returnTo, navigate]);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (query.has("error") || hash.has("error")) {
      setError("O login não foi concluído pelo Google. Tente novamente.");
      window.history.replaceState(null, "", `/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [returnTo]);
  async function signIn() {
    setBusy(true);
    setError("");
    try {
      const redirect = new URL("/login", window.location.origin);
      redirect.searchParams.set("returnTo", safeReturnTo(returnTo));
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirect.href });
      if ("error" in result && result.error) throw new Error("Login incompleto");
      if ("redirected" in result && result.redirected) return;
      await refresh();
    } catch {
      setError("Não foi possível entrar com Google. Tente novamente.");
    }
    setBusy(false);
  }
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto max-w-md space-y-6 px-6 py-16">
        <h1 className="font-serif text-3xl">Entrar no BioReport Studio</h1>
        <p className="text-muted-foreground">
          Use sua conta Google autorizada. O histórico e a criação de relatórios são restritos a
          administradores.
        </p>
        {(reason === "expired" || status === "expired") && (
          <p role="alert">
            Sua sessão expirou. Entre novamente com a mesma conta para retomar seu rascunho.
          </p>
        )}
        {status === "forbidden" && (
          <p role="alert">
            Acesso restrito a admin. Esta conta não tem permissão. Entre com outra conta ou solicite
            acesso ao responsável.
          </p>
        )}
        {status === "unavailable" && (
          <p role="alert">
            Não foi possível verificar seu acesso. Confira a conexão e tente novamente.
          </p>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {status === "forbidden" ? (
          <Button onClick={() => void signOut()}>Sair e trocar de conta</Button>
        ) : (
          <Button
            disabled={busy || status === "loading" || status === "admin"}
            onClick={() => void signIn()}
          >
            {busy
              ? "Entrando…"
              : status === "loading"
                ? "Verificando sessão…"
                : "Entrar com Google"}
          </Button>
        )}
      </main>
    </div>
  );
}
