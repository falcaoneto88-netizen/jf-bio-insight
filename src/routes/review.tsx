import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileText, Loader2, Pencil, ShieldCheck, Sparkles, Activity } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { BrandHeader } from "@/components/BrandHeader";
import { DietPlanCard } from "@/components/DietPlanCard";
import { DietEditorCard } from "@/components/DietEditorCard";
import { PrescriptionCard } from "@/components/PrescriptionCard";
import { ReportNotesCard } from "@/components/ReportNotesCard";
import { ReportSectionsCard } from "@/components/ReportSectionsCard";
import { ReturnVisitBadge } from "@/components/ReturnVisitBadge";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { classifyBody, PROFILE_LABELS } from "@/lib/body-classifier";
import { DIETA_BASE_DR_JOAO } from "@/lib/diet-base";
import { applyDietCustomization } from "@/lib/diet-customization";
import { adjustDiet } from "@/lib/diet-adjuster";
import { addReportToHistory } from "@/lib/report-history";
import {
  useReportStore,
  type MainGoal,
  type Sex,
  type TrainingType,
  type YesNo,
  type YesNoNA,
} from "@/store/report-store";

function parseKg(v: string | undefined | null): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(/[^\d,.\-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Revisão — JF BioReport" },
      { name: "description", content: "Revise os dados antes de gerar o relatório clínico." },
    ],
  }),
  component: ReviewPage,
});

const GOAL_LABELS: Record<MainGoal, string> = {
  emagrecimento: "Emagrecimento",
  recomposicao: "Recomposição corporal",
  ganho_massa: "Ganho de massa muscular",
  manutencao: "Manutenção",
  alta_performance: "Alta performance",
  "": "—",
};

const SEX_LABELS: Record<Sex, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
  "": "—",
};

const TRAINING_TYPE_LABELS: Record<TrainingType, string> = {
  musculacao: "Musculação",
  cardio: "Cardio",
  funcional: "Funcional",
  personal: "Personal trainer",
  outro: "Outro",
  "": "—",
};

function ReviewPage() {
  const navigate = useNavigate();
  const { file, bodyComposition, clinicalData, previousExam } = useReportStore();
  const dietCustomization = useReportStore((s) => s.dietCustomization);

  const bc = bodyComposition;
  const cd = clinicalData;

  const analysis = useMemo(
    () => classifyBody(bodyComposition, clinicalData),
    [bodyComposition, clinicalData],
  );

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

  const prescription = useReportStore((s) => s.prescription);
  const reportOptions = useReportStore((s) => s.reportOptions);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    const anyEnabled = Object.values(reportOptions.sections).some(Boolean);
    if (!anyEnabled) {
      toast.error("Selecione pelo menos uma seção do relatório");
      return;
    }
    setIsGenerating(true);
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
          prescription={prescription}
          includeAdvancedProtocol={prescription?.advancedEnabled ?? false}
          previousExam={previousExam}
          options={reportOptions}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const stamp = `${String(d.getDate()).padStart(2, "0")}${String(
        d.getMonth() + 1,
      ).padStart(2, "0")}${d.getFullYear()}`;
      const slug = (bc?.patientName || cd?.patientName || "paciente")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase() || "paciente";
      const fileName = `relatorio-${slug}-${stamp}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);

      try {
        await addReportToHistory({
          patientName: bc?.patientName || cd?.patientName || "Paciente",
          examDate: bc?.examDateTime || "",
          generatedAt: new Date().toISOString(),
          mainGoal: cd?.mainGoal ? GOAL_LABELS[cd.mainGoal] : "—",
          bodyClassification: analysis
            ? PROFILE_LABELS[analysis.primaryProfile]
            : "—",
          pdfFileName: fileName,
          bodyComposition: bc,
          clinicalData: cd,
        });
      } catch (e) {
        console.error("[reports] failed to save to cloud", e);
        toast.warning("Relatório gerado, mas não foi guardado na cloud");
      }


      toast.success("Relatório gerado", {
        description: "O download do PDF foi iniciado.",
      });
      navigate({ to: "/success" });
    } catch (err) {
      console.error(err);
      toast.error("Falha ao gerar o PDF", {
        description: "Tente novamente em alguns instantes.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-4xl">
          <Stepper current={4} />

          <div className="mt-6">
            <ReturnVisitBadge />
          </div>

          <div className="mt-4 mb-6 text-center">
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl">Revisão final</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Confirme os dados antes de gerar o relatório clínico.
            </p>
          </div>

          <div className="space-y-4">
            <ReportSectionsCard />
            <ReportNotesCard />




            <Card className="border-gold/40">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <Activity className="h-4 w-4 text-gold" />
                  Análise preliminar
                </CardTitle>
              </CardHeader>
              <CardContent>
                {analysis ? (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-sm border border-gold bg-gold/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-gold">
                        {PROFILE_LABELS[analysis.primaryProfile]}
                      </span>
                      {analysis.secondaryProfiles.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-sm border border-border px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          {PROFILE_LABELS[tag]}
                        </span>
                      ))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <NarrativeBlock title="Diagnóstico corporal" text={analysis.narrative.diagnosis} />
                      <NarrativeBlock title="Ponto forte" text={analysis.narrative.strength} />
                      <NarrativeBlock title="Ponto de atenção" text={analysis.narrative.attention} />
                      <NarrativeBlock title="Estratégia principal" text={analysis.narrative.strategy} />
                    </div>
                  </div>
                ) : (
                  <Empty label="Preencha sexo, idade, peso, altura e % de gordura para gerar a análise." />
                )}
              </CardContent>
            </Card>

            <DietEditorCard />

            <DietPlanCard diet={diet} />

            <PrescriptionCard />







            <Section title="Arquivo enviado" editTo="/upload">
              {file ? (
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-content-center rounded-sm border border-gold/40 text-gold">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB · {file.type}
                    </p>
                  </div>
                </div>
              ) : (
                <Empty label="Nenhum arquivo enviado." />
              )}
            </Section>

            <Section title="Dados do paciente" editTo="/clinical-form">
              {cd ? (
                <DataGrid
                  items={[
                    ["Nome", cd.patientName || "—"],
                    ["Sexo", SEX_LABELS[cd.sex]],
                    ["Idade", fmt(cd.age, "anos")],
                    ["Altura", fmt(cd.height, "cm")],
                    ["Peso", fmt(cd.weight, "kg")],
                    ["Objetivo", GOAL_LABELS[cd.mainGoal]],
                  ]}
                />
              ) : (
                <Empty label="Dados do paciente ainda não preenchidos." />
              )}
            </Section>

            <Section title="Dados da bioimpedância" editTo="/body-composition">
              {bc ? (
                <div className="space-y-4">
                  <DataGrid
                    items={[
                      ["Nome", bc.patientName],
                      ["Data do exame", bc.examDateTime],
                      ["Sexo", SEX_LABELS[bc.sex]],
                      ["Idade", fmt(bc.age, "anos")],
                      ["Altura", fmt(bc.height, "cm")],
                      ["Peso", fmt(bc.weight, "kg")],
                      ["IMC", fmt(bc.bmi, "kg/m²")],
                      ["Massa muscular esquelética", fmt(bc.skeletalMuscleMass, "kg")],
                      ["% gordura corporal", fmt(bc.bodyFatPercentage, "%")],
                      ["Massa de gordura corporal", fmt(bc.bodyFatMass, "kg")],
                      ["Gordura visceral", bc.visceralFat || "—"],
                      ["Taxa metabólica basal", fmt(bc.basalMetabolicRate, "kcal")],
                      ["Relação cintura-quadril", bc.waistHipRatio || "—"],
                      ["Água corporal total", fmt(bc.totalBodyWater, "L")],
                      ["Massa livre de gordura", fmt(bc.fatFreeMass, "kg")],
                    ]}
                  />
                  {((bc.weightHistory ?? []).length > 0 ||
                    (bc.skeletalMuscleHistory ?? []).length > 0 ||
                    (bc.bodyFatHistory ?? []).length > 0) && (
                    <div className="space-y-2 border-t border-border/60 pt-3">
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        Histórico
                      </p>
                      <HistoryList label="Peso (kg)" rows={bc.weightHistory ?? []} />
                      <HistoryList
                        label="Massa muscular esquelética (kg)"
                        rows={bc.skeletalMuscleHistory ?? []}
                      />
                      <HistoryList label="% gordura corporal" rows={bc.bodyFatHistory ?? []} />
                    </div>
                  )}
                </div>
              ) : (
                <Empty label="Bioimpedância ainda não preenchida." />
              )}
            </Section>

            <Section title="Rotina e trabalho" editTo="/clinical-form">
              {cd ? (
                <DataGrid
                  items={[
                    ["Horário que acorda", cd.wakeTime || "—"],
                    ["Horário que dorme", cd.sleepTime || "—"],
                    ["Horário de trabalho", cd.workSchedule || "—"],
                  ]}
                />
              ) : (
                <Empty label="Rotina ainda não preenchida." />
              )}
            </Section>

            <Section title="Treino" editTo="/clinical-form">
              {cd ? (
                <DataGrid
                  items={[
                    ["Treina atualmente", yn(cd.currentlyTraining)],
                    ["Frequência semanal", fmt(cd.weeklyTrainingFrequency, "x/sem")],
                    ["Horário do treino", cd.trainingTime || "—"],
                    [
                      "Tipo de treino",
                      cd.trainingType === "outro" && cd.trainingTypeOther
                        ? `Outro: ${cd.trainingTypeOther}`
                        : TRAINING_TYPE_LABELS[cd.trainingType],
                    ],
                  ]}
                />
              ) : (
                <Empty label="Treino ainda não preenchido." />
              )}
            </Section>

            <Section title="Saúde" editTo="/clinical-form">
              {cd ? (
                <DataGrid
                  items={[
                    ["Doenças prévias", cd.previousDiseases || "—"],
                    ["Medicamentos", cd.medications || "—"],
                    ["Cirurgias prévias", cd.previousSurgeries || "—"],
                    ["Alergias/intolerâncias", cd.allergiesIntolerances || "—"],
                    ["Vesícula retirada", yn(cd.gallbladderRemoved)],
                    ["Menopausa", ynna(cd.menopause)],
                    ["Diabetes", yn(cd.diabetes)],
                    ["Hipertensão", yn(cd.hypertension)],
                    ["Intestino preso", yn(cd.constipation)],
                    ["Compulsão alimentar", yn(cd.bingeEating)],
                    ["Fome noturna", yn(cd.nightHunger)],
                  ]}
                />
              ) : (
                <Empty label="Dados clínicos ainda não preenchidos." />
              )}
            </Section>

            <Section title="Preferência alimentar" editTo="/clinical-form">
              {cd ? (
                <DataGrid
                  items={[
                    ["Refeições por dia", cd.mealsPerDay || "—"],
                    ["Alimentos que não consome", cd.avoidedFoods || "—"],
                    ["Observações", cd.additionalNotes || "—"],
                  ]}
                />
              ) : (
                <Empty label="Preferências alimentares não preenchidas." />
              )}
            </Section>
          </div>

          <div className="mt-10 flex items-start gap-3 rounded-md border border-gold/40 bg-gold-soft/20 px-4 py-3 text-sm text-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <p>
              Conduta sugerida — este relatório deve ser revisado e validado por um
              profissional antes de ser enviado ao paciente.
            </p>
          </div>

          <div className="mt-6 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="ghost" type="button">
              <Link to="/clinical-form">
                <ArrowLeft />
                Voltar
              </Link>
            </Button>
            <Button
              size="lg"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-gold text-gold-foreground hover:bg-gold/90"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <Sparkles />
                  Gerar relatório
                </>
              )}
            </Button>
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            O PDF é gerado localmente e baixado no seu dispositivo.
          </p>

          <div className="mt-2 text-center">
            <button
              onClick={() => {
                useReportStore.getState().reset();
                navigate({ to: "/" });
              }}
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Começar novo relatório
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  editTo,
  children,
}: {
  title: string;
  editTo: "/upload" | "/body-composition" | "/clinical-form";
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/80">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="font-serif text-lg">{title}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to={editTo}>
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Link>
        </Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function DataGrid({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-dashed border-border/60 py-1.5">
          <dt className="text-sm text-muted-foreground">{k}</dt>
          <dd className="text-sm font-medium text-foreground text-right">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground italic">{label}</p>;
}

function NarrativeBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="border-l-2 border-gold/60 pl-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gold">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}

function HistoryList({
  label,
  rows,
}: {
  label: string;
  rows: { date: string; value: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{label}</p>
      <ul className="mt-1 grid gap-1 sm:grid-cols-2">
        {rows.map((r, i) => (
          <li
            key={i}
            className="flex justify-between gap-3 border-b border-dashed border-border/60 py-1 text-xs"
          >
            <span className="text-muted-foreground">{r.date || "—"}</span>
            <span className="font-medium text-foreground">{r.value || "—"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmt(v: string, suffix: string) {
  if (!v) return "—";
  return `${v} ${suffix}`;
}

function yn(v: YesNo) {
  if (v === "sim") return "Sim";
  if (v === "nao") return "Não";
  return "—";
}

function ynna(v: YesNoNA) {
  if (v === "sim") return "Sim";
  if (v === "nao") return "Não";
  if (v === "na") return "Não se aplica";
  return "—";
}
