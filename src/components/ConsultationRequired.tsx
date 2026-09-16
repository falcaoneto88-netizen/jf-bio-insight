import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useReportStore } from "@/store/report-store";
import { BrandHeader } from "./BrandHeader";
import { Button } from "./ui/button";

export function ConsultationRequired({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const consultation = useReportStore((s) => s.consultation);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  if (!["/upload", "/body-composition", "/clinical-form", "/review"].includes(path))
    return children;
  if (!hydrated)
    return (
      <main className="p-10" role="status">
        Abrindo consulta…
      </main>
    );
  if (consultation) return children;
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto max-w-2xl space-y-5 px-6 py-14">
        <h1 className="font-serif text-3xl">Escolha a consulta do paciente</h1>
        <p>Abra ou crie um atendimento para reunir anamnese, bioimpedância, análise e relatório.</p>
        <p className="text-sm text-muted-foreground">
          Se houver um rascunho neste navegador, ele será preservado até você escolher como
          continuar.
        </p>
        <Button asChild>
          <Link to="/consulta" search={{ id: undefined }}>
            Abrir consultas
          </Link>
        </Button>
      </main>
    </div>
  );
}
