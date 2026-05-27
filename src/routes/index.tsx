import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileCheck2, ShieldCheck, Sparkles } from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JF BioReport — Relatórios clínicos premium de bioimpedância" },
      {
        name: "description",
        content:
          "Transforme exames de bioimpedância em relatórios clínicos elegantes, precisos e profissionais.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" />
          <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
            <p className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold-soft/30 px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-gold" />
              Edição clínica premium
            </p>
            <h1 className="mt-8 font-serif text-5xl leading-[1.05] text-foreground sm:text-6xl md:text-7xl">
              Relatórios de bioimpedância
              <span className="block text-gold">com padrão clínico.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              Transforme cada exame em um relatório elegante, preciso e pronto para entregar ao
              paciente — com a sofisticação que sua prática merece.
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 px-8 text-base">
                <Link to="/upload">
                  Iniciar novo relatório
                  <ArrowRight className="ml-1" />
                </Link>
              </Button>
              <span className="text-xs text-muted-foreground">
                Aceita PDF, PNG ou JPG do exame
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Preciso"
              text="Estrutura clínica revisada, campos completos, dados consistentes."
            />
            <FeatureCard
              icon={<Sparkles className="h-5 w-5" />}
              title="Elegante"
              text="Tipografia editorial e composição limpa, com acabamento premium."
            />
            <FeatureCard
              icon={<FileCheck2 className="h-5 w-5" />}
              title="Profissional"
              text="Fluxo guiado, revisão final e relatório pronto para o paciente."
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground sm:flex-row">
          <span>© {new Date().getFullYear()} JF BioReport</span>
          <span className="tracking-[0.2em] uppercase">Clinical Excellence</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="group rounded-lg border border-border bg-card p-6 transition-colors hover:border-gold/60">
      <div className="flex h-10 w-10 items-center justify-center rounded-sm border border-gold/50 text-gold transition-colors group-hover:bg-gold group-hover:text-gold-foreground">
        {icon}
      </div>
      <h3 className="mt-5 font-serif text-xl text-foreground">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
