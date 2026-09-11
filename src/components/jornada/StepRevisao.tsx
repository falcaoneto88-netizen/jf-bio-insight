import { AlertTriangle, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { computeEvolution, evolutionTableRows } from "@/lib/journey/evolution";
import type { Journey } from "@/lib/journey/types";

export function StepRevisao({
  journey,
  issues,
  onConfirm,
  onBack,
  saving,
}: {
  journey: Journey;
  issues: { blocking: string[]; warnings: string[] };
  onConfirm: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const evolution = computeEvolution(journey.bio);
  const rows = evolutionTableRows(evolution);
  const anamnese = journey.anamnese;

  return (
    <div className="space-y-6">
      {issues.blocking.length > 0 && (
        <Card className="border-destructive/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg text-destructive">
              <AlertTriangle className="h-4 w-4" /> Impedimentos
            </CardTitle>
            <CardDescription>Resolva antes de continuar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {issues.blocking.map((b, i) => (
              <p key={i}>• {b}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Anamnese</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Line label="Paciente" value={anamnese.header.paciente} />
          <Line label="Data da consulta" value={anamnese.header.dataConsulta} />
          <Line label="Queixa principal" value={anamnese.queixaObjetivos.queixa} />
          <Line label="Objetivo" value={anamnese.queixaObjetivos.objetivo} />
          <Line label="Medicações em uso" value={anamnese.medicacoesEmUso.map((m) => m.nome).filter(Boolean).join(", ")} />
          <Line label="Alergias" value={[anamnese.alergias.medicamentos, anamnese.alergias.alimentares].filter(Boolean).join(" · ")} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Bioimpedância e evolução</CardTitle>
          <CardDescription>
            {journey.bio.semExame
              ? "Jornada sem exame."
              : evolution.hasTrend
                ? "Comparação entre a primeira e a última data confirmadas."
                : "Uma única data: sem tendência."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="bg-foreground text-background">
                    <th className="p-2 text-left font-medium">Data</th>
                    <th className="p-2 text-left font-medium">Peso (kg)</th>
                    <th className="p-2 text-left font-medium">Massa muscular (kg)</th>
                    <th className="p-2 text-left font-medium">PGC (%)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={i % 2 ? "bg-muted/40" : undefined}>
                      {row.map((cell, j) => (
                        <td key={j} className="border-b border-border p-2">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {evolution.summaryLines.length > 0 && (
            <ul className="space-y-1 text-sm text-foreground">
              {evolution.summaryLines.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {issues.warnings.length > 0 && (
        <Card className="border-gold/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <Info className="h-4 w-4 text-gold" /> Painel interno
            </CardTitle>
            <CardDescription>Só para o profissional — nunca sai no documento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {issues.warnings.map((w, i) => (
              <p key={i}>• {w}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button size="lg" onClick={onConfirm} disabled={saving || issues.blocking.length > 0}>
          {saving ? "A guardar…" : "Dados revisados"}
        </Button>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value?.trim() ? value : "—"}</span>
    </p>
  );
}
