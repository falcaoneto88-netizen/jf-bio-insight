import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

type AuthorizationDetails = {
  client?: { name?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

type OAuthApi = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (
    id: string,
  ) => Promise<{ data: AuthorizationDetails | null; error: { message: string } | null }>;
};

function oauthApi(): OAuthApi {
  return (supabase.auth as unknown as { oauth: OAuthApi }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id");
    if (!authorizationId) throw new Error("Pedido de autorização inválido.");
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return null;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  errorComponent: ({ error }) => (
    <Shell>
      <p className="text-sm text-destructive">
        Não foi possível carregar este pedido de autorização:{" "}
        {String((error as Error)?.message ?? error)}
      </p>
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <Card className="w-full max-w-md border-border/80">
          <CardContent className="pt-6">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);

  async function signIn() {
    setBusy(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.href,
    });
    if ("error" in result && result.error) {
      setBusy(false);
      setError(result.error.message);
      return;
    }
    window.location.reload();
  }

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: err } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não devolveu um destino de retorno.");
      return;
    }
    window.location.href = target;
  }

  if (signedIn === null) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">A verificar a sua sessão…</p>
      </Shell>
    );
  }

  if (!signedIn) {
    return (
      <Shell>
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-serif text-xl">Entrar para continuar</CardTitle>
          <CardDescription>
            Autentique-se para autorizar o acesso aos relatórios clínicos.
          </CardDescription>
        </CardHeader>
        {error && (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        )}
        <Button disabled={busy} onClick={() => void signIn()} className="w-full">
          Entrar com Google
        </Button>
      </Shell>
    );
  }

  const clientName = details?.client?.name ?? "esta aplicação";

  return (
    <Shell>
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-serif text-xl">Autorizar {clientName}</CardTitle>
        <CardDescription>
          {clientName} poderá consultar os relatórios clínicos em seu nome. Pode revogar o acesso a
          qualquer momento.
        </CardDescription>
      </CardHeader>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button disabled={busy} onClick={() => void decide(true)} className="flex-1">
          Autorizar
        </Button>
        <Button
          disabled={busy}
          variant="outline"
          onClick={() => void decide(false)}
          className="flex-1"
        >
          Recusar
        </Button>
      </div>
    </Shell>
  );
}
