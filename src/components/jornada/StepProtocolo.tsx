import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Info, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { ProtocolEditor } from "./ProtocolEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { prepararProtocolo } from "@/lib/journey.functions";
import { energyInternalSummary, resolveEnergyForBio } from "@/lib/journey/energy";
import { protocolEssentialIssues, protocolOpenWarnings } from "@/lib/journey/protocol-quality";
import {
  OBJETIVOS,
  CURRENT_PROTOCOL_TEMPLATE_VERSION,
  emptyProtocolo,
  protocolLocaleSchema,
  type Journey,
  type Objetivo,
  type PrescriptionEntry,
  type Protocolo,
} from "@/lib/journey/types";

/** Número de refeições da anamnese, apenas quando é inequívoco (um só número). */
function mealCountFromAnamnese(text: string): number | null {
  const numbers = text.match(/\d+/g) ?? [];
  if (numbers.length !== 1) return null;
  const n = Number(numbers[0]);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

function parseMealNumbers(text: string): number[] {
  return [
    ...new Set(
      (text.match(/\d+/g) ?? [])
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12),
    ),
  ].sort((a, b) => a - b);
}

const emptyPrescription: PrescriptionEntry = {
  substancia: "",
  dose: "",
  via: "",
  frequencia: "",
  observacoes: "",
  confirmada: false,
};

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
  const energy = draft.energyInput ?? {};
  const setEnergy = (patch: Partial<NonNullable<Protocolo["energyInput"]>>) =>
    onDraftChange({ ...draft, energyInput: { ...energy, ...patch } });
  const refeicoesSugeridas = journey.anamnese.alimentacao.refeicoes.trim();
  const sugestao = mealCountFromAnamnese(refeicoesSugeridas);
  const prescriptions = draft.prescriptions ?? [];
  const liquidMealNumbers = draft.liquidMealNumbers ?? [];

  // Preenche o número real da anamnese quando é inequívoco (placeholder não é valor).
  useEffect(() => {
    if (draft.mealCount == null && sugestao != null)
      onDraftChange({ ...draft, mealCount: sugestao });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugestao]);

  const preview = useMemo(
    () =>
      objetivo
        ? resolveEnergyForBio({
            bio: journey.bio,
            objetivo,
            ...(draft.energyInput ? { energyInput: draft.energyInput } : {}),
            ...(draft.calorieTarget ? { calorieTarget: draft.calorieTarget } : {}),
          })
        : null,
    [journey.bio, objetivo, draft.energyInput, draft.calorieTarget],
  );

  const essenciais = draft.generator ? protocolEssentialIssues(draft) : [];
  const avisos = draft.generator ? protocolOpenWarnings(draft) : draft.pendencias;
  const resolvidas = draft.pendenciasResolvidas ?? [];

  const setPrescription = (index: number, patch: Partial<PrescriptionEntry>) =>
    onDraftChange({
      ...draft,
      prescriptions: prescriptions.map((p, i) =>
        i === index
          ? { ...p, ...patch, ...(patch.confirmada === undefined ? { confirmada: false } : {}) }
          : p,
      ),
    });

  const preparar = async () => {
    if (!objetivo) {
      toast.error("Escolha o objetivo desta consulta.");
      return;
    }
    if (!preview?.plan) {
      toast.error(
        preview?.pendencias[0] ??
          "Defina a meta calórica (meta profissional ou cálculo completo) antes de gerar.",
      );
      return;
    }
    if (!draft.mealCount) {
      toast.error("Indique o número de refeições antes de gerar o plano alimentar.");
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
          mealCount: draft.mealCount,
          energyInput: draft.energyInput,
          liquidMealNumbers,
          prescriptions,
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
              <span>Meta calórica definida por si (substitui o cálculo)</span>
              <Input
                value={draft.calorieTarget ?? ""}
                maxLength={200}
                placeholder="Ex.: 1800 kcal"
                onChange={(e) => onDraftChange({ ...draft, calorieTarget: e.target.value })}
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            O idioma altera os rótulos e as datas. Textos clínicos já preenchidos são preservados;
            revise sua redação no idioma escolhido. Se escrever uma meta, ela vale tal como está; se
            deixar em branco, a meta é calculada aqui a partir da massa livre de gordura, do fator
            que confirmar e do ajuste que indicar.
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span>Número de refeições</span>
              <Input
                type="number"
                min={1}
                max={12}
                value={draft.mealCount ?? ""}
                placeholder={refeicoesSugeridas ? `Anamnese: ${refeicoesSugeridas}` : "1 a 12"}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    mealCount: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Refeições líquidas (números, só se indicadas por si)</span>
              <Input
                value={liquidMealNumbers.join(", ")}
                maxLength={40}
                placeholder="Ex.: 2, 5 — vazio significa nenhuma"
                onChange={(e) =>
                  onDraftChange({ ...draft, liquidMealNumbers: parseMealNumbers(e.target.value) })
                }
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Massa livre de gordura (kg), se não vier do exame</span>
              <Input
                value={energy.ffmManualKg ?? ""}
                maxLength={20}
                placeholder={journey.bio.massaLivreGorduraKg || "Ex.: 58,4"}
                onChange={(e) => setEnergy({ ffmManualKg: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Fator de atividade (escolhido por si)</span>
              <Input
                value={energy.activityFactor ?? ""}
                maxLength={20}
                placeholder="Ex.: 1,5"
                onChange={(e) => setEnergy({ activityFactor: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>
                Ajuste (%){" "}
                {objetivo === "recomposicao"
                  ? "— défice entre 15 e 25"
                  : objetivo === "hipertrofia"
                    ? "— hipertrofia fica em manutenção"
                    : "— défice definido por si"}
              </span>
              <Input
                value={energy.adjustmentPercent ?? ""}
                maxLength={20}
                placeholder="Ex.: -20"
                onChange={(e) => setEnergy({ adjustmentPercent: e.target.value })}
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={energy.factorReviewed === true}
              onChange={(e) => setEnergy({ factorReviewed: e.target.checked })}
            />
            <span className="text-muted-foreground">
              Confirmo que revi o fator de atividade. Sem esta confirmação, a meta calórica não é
              calculada — não existe tabela de fatores predefinida. O cálculo usa Cunningham (500 +
              22 × massa livre de gordura) e fica apenas neste painel profissional; a taxa
              metabólica basal não é meta calórica. Uma meta escrita em cima substitui o cálculo.
            </span>
          </label>

          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Resumo interno do cálculo (não sai no documento)
            </p>
            {!objetivo ? (
              <p className="mt-1 text-muted-foreground">Escolha o objetivo para ver o cálculo.</p>
            ) : preview?.plan ? (
              <div className="mt-1 space-y-1 text-muted-foreground">
                <p className="font-medium text-foreground">
                  Meta: {preview.plan.targetKcal} kcal/dia (
                  {preview.plan.method === "profissional"
                    ? "definida por si"
                    : "calculada por Cunningham"}
                  )
                </p>
                {energyInternalSummary(preview.plan).map((linha, i) => (
                  <p key={i}>• {linha}</p>
                ))}
              </div>
            ) : (
              <div className="mt-1 space-y-1 text-muted-foreground">
                <p>Sem meta calórica ainda.</p>
                {preview?.pendencias.map((p, i) => (
                  <p key={i}>• {p}</p>
                ))}
              </div>
            )}
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
          <Button variant="outline" onClick={() => void preparar()} disabled={preparing || saving}>
            <Sparkles className="mr-1 h-4 w-4" />
            {preparing ? "A gerar protocolo…" : "Gerar protocolo completo"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Ao gerar, os dados clínicos desta consulta (anamnese, rotina, alergias, medicação
            relatada, exame, objetivo e as suas orientações) são enviados ao serviço de IA da
            OpenAI. Nome, telefone, e-mail e identificadores de CRM são retirados dos campos
            estruturados; textos livres seguem como foram escritos. O resultado é sempre um rascunho
            para a sua revisão. Medicação e suplementos injetáveis nunca são criados pela IA: só
            saem no documento as prescrições que escrever e confirmar abaixo.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-lg">Prescrições (escritas por si)</CardTitle>
          <CardDescription>
            Cada entrada precisa de substância, dose, via e frequência, e de confirmação individual.
            Sem confirmação não entra no documento nem se aprova.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {prescriptions.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma prescrição registada.</p>
          )}
          {prescriptions.map((p, index) => (
            <div key={index} className="space-y-3 rounded-md border border-border p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>Substância</span>
                  <Input
                    value={p.substancia}
                    maxLength={200}
                    onChange={(e) => setPrescription(index, { substancia: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Dose</span>
                  <Input
                    value={p.dose}
                    maxLength={200}
                    onChange={(e) => setPrescription(index, { dose: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Via</span>
                  <Input
                    value={p.via}
                    maxLength={120}
                    onChange={(e) => setPrescription(index, { via: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span>Frequência</span>
                  <Input
                    value={p.frequencia}
                    maxLength={200}
                    onChange={(e) => setPrescription(index, { frequencia: e.target.value })}
                  />
                </label>
              </div>
              <label className="space-y-1 text-sm">
                <span>Observações</span>
                <Input
                  value={p.observacoes}
                  maxLength={600}
                  onChange={(e) => setPrescription(index, { observacoes: e.target.value })}
                />
              </label>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={p.confirmada}
                    disabled={
                      !p.substancia.trim() ||
                      !p.dose.trim() ||
                      !p.via.trim() ||
                      !p.frequencia.trim()
                    }
                    onChange={(e) => setPrescription(index, { confirmada: e.target.checked })}
                  />
                  <span className="text-muted-foreground">
                    Confirmo esta prescrição individualmente.
                  </span>
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    onDraftChange({
                      ...draft,
                      prescriptions: prescriptions.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remover
                </Button>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onDraftChange({
                ...draft,
                prescriptions: [...prescriptions, { ...emptyPrescription }],
              })
            }
          >
            Adicionar prescrição
          </Button>
        </CardContent>
      </Card>

      {essenciais.length > 0 && (
        <Card className="border-destructive/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <AlertTriangle className="h-4 w-4 text-destructive" /> Pendências essenciais
            </CardTitle>
            <CardDescription>
              Bloqueiam a aprovação e não podem ser dispensadas: corrija os dados ou gere de novo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {essenciais.map((p, i) => (
              <p key={i}>• {p}</p>
            ))}
          </CardContent>
        </Card>
      )}

      {(avisos.length > 0 || resolvidas.length > 0) && (
        <Card className="border-gold/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <Info className="h-4 w-4 text-gold" /> Avisos internos
            </CardTitle>
            <CardDescription>
              Nunca aparecem no documento. Marque como revisto o que já tratou.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {avisos.map((p, i) => (
              <label key={`open-${i}`} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={false}
                  onChange={() =>
                    onDraftChange({
                      ...draft,
                      pendenciasResolvidas: [...resolvidas, p.trim()],
                    })
                  }
                />
                <span>{p}</span>
              </label>
            ))}
            {resolvidas.map((p, i) => (
              <label key={`done-${i}`} className="flex items-start gap-2 opacity-60">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked
                  onChange={() =>
                    onDraftChange({
                      ...draft,
                      pendenciasResolvidas: resolvidas.filter((r) => r !== p),
                    })
                  }
                />
                <span className="line-through">{p}</span>
              </label>
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
