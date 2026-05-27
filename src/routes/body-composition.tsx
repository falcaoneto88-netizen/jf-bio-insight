import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Calculator, Sparkles } from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  emptyBodyComposition,
  useReportStore,
  type BodyCompositionData,
} from "@/store/report-store";

export const Route = createFileRoute("/body-composition")({
  head: () => ({
    meta: [
      { title: "Dados da Bioimpedância — JF BioReport" },
      {
        name: "description",
        content: "Revise ou edite os dados extraídos do exame de bioimpedância.",
      },
    ],
  }),
  component: BodyCompositionPage,
});

function BodyCompositionPage() {
  const navigate = useNavigate();
  const { bodyComposition, setBodyComposition, file } = useReportStore();
  const [data, setData] = useState<BodyCompositionData>(
    bodyComposition ?? emptyBodyComposition,
  );
  const [errors, setErrors] = useState<Partial<Record<keyof BodyCompositionData, string>>>({});

  const update = <K extends keyof BodyCompositionData>(key: K, value: BodyCompositionData[K]) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  const calcBmi = () => {
    const h = parseFloat(data.height);
    const w = parseFloat(data.weight);
    if (h > 0 && w > 0) {
      const m = h / 100;
      update("bmi", (w / (m * m)).toFixed(1));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: typeof errors = {};
    if (!data.patientName.trim()) newErrors.patientName = "Obrigatório";
    if (!data.sex) newErrors.sex = "Obrigatório";
    if (!data.age) newErrors.age = "Obrigatório";
    if (!data.height) newErrors.height = "Obrigatório";
    if (!data.weight) newErrors.weight = "Obrigatório";
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;
    setBodyComposition(data);
    navigate({ to: "/clinical-form" });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-10">
        <form onSubmit={handleSubmit} className="mx-auto max-w-4xl">
          <Stepper current={2} />

          <Card className="mt-10 border-border/80">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Dados da Bioimpedância</CardTitle>
              <CardDescription>
                Revise e ajuste os dados do exame. Todos os campos são editáveis.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="flex items-start gap-3 rounded-md border border-gold/40 bg-gold-soft/20 px-4 py-3 text-sm text-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 text-gold" />
                <p>
                  Em breve estes campos serão preenchidos automaticamente a partir do exame
                  enviado{file ? ` (${file.name})` : ""}.
                </p>
              </div>

              <Section title="Identificação">
                <Field label="Nome do paciente" error={errors.patientName} className="sm:col-span-2">
                  <Input
                    value={data.patientName}
                    onChange={(e) => update("patientName", e.target.value)}
                    placeholder="Nome completo"
                  />
                </Field>
                <Field label="Data e hora do exame">
                  <Input
                    type="datetime-local"
                    value={data.examDateTime}
                    onChange={(e) => update("examDateTime", e.target.value)}
                  />
                </Field>
                <Field label="Sexo" error={errors.sex}>
                  <Select
                    value={data.sex || undefined}
                    onValueChange={(v) => update("sex", v as BodyCompositionData["sex"])}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="masculino">Masculino</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Idade (anos)" error={errors.age}>
                  <Input
                    type="number"
                    min={0}
                    value={data.age}
                    onChange={(e) => update("age", e.target.value)}
                  />
                </Field>
              </Section>

              <Section title="Antropometria">
                <Field label="Altura (cm)" error={errors.height}>
                  <Input
                    type="number"
                    step="0.1"
                    value={data.height}
                    onChange={(e) => update("height", e.target.value)}
                  />
                </Field>
                <Field label="Peso (kg)" error={errors.weight}>
                  <Input
                    type="number"
                    step="0.1"
                    value={data.weight}
                    onChange={(e) => update("weight", e.target.value)}
                  />
                </Field>
                <Field label="IMC (kg/m²)">
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={data.bmi}
                      onChange={(e) => update("bmi", e.target.value)}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={calcBmi}>
                      <Calculator className="h-4 w-4" />
                      Calcular
                    </Button>
                  </div>
                </Field>
              </Section>

              <Section title="Composição corporal">
                <Field label="Massa muscular esquelética (kg)">
                  <Input
                    type="number"
                    step="0.1"
                    value={data.skeletalMuscleMass}
                    onChange={(e) => update("skeletalMuscleMass", e.target.value)}
                  />
                </Field>
                <Field label="% de gordura corporal">
                  <Input
                    type="number"
                    step="0.1"
                    value={data.bodyFatPercentage}
                    onChange={(e) => update("bodyFatPercentage", e.target.value)}
                  />
                </Field>
                <Field label="Massa de gordura corporal (kg)">
                  <Input
                    type="number"
                    step="0.1"
                    value={data.bodyFatMass}
                    onChange={(e) => update("bodyFatMass", e.target.value)}
                  />
                </Field>
                <Field label="Gordura visceral (nível)">
                  <Input
                    type="number"
                    step="0.1"
                    value={data.visceralFat}
                    onChange={(e) => update("visceralFat", e.target.value)}
                  />
                </Field>
                <Field label="Taxa metabólica basal (kcal)">
                  <Input
                    type="number"
                    value={data.basalMetabolicRate}
                    onChange={(e) => update("basalMetabolicRate", e.target.value)}
                  />
                </Field>
                <Field label="Relação cintura-quadril">
                  <Input
                    type="number"
                    step="0.01"
                    value={data.waistHipRatio}
                    onChange={(e) => update("waistHipRatio", e.target.value)}
                  />
                </Field>
                <Field label="Água corporal total (L)">
                  <Input
                    type="number"
                    step="0.1"
                    value={data.totalBodyWater}
                    onChange={(e) => update("totalBodyWater", e.target.value)}
                  />
                </Field>
                <Field label="Massa livre de gordura (kg)">
                  <Input
                    type="number"
                    step="0.1"
                    value={data.fatFreeMass}
                    onChange={(e) => update("fatFreeMass", e.target.value)}
                  />
                </Field>
              </Section>
            </CardContent>
          </Card>

          <div className="mt-8 flex items-center justify-between">
            <Button asChild variant="ghost" type="button">
              <Link to="/upload">
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
