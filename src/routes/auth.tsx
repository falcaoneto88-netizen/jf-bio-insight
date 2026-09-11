import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    proximo: typeof search["proximo"] === "string" ? search["proximo"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Entrar — Jornada clínica Dr. João Falcão" },
      {
        name: "description",
        content: "Acesso restrito ao consultório: entre com a sua conta Google para abrir a jornada clínica.",
      },
      { property: "og:title", content: "Entrar — Jornada clínica Dr. João Falcão" },
      { property: "og:description", content: "Acesso restrito ao consultório." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destino = search.proximo && search.proximo.startsWith("/") ? search.proximo : "/jornada";

  useEffect(() => {
    let active = true;
    const go = async () => {
      const { data } = await supabase.auth.getSession();
      if (active && data.session) void navigate({ to: destino });
    };
    void go();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: destino });
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [destino, navigate]);

  const entrar = async () => {
    setLoading(true);
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result && "error" in result && result.error) {
      setError("Não foi possível entrar. Tente novamente.");
      setLoading(false);
      return;
    }
    if (result && "redirected" in result && result.redirected) return; // navegação em curso
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-md border-border">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Acesso ao consultório</CardTitle>
            <CardDescription>
              A jornada clínica é privada. Entre com a conta autorizada para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full" size="lg" onClick={entrar} disabled={loading}>
              {loading ? "A abrir o Google…" : "Entrar com Google"}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
