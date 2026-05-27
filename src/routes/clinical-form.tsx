import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  emptyClinicalData,
  useReportStore,
  type ClinicalData,
  type YesNo,
} from "@/store/report-store";

export const Route = createFileRoute("/clinical-form")({
  head: () => ({
    meta: [
      { title: "Dados clínicos — JF BioReport" },
      { name: "description", content: "Formulário clínico complementar do paciente." },
    ],
  }),
  component: ClinicalFormPage,
});

const HEALTH_FIELDS: { key: keyof ClinicalData; label: string }[] = [
  { key: "menopause", label: "Menopausa" },
  { key: "gallbladderRemoved", label: "Vesícula retirada" },
  { key: "diabetes", label: "Diabetes" },
  { key: "hypertension", label: "Hipertensão" },
  { key: "constipation", label: "Intestino preso" },
  { key: "bingeEating", label: "Compulsão alimentar" },
  { key: "nightHunger", label: "Fome noturna" },
];

function ClinicalFormPage() {
  const navigate = useNavigate();
  const { clinicalData, setClinicalData } = useReportStore();
  const [data, setData] = useState<ClinicalData>(clinicalData ?? emptyClinicalData);
  const [errors, setErrors] = useState<Partial<Record<keyof ClinicalData, string>>>({});

  const update = <K extends keyof ClinicalData>(key: K, value: ClinicalData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!data.mainGoal) newErrors.mainGoal = "Obrigatório";
    if (!data.weeklyTrainingFrequency) newErrors.weeklyTrainingFrequency = "Obrigatório";
    if (!data.mealsPerDay) newErrors.mealsPerDay = "Obrigatório";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    setClinicalData(data);
    navigate({ to: "/review" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-10">
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          <Stepper current={3} />

          <Card className="mt-10 border-border/80">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Dados clínicos</CardTitle>
              <CardDescription>
                Informações que complementam o exame de bioimpedância.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <Section title="Objetivo">
                <Field label="Objetivo principal" error={errors.mainGoal} className="sm:col-span-2">
                  <Select
                    value={data.mainGoal || undefined}
                    onValueChange={(v) => update("mainGoal", v as ClinicalData["mainGoal"])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                      <SelectItem value="recomposicao">Recomposição corporal</SelectItem>
                      <SelectItem value="ganho_massa">Ganho de massa</SelectItem>
                      <SelectItem value="manutencao">Manutenção</SelectItem>
                      <SelectItem value="alta_performance">Alta performance</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </Section>

              <Section title="Rotina">
                <Field label="Horário que acorda">
                  <Input
                    type="time"
                    value={data.wakeTime}
                    onChange={(e) => update("wakeTime", e.target.value)}
                  />
                </Field>
                <Field label="Horário que dorme">
                  <Input
                    type="time"
                    value={data.sleepTime}
                    onChange={(e) => update("sleepTime", e.target.value)}
                  />
                </Field>
                <Field label="Horário do treino">
                  <Input
                    type="time"
                    value={data.trainingTime}
                    onChange={(e) => update("trainingTime", e.target.value)}
                  />
                </Field>
                <Field
                  label="Frequência de treino semanal"
                  error={errors.weeklyTrainingFrequency}
                >
                  <Input
                    type="number"
                    min={0}
                    max={7}
                    value={data.weeklyTrainingFrequency}
                    onChange={(e) => update("weeklyTrainingFrequency", e.target.value)}
                  />
                </Field>
                <Field label="Tipo de treino" className="sm:col-span-2">
                  <Input
                    value={data.trainingType}
                    onChange={(e) => update("trainingType", e.target.value)}
                    placeholder="Ex.: musculação, corrida, crossfit…"
                  />
                </Field>
              </Section>

              <Section title="Histórico de saúde">
                {HEALTH_FIELDS.map((f) => (
                  <YesNoField
                    key={f.key}
                    label={f.label}
                    value={data[f.key] as YesNo}
                    onChange={(v) => update(f.key, v as ClinicalData[typeof f.key])}
                  />
                ))}
              </Section>

              <Section title="Alimentação">
                <Field label="Refeições por dia" error={errors.mealsPerDay}>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={data.mealsPerDay}
                    onChange={(e) => update("mealsPerDay", e.target.value)}
                  />
                </Field>
                <Field label="Alimentos que não consome" className="sm:col-span-2">
                  <Textarea
                    rows={3}
                    value={data.avoidedFoods}
                    onChange={(e) => update("avoidedFoods", e.target.value)}
                    placeholder="Liste os alimentos evitados ou restrições"
                  />
                </Field>
              </Section>
            </CardContent>
          </Card>

          <div className="mt-8 flex items-center justify-between">
            <Button asChild variant="ghost" type="button">
              <Link to="/body-composition">
                <ArrowLeft />
                Voltar
              </Link>
            </Button>
            <Button type="submit">
              Continuar
              <ArrowRight />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 inline-block text-sm">{label}</Label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function YesNoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3">
      <Label className="text-sm">{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as YesNo)}
        className="flex items-center gap-4"
      >
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RadioGroupItem value="sim" /> Sim
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RadioGroupItem value="nao" /> Não
        </label>
      </RadioGroup>
    </div>
  );
}
