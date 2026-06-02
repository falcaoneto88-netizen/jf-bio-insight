import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Download, FileText, Loader2, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { classifyBody, PROFILE_LABELS } from "@/lib/body-classifier";
import { DIETA_BASE_DR_JOAO } from "@/lib/diet-base";
import { applyDietCustomization } from "@/lib/diet-customization";
import { adjustDiet } from "@/lib/diet-adjuster";
import { useReportStore, type MainGoal } from "@/store/report-store";

const GOAL_LABELS: Record<MainGoal, string> = {
  emagrecimento: "Emagrecimento",
  recomposicao: "Recomposição corporal",
  ganho_massa: "Ganho de massa muscular",
  manutencao: "Manutenção",
  alta_performance: "Alta performance",
  "": "—",
};

function parseKg(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^\d,.\-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export const Route = createFileRoute("/success")({
  head: () => ({
    meta: [
      { title: "Relatório gerado — JF BioReport" },
      { name: "description", content: "Confirmação de geração do relatório clínico." },
    ],
  }),
  component: SuccessPage,
});

function SuccessPage() {
  const navigate = useNavigate();
  const { bodyComposition: bc, clinicalData: cd, reset } = useReportStore();
  const dietCustomization = useReportStore((s) => s.dietCustomization);

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    setGeneratedAt(new Date().toISOString());
  }, []);

  const patientName =
    bc?.patientName || cd?.patientName || "Paciente";

  const analysis = useMemo(() => classifyBody(bc, cd), [bc, cd]);

  const diet = useMemo(
    () =>
      adjustDiet(applyDietCustomization(DIETA_BASE_DR_JOAO, dietCustomization), {
        weightKg: parseKg(bc?.weight) ?? parseKg(cd?.weight),
        profile: analysis?.primaryProfile ?? null,
        mainGoal: cd?.mainGoal ?? "",
        clinical: cd
          ? {
              gallbladderRemoved: cd.gallbladderRemoved,
              menopause: cd.menopause,
              currentlyTraining: cd.currentlyTraining,
              trainingTime: cd.trainingTime,
              diabetes: cd.diabetes,
              hypertension: cd.hypertension,
            }
          : null,
      }),
    [
      bc?.weight,
      cd?.weight,
      cd?.mainGoal,
      cd?.gallbladderRemoved,
      cd?.menopause,
      cd?.currentlyTraining,
      cd?.trainingTime,
      cd?.diabetes,
      cd?.hypertension,
      analysis?.primaryProfile,
      dietCustomization,
    ],
  );

  // Acesso direto sem dados → volta para a home
  useEffect(() => {
    if (!bc && !cd) {
      navigate({ to: "/", replace: true });
    }
  }, [bc, cd, navigate]);

  const goalLabel = cd?.mainGoal ? GOAL_LABELS[cd.mainGoal] : "—";
  const classification = analysis
    ? PROFILE_LABELS[analysis.primaryProfile]
    : "—";

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const [{ pdf }, { ReportDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/pdf/ReportDocument"),
      ]);
      const blob = await pdf(
        <ReportDocument
          bodyComposition={bc}
          clinicalData={cd}
          analysis={analysis}
          diet={diet}
          includeAdvancedProtocol={false}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const stamp = `${String(d.getDate()).padStart(2, "0")}${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}${d.getFullYear()}`;
      const slug =
        patientName
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase() || "paciente";
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${slug}-${stamp}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success("Download iniciado");
    } catch (err) {
      console.error(err);
      const description =
        err instanceof Error && err.message ? err.message : undefined;
      toast.error("Falha ao gerar o PDF", { description });
    } finally {
      setIsDownloading(false);
    }

  };

  const handleNewReport = () => {
    reset();
    navigate({ to: "/" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
            <div className="mx-auto grid h-16 w-16 place-content-center rounded-full border border-gold/50 bg-gold-soft/30 text-gold">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h1 className="mt-6 font-serif text-3xl text-foreground sm:text-4xl">
              Relatório gerado com sucesso
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Seu relatório clínico premium está pronto para download.
            </p>
          </div>

          <Card className="mt-10 border-gold/40">
            <CardContent className="space-y-4 p-6">
              <Row label="Paciente" value={patientName} highlight />
              <Row label="Data de geração" value={generatedAt ? formatDateTime(generatedAt) : "—"} />
              <Row label="Objetivo" value={goalLabel} />
              <div className="flex items-center justify-between gap-4 pt-1">
                <span className="text-sm text-muted-foreground">Classificação corporal</span>
                <span className="rounded-sm border border-gold bg-gold/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-gold">
                  {classification}
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 grid gap-3">
            <Button
              size="lg"
              onClick={handleDownload}
              disabled={isDownloading || generatedAt === null}
              className="bg-gold text-gold-foreground hover:bg-gold/90"
            >

              {isDownloading ? (
                <>
                  <Loader2 className="animate-spin" />
                  Preparando…
                </>
              ) : (
                <>
                  <Download />
                  Baixar PDF
                </>
              )}
            </Button>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" size="lg">
                <Link to="/review">
                  <Pencil />
                  Editar dados
                </Link>
              </Button>
              <Button variant="outline" size="lg" onClick={handleNewReport}>
                <Plus />
                Gerar novo relatório
              </Button>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center">
            <Button asChild variant="ghost" size="sm">
              <Link to="/history">
                <FileText className="h-4 w-4" />
                Ver histórico de relatórios
              </Link>
            </Button>
          </div>

          <p className="mt-10 text-center text-xs italic text-muted-foreground">
            Relatório gerado pelo método Dr. João Falcão — acompanhamento individualizado.
          </p>
        </div>
      </main>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed border-border/60 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          highlight
            ? "font-serif text-lg text-foreground"
            : "text-sm font-medium text-foreground"
        }
      >
        {value}
      </span>
    </div>
  );
}
