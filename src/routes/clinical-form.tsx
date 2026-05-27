import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";

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
  type YesNoNA,
} from "@/store/report-store";

export const Route = createFileRoute("/clinical-form")({
  head: () => ({
    meta: [
      { title: "Dados Clínicos Complementares — JF BioReport" },
      {
        name: "description",
        content:
          "Informações clínicas, rotina, treino e preferências alimentares para complementar a bioimpedância.",
      },
    ],
  }),
  component: ClinicalFormPage,
});

const YN_HEALTH: { key: keyof ClinicalData; label: string }[] = [
  { key: "gallbladderRemoved", label: "Vesícula retirada" },
  { key: "diabetes", label: "Diabetes" },
  { key: "hypertension", label: "Hipertensão" },
  { key: "constipation", label: "Intestino preso" },
  { key: "bingeEating", label: "Compulsão alimentar" },
  { key: "nightHunger", label: "Fome noturna" },
];

type Errors = Partial<Record<keyof ClinicalData, string>>;

function ClinicalFormPage() {
  const navigate = useNavigate();
  const { clinicalData, bodyComposition, setClinicalData } = useReportStore();

  // Pré-preenche com bioimpedância se ainda não há clinicalData salvo
  const initial: ClinicalData =
    clinicalData ??
    {
      ...emptyClinicalData,
      patientName: bodyComposition?.patientName ?? "",
      sex: bodyComposition?.sex ?? "",
      age: bodyComposition?.age ?? "",
      height: bodyComposition?.height ?? "",
      weight: bodyComposition?.weight ?? "",
    };

  const [data, setData] = useState<ClinicalData>(initial);
  const [errors, setErrors] = useState<Errors>({});

  const update = <K extends keyof ClinicalData>(key: K, value: ClinicalData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Errors = {};
    if (!data.patientName.trim()) newErrors.patientName = "Obrigatório";
    if (!data.sex) newErrors.sex = "Obrigatório";
    if (!data.age) newErrors.age = "Obrigatório";
    if (!data.height) newErrors.height = "Obrigatório";
    if (!data.weight) newErrors.weight = "Obrigatório";
    if (!data.mainGoal) newErrors.mainGoal = "Obrigatório";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    setClinicalData(data);
    navigate({ to: "/review" });
  };

  const showTrainingDetails = data.currentlyTraining === "sim";
  const showTrainingOther = data.trainingType === "outro";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-10">
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          <Stepper current={3} />

          <div className="mt-10 mb-6 text-center">
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
              Dados Clínicos Complementares
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Informações que complementam o exame de bioimpedância.
            </p>
          </div>

          <div className="space-y-5">
            {/* 1. Dados do paciente */}
            <SectionCard
              title="Dados do paciente"
              description="Em breve estes campos serão preenchidos automaticamente pela leitura da bioimpedância."
            >
              <Field label="Nome do paciente" required error={errors.patientName} className="sm:col-span-2">
                <Input
                  value={data.patientName}
                  onChange={(e) => update("patientName", e.target.value)}
                  placeholder="Nome completo"
                />
              </Field>
              <Field label="Sexo" required error={errors.sex}>
                <Select value={data.sex || undefined} onValueChange={(v) => update("sex", v as ClinicalData["sex"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="feminino">Feminino</SelectItem>
                    <SelectItem value="masculino">Masculino</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Idade" required error={errors.age}>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={data.age}
                  onChange={(e) => update("age", e.target.value)}
                  placeholder="anos"
                />
              </Field>
              <Field label="Altura (cm)" required error={errors.height}>
                <Input
                  type="number"
                  min={0}
                  value={data.height}
                  onChange={(e) => update("height", e.target.value)}
                  placeholder="cm"
                />
              </Field>
              <Field label="Peso (kg)" required error={errors.weight}>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={data.weight}
                  onChange={(e) => update("weight", e.target.value)}
                  placeholder="kg"
                />
              </Field>
            </SectionCard>

            {/* 2. Objetivo */}
            <SectionCard title="Objetivo principal">
              <Field label="Objetivo" required error={errors.mainGoal} className="sm:col-span-2">
                <Select
                  value={data.mainGoal || undefined}
                  onValueChange={(v) => update("mainGoal", v as ClinicalData["mainGoal"])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o objetivo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="emagrecimento">Emagrecimento</SelectItem>
                    <SelectItem value="recomposicao">Recomposição corporal</SelectItem>
                    <SelectItem value="ganho_massa">Ganho de massa muscular</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                    <SelectItem value="alta_performance">Alta performance</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </SectionCard>

            {/* 3. Rotina */}
            <SectionCard title="Rotina">
              <Field label="Horário que acorda">
                <Input type="time" value={data.wakeTime} onChange={(e) => update("wakeTime", e.target.value)} />
              </Field>
              <Field label="Horário que dorme">
                <Input type="time" value={data.sleepTime} onChange={(e) => update("sleepTime", e.target.value)} />
              </Field>
              <Field label="Horário de trabalho" className="sm:col-span-2">
                <Input
                  value={data.workSchedule}
                  onChange={(e) => update("workSchedule", e.target.value)}
                  placeholder="Ex.: 9h às 18h"
                />
              </Field>
            </SectionCard>

            {/* 4. Treino */}
            <SectionCard title="Treino">
              <YesNoField
                label="Treina atualmente?"
                value={data.currentlyTraining}
                onChange={(v) => update("currentlyTraining", v)}
              />
              {showTrainingDetails && (
                <>
                  <Field label="Frequência semanal">
                    <Input
                      type="number"
                      min={0}
                      max={7}
                      value={data.weeklyTrainingFrequency}
                      onChange={(e) => update("weeklyTrainingFrequency", e.target.value)}
                      placeholder="x por semana"
                    />
                  </Field>
                  <Field label="Horário do treino">
                    <Input
                      type="time"
                      value={data.trainingTime}
                      onChange={(e) => update("trainingTime", e.target.value)}
                    />
                  </Field>
                  <Field label="Tipo de treino" className="sm:col-span-2">
                    <Select
                      value={data.trainingType || undefined}
                      onValueChange={(v) => update("trainingType", v as ClinicalData["trainingType"])}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="musculacao">Musculação</SelectItem>
                        <SelectItem value="cardio">Cardio</SelectItem>
                        <SelectItem value="funcional">Funcional</SelectItem>
                        <SelectItem value="personal">Personal trainer</SelectItem>
                        <SelectItem value="outro">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {showTrainingOther && (
                    <Field label="Descreva o tipo de treino" className="sm:col-span-2">
                      <Input
                        value={data.trainingTypeOther}
                        onChange={(e) => update("trainingTypeOther", e.target.value)}
                        placeholder="Ex.: crossfit, pilates…"
                      />
                    </Field>
                  )}
                </>
              )}
            </SectionCard>

            {/* 5. Saúde */}
            <SectionCard title="Saúde">
              <Field label="Doenças prévias" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={data.previousDiseases}
                  onChange={(e) => update("previousDiseases", e.target.value)}
                  placeholder="Liste condições relevantes"
                />
              </Field>
              <Field label="Medicamentos em uso" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={data.medications}
                  onChange={(e) => update("medications", e.target.value)}
                />
              </Field>
              <Field label="Cirurgias prévias" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={data.previousSurgeries}
                  onChange={(e) => update("previousSurgeries", e.target.value)}
                />
              </Field>
              <Field label="Alergias ou intolerâncias alimentares" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={data.allergiesIntolerances}
                  onChange={(e) => update("allergiesIntolerances", e.target.value)}
                />
              </Field>

              <YesNoNAField
                label="Menopausa"
                value={data.menopause}
                onChange={(v) => update("menopause", v)}
              />
              {YN_HEALTH.map((f) => (
                <YesNoField
                  key={f.key}
                  label={f.label}
                  value={data[f.key] as YesNo}
                  onChange={(v) => update(f.key, v as ClinicalData[typeof f.key])}
                />
              ))}
            </SectionCard>

            {/* 6. Preferência alimentar */}
            <SectionCard title="Preferência alimentar">
              <Field label="Refeições por dia">
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
                  placeholder="Liste alimentos evitados ou restrições"
                />
              </Field>
              <Field label="Observações adicionais" className="sm:col-span-2">
                <Textarea
                  rows={3}
                  value={data.additionalNotes}
                  onChange={(e) => update("additionalNotes", e.target.value)}
                  placeholder="Qualquer informação relevante para o relatório"
                />
              </Field>
            </SectionCard>
          </div>

          <div className="mt-8 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
            <Button asChild variant="ghost" type="button">
              <Link to="/body-composition">
                <ArrowLeft />
                Voltar
              </Link>
            </Button>
            <Button type="submit" size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Sparkles />
              Continuar para análise
              <ArrowRight />
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/80">
      <CardHeader>
        <CardTitle className="font-serif text-xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">{children}</div>
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  error,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-2 inline-block text-sm">
        {label}
        {required && <span className="ml-0.5 text-gold">*</span>}
      </Label>
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
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 sm:col-span-2">
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

function YesNoNAField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: YesNoNA;
  onChange: (v: YesNoNA) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card px-4 py-3 sm:col-span-2">
      <Label className="text-sm">{label}</Label>
      <RadioGroup
        value={value}
        onValueChange={(v) => onChange(v as YesNoNA)}
        className="flex items-center gap-4"
      >
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RadioGroupItem value="sim" /> Sim
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RadioGroupItem value="nao" /> Não
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <RadioGroupItem value="na" /> Não se aplica
        </label>
      </RadioGroup>
    </div>
  );
}
