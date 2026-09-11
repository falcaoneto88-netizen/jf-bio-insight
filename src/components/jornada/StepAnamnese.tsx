import { useEffect, useRef, useState } from "react";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { FieldGrid, FieldRow } from "./fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { organizarAnamnese } from "@/lib/journey.functions";
import { ANAMNESE_FIELD_LABELS, type Anamnese, type Journey } from "@/lib/journey/types";

type GroupKey = Exclude<keyof Anamnese, "header" | "medicacoesEmUso">;

const GROUPS: { key: GroupKey; n: number; label: string; multiline?: string[] }[] = [
  { key: "identificacao", n: 1, label: "Identificação e contexto familiar", multiline: ["outras"] },
  { key: "rotinaProfissional", n: 2, label: "Rotina profissional", multiline: ["observacoes"] },
  { key: "sono", n: 3, label: "Sono e disposição", multiline: ["observacoes"] },
  { key: "historicoClinico", n: 4, label: "Histórico clínico", multiline: ["doencas", "familiar", "medicacoesAnteriores", "outras"] },
  { key: "alergias", n: 5, label: "Alergias", multiline: ["medicamentos", "alimentares"] },
  { key: "cirurgias", n: 7, label: "Cirurgias e procedimentos", multiline: ["cirurgias", "estetica", "intercorrencias"] },
  { key: "emocional", n: 8, label: "Saúde emocional e cognitiva" },
  { key: "habitos", n: 9, label: "Hábitos" },
  { key: "alimentacao", n: 10, label: "Alimentação, hidratação e suplementação", multiline: ["padrao", "suplementos"] },
  { key: "queixaObjetivos", n: 11, label: "Queixa principal e objetivos", multiline: ["queixa", "objetivo", "evolucao", "tratamentos", "expectativas"] },
  { key: "observacoesClinicas", n: 12, label: "Observações clínicas", multiline: ["adicionais", "pontosAtencao"] },
];

export function StepAnamnese({
  journey,
  draft,
  onDraftChange,
  onSaveAndContinue,
  saving,
}: {
  journey: Journey;
  draft: Anamnese;
  onDraftChange: (value: Anamnese) => void;
  onSaveAndContinue: () => void;
  saving: boolean;
}) {
  const [pasted, setPasted] = useState("");
  const [organizing, setOrganizing] = useState(false);

  const setGroupField = (group: GroupKey, field: string, value: string) => {
    onDraftChange({
      ...draft,
      [group]: { ...(draft[group] as Record<string, string>), [field]: value },
    } as Anamnese);
  };

  const organizar = async () => {
    if (!pasted.trim()) {
      toast.error("Cole primeiro o texto da consulta.");
      return;
    }
    setOrganizing(true);
    try {
      const result = await organizarAnamnese({ data: { id: journey.id, texto: pasted } });
      if (!result.data) {
        toast.error(result.error ?? "Não foi possível organizar a anamnese.");
        return;
      }
      onDraftChange(result.data);
      toast.success("Anamnese organizada. Reveja e ajuste o que for preciso.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOrganizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Colar anamnese</CardTitle>
          <CardDescription>
            Cole o texto da consulta e deixe o agente organizar nos campos. O resultado fica editável.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={6}
            value={pasted}
            placeholder="Cole aqui as suas anotações da consulta…"
            onChange={(e) => setPasted(e.target.value)}
          />
          <Button variant="outline" onClick={organizar} disabled={organizing}>
            <Sparkles className="mr-1 h-4 w-4" />
            {organizing ? "A organizar…" : "Organizar com agente"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Cabeçalho</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGrid>
            <FieldRow
              id="h-paciente"
              label="Paciente"
              value={draft.header.paciente}
              onChange={(v) => onDraftChange({ ...draft, header: { ...draft.header, paciente: v } })}
            />
            <FieldRow
              id="h-data"
              label="Data da consulta (DD/MM/AAAA)"
              value={draft.header.dataConsulta}
              onChange={(v) => onDraftChange({ ...draft, header: { ...draft.header, dataConsulta: v } })}
            />
            <FieldRow
              id="h-nasc"
              label="Nascimento ou idade"
              value={draft.header.nascimentoOuIdade}
              onChange={(v) =>
                onDraftChange({ ...draft, header: { ...draft.header, nascimentoOuIdade: v } })
              }
            />
            <FieldRow
              id="h-tel"
              label="Telefone"
              value={draft.header.telefone}
              onChange={(v) => onDraftChange({ ...draft, header: { ...draft.header, telefone: v } })}
            />
            <FieldRow
              id="h-email"
              label="E-mail"
              value={draft.header.email}
              onChange={(v) => onDraftChange({ ...draft, header: { ...draft.header, email: v } })}
            />
          </FieldGrid>
        </CardContent>
      </Card>

      {GROUPS.filter((g) => g.n < 6).map((group) => (
        <GroupCard key={group.key} group={group} draft={draft} onField={setGroupField} />
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">6. Medicações em uso</CardTitle>
          <CardDescription>Apenas o que o paciente toma atualmente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.medicacoesEmUso.map((med, index) => (
            <div key={index} className="rounded-md border border-border p-4">
              <FieldGrid>
                {(["nome", "dose", "frequencia", "horario", "motivo"] as const).map((field) => (
                  <FieldRow
                    key={field}
                    id={`med-${index}-${field}`}
                    label={ANAMNESE_FIELD_LABELS[field] ?? field}
                    value={med[field]}
                    onChange={(v) => {
                      const next = [...draft.medicacoesEmUso];
                      next[index] = { ...med, [field]: v };
                      onDraftChange({ ...draft, medicacoesEmUso: next });
                    }}
                  />
                ))}
              </FieldGrid>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-muted-foreground"
                onClick={() =>
                  onDraftChange({
                    ...draft,
                    medicacoesEmUso: draft.medicacoesEmUso.filter((_, i) => i !== index),
                  })
                }
              >
                <Trash2 className="mr-1 h-4 w-4" /> Remover medicação
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onDraftChange({
                ...draft,
                medicacoesEmUso: [
                  ...draft.medicacoesEmUso,
                  { nome: "", dose: "", frequencia: "", horario: "", motivo: "" },
                ],
              })
            }
          >
            <Plus className="mr-1 h-4 w-4" /> Adicionar medicação
          </Button>
        </CardContent>
      </Card>

      {GROUPS.filter((g) => g.n > 6).map((group) => (
        <GroupCard key={group.key} group={group} draft={draft} onField={setGroupField} />
      ))}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button size="lg" onClick={onSaveAndContinue} disabled={saving}>
          {saving ? "A guardar…" : "Confirmar anamnese e continuar"}
        </Button>
      </div>
    </div>
  );
}

function GroupCard({
  group,
  draft,
  onField,
}: {
  group: { key: GroupKey; n: number; label: string; multiline?: string[] };
  draft: Anamnese;
  onField: (group: GroupKey, field: string, value: string) => void;
}) {
  const values = draft[group.key] as Record<string, string>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          {group.n}. {group.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGrid>
          {Object.keys(values).map((field) => (
            <FieldRow
              key={field}
              id={`${group.key}-${field}`}
              label={ANAMNESE_FIELD_LABELS[field] ?? field}
              value={values[field] ?? ""}
              multiline={group.multiline?.includes(field)}
              onChange={(v) => onField(group.key, field, v)}
            />
          ))}
        </FieldGrid>
      </CardContent>
    </Card>
  );
}
