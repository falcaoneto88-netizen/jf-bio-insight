import { useState } from "react";
import { Info, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ProtocolEditor } from "./ProtocolEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { prepararProtocolo } from "@/lib/journey.functions";
import {
  OBJETIVOS,
  CURRENT_PROTOCOL_TEMPLATE_VERSION,
  emptyProtocolo,
  protocolLocaleSchema,
  type Journey,
  type Objetivo,
  type Protocolo,
} from "@/lib/journey/types";

export function StepProtocolo({
  journey,
  draft,
  onDraftChange,
  onSave,
  onContinue,
  onBack,
  onRefresh,
  saving,
}: {
  journey: Journey;
  draft: Protocolo;
  onDraftChange: (value: Protocolo) => void;
  onSave: () => void;
  onContinue: () => void;
  onBack: () => void;
  onRefresh: () => void;
  saving: boolean;
}) {
  const [preparing, setPreparing] = useState(false);
  const objetivo = draft.objetivo;

  const preparar = async () => {
    if (objetivo !== "hipertrofia" && objetivo !== "recomposicao") {
      toast.error("Escolha um objetivo com modelo disponível.");
      return;
    }
    setPreparing(true);
    try {
      const result = await prepararProtocolo({
        data: {
          id: journey.id,
          expectedVersion: journey.version,
          objetivo,
          instrucoes: draft.instrucoes,
          locale: draft.locale ?? "pt-BR",
          calorieTarget: draft.calorieTarget,
        },
      });
      if (!result.data) {
        toast.error(result.error ?? "Não foi possível preparar o rascunho.");
        return;
      }
      onRefresh();
      toast.success("Rascunho preparado. Reveja e ajuste cada secção.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Objetivo</CardTitle>
          <CardDescription>O modelo estrutural do documento depende do objetivo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Idioma do documento</span>
              <select
                className="h-10 w-full rounded-md border bg-background px-3"
                value={draft.locale ?? "pt-BR"}
                onChange={(e) =>
                  onDraftChange({ ...draft, locale: protocolLocaleSchema.parse(e.target.value) })
                }
              >
                <option value="pt-BR">Português</option>
                <option value="es">Español</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>Meta calórica definida pelo profissional (opcional)</span>
              <Input
                value={draft.calorieTarget ?? ""}
                maxLength={200}
                placeholder="Valor e unidade, se definidos"
                onChange={(e) => onDraftChange({ ...draft, calorieTarget: e.target.value })}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            O idioma altera os rótulos e as datas. Textos clínicos já preenchidos são preservados;
            revise sua redação no idioma escolhido. A meta calórica não é calculada a partir da
            bioimpedância.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {OBJETIVOS.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={!option.available}
                onClick={() => onDraftChange({ ...draft, objetivo: option.value as Objetivo })}
                className={cn(
                  "rounded-md border p-4 text-left transition-colors",
                  objetivo === option.value
                    ? "border-gold bg-gold-soft/30"
                    : "border-border hover:border-gold/60",
                  !option.available && "cursor-not-allowed opacity-60 hover:border-border",
                )}
              >
                <span className="block text-sm font-medium text-foreground">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {option.available ? "Modelo disponível" : "Modelo pendente de definição"}
                </span>
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="instrucoes" className="text-xs text-muted-foreground">
              Instruções profissionais (única fonte do que pode ser prescrito)
            </Label>
            <Textarea
              id="instrucoes"
              rows={6}
              value={draft.instrucoes}
              placeholder="Refeições, quantidades, preparo, substituições, suplementos e seus horários, condutas…"
              onChange={(e) => onDraftChange({ ...draft, instrucoes: e.target.value })}
            />
          </div>
          <Button variant="outline" onClick={preparar} disabled={preparing || saving}>
            <Sparkles className="mr-1 h-4 w-4" />
            {preparing ? "A preparar rascunho…" : "Preparar rascunho com o agente"}
          </Button>
        </CardContent>
      </Card>

      {draft.pendencias.length > 0 && (
        <Card className="border-gold/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <Info className="h-4 w-4 text-gold" /> Pendências internas
            </CardTitle>
            <CardDescription>Nunca aparecem no documento do paciente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {draft.pendencias.map((p, i) => (
              <p key={i}>• {p}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <ProtocolEditor
        sections={draft.sections}
        onChange={(sections) =>
          onDraftChange({ ...draft, templateVersion: CURRENT_PROTOCOL_TEMPLATE_VERSION, sections })
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button variant="outline" onClick={onSave} disabled={saving}>
          Guardar alterações
        </Button>
        <Button
          size="lg"
          onClick={onContinue}
          disabled={saving || draft.sections.length === 0 || draft === emptyProtocolo}
        >
          Ver prévia e aprovar
        </Button>
      </div>
    </div>
  );
}
