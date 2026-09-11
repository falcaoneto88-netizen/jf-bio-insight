import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { FieldGrid, FieldRow } from "./fields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { extrairBioimpedancia } from "@/lib/journey.functions";
import { emptyBio, type Bio, type Journey } from "@/lib/journey/types";

const ACCEPT = "application/pdf,image/png,image/jpeg";

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function StepBio({
  journey,
  draft,
  onDraftChange,
  onSaveAndContinue,
  onBack,
  saving,
}: {
  journey: Journey;
  draft: Bio;
  onDraftChange: (value: Bio) => void;
  onSaveAndContinue: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Protege contra respostas assíncronas antigas a sobrescrever um arquivo novo. */
  const requestRef = useRef(0);
  /** Falso depois de desmontar: nenhuma resposta tardia toca no estado. */
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      // Sair da etapa (ou trocar de paciente) invalida tudo o que estiver a decorrer.
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  /** Invalida leituras/extrações em curso e liberta o botão de confirmação. */
  const cancelPending = () => {
    requestRef.current += 1;
    setBusy(false);
  };

  const runExtraction = async (payload: {
    texto?: string;
    fileBase64?: string;
    mimeType?: "application/pdf" | "image/png" | "image/jpeg";
    fileName?: string;
  }) => {
    const requestId = ++requestRef.current;
    setBusy(true);
    try {
      const result = await extrairBioimpedancia({ data: { id: journey.id, ...payload } });
      if (!mountedRef.current || requestId !== requestRef.current) return; // resposta obsoleta
      if (!result.data) {
        toast.error(result.error ?? "Não foi possível ler o exame.");
        return;
      }
      onDraftChange(result.data);
      toast.success("Exame transcrito. Reveja cada campo antes de confirmar.");
    } catch (err) {
      if (mountedRef.current && requestId === requestRef.current) toast.error((err as Error).message);
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setBusy(false);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    // Substituir arquivo limpa a extração anterior e invalida a confirmação.
    const requestId = ++requestRef.current;
    setBusy(true);
    onDraftChange({ ...emptyBio, arquivoNome: file.name });
    let base64: string;
    try {
      base64 = await fileToBase64(file);
    } catch (err) {
      if (mountedRef.current && requestId === requestRef.current) {
        toast.error((err as Error).message);
        setBusy(false);
      }
      return;
    }
    // A leitura do ficheiro também pode terminar tarde demais.
    if (!mountedRef.current || requestId !== requestRef.current) return;
    const mime = file.type as "application/pdf" | "image/png" | "image/jpeg";
    await runExtraction({ fileBase64: base64, mimeType: mime, fileName: file.name });
  };


  const setField = (field: keyof Bio, value: string) => onDraftChange({ ...draft, [field]: value } as Bio);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Exame de bioimpedância</CardTitle>
          <CardDescription>
            Envie o arquivo (PDF, PNG ou JPG), cole o texto do exame ou preencha manualmente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
              <Upload className="mr-1 h-4 w-4" />
              {draft.arquivoNome ? "Substituir arquivo" : "Enviar arquivo"}
            </Button>
            {draft.arquivoNome && (
              <Button
                variant="ghost"
                onClick={() => {
                  cancelPending();
                  onDraftChange({ ...emptyBio });
                  toast.info("Arquivo removido e transcrição anterior apagada.");
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Remover arquivo
              </Button>
            )}

          </div>
          {draft.arquivoNome && (
            <p className="text-xs text-muted-foreground">Arquivo atual: {draft.arquivoNome}</p>
          )}
          <Textarea
            rows={5}
            value={pasted}
            placeholder="Ou cole aqui o texto do exame…"
            onChange={(e) => setPasted(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void runExtraction({ texto: pasted })} disabled={busy}>
              <Sparkles className="mr-1 h-4 w-4" />
              {busy ? "A ler o exame…" : "Extrair do texto"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => onDraftChange({ ...emptyBio, semExame: !draft.semExame })}
            >
              {draft.semExame ? "Voltar a usar exame" : "Prosseguir sem exame"}
            </Button>
          </div>
          {draft.semExame && (
            <p className="rounded-md border border-gold/50 bg-gold-soft/30 p-3 text-xs text-foreground">
              Esta jornada segue sem exame de bioimpedância. Nenhum resultado será inventado no documento.
            </p>
          )}
        </CardContent>
      </Card>

      {!draft.semExame && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Campos do exame</CardTitle>
              <CardDescription>Tudo editável. Campos vazios são simplesmente omitidos.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGrid>
                <FieldRow id="b-pac" label="Paciente" value={draft.paciente} onChange={(v) => setField("paciente", v)} />
                <FieldRow
                  id="b-data"
                  label="Data e hora do exame"
                  value={draft.dataHoraExame}
                  onChange={(v) => setField("dataHoraExame", v)}
                />
                <FieldRow id="b-sexo" label="Sexo" value={draft.sexo} onChange={(v) => setField("sexo", v)} />
                <FieldRow id="b-idade" label="Idade (anos)" value={draft.idadeAnos} onChange={(v) => setField("idadeAnos", v)} />
                <FieldRow id="b-altura" label="Altura (m)" value={draft.alturaM} onChange={(v) => setField("alturaM", v)} />
                <FieldRow
                  id="b-tmb"
                  label="Taxa metabólica basal (kcal)"
                  value={draft.taxaMetabolicaBasalKcal}
                  onChange={(v) => setField("taxaMetabolicaBasalKcal", v)}
                />
                <FieldRow
                  id="b-visceral"
                  label="Nível de gordura visceral"
                  value={draft.nivelGorduraVisceral}
                  onChange={(v) => setField("nivelGorduraVisceral", v)}
                />
              </FieldGrid>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="font-serif text-xl">Histórico</CardTitle>
              <CardDescription>Data | Peso (kg) | Massa muscular esquelética (kg) | PGC (%)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {draft.historico.map((row, index) => (
                <div key={index} className="rounded-md border border-border p-4">
                  <FieldGrid>
                    <FieldRow
                      id={`h-${index}-data`}
                      label="Data (DD/MM/AAAA)"
                      value={row.data}
                      onChange={(v) => {
                        const next = [...draft.historico];
                        next[index] = { ...row, data: v };
                        onDraftChange({ ...draft, historico: next });
                      }}
                    />
                    <FieldRow
                      id={`h-${index}-peso`}
                      label="Peso (kg)"
                      value={row.peso}
                      onChange={(v) => {
                        const next = [...draft.historico];
                        next[index] = { ...row, peso: v };
                        onDraftChange({ ...draft, historico: next });
                      }}
                    />
                    <FieldRow
                      id={`h-${index}-mm`}
                      label="Massa muscular esquelética (kg)"
                      value={row.massaMuscularEsqueletica}
                      onChange={(v) => {
                        const next = [...draft.historico];
                        next[index] = { ...row, massaMuscularEsqueletica: v };
                        onDraftChange({ ...draft, historico: next });
                      }}
                    />
                    <FieldRow
                      id={`h-${index}-pgc`}
                      label="PGC (%)"
                      value={row.pgc}
                      onChange={(v) => {
                        const next = [...draft.historico];
                        next[index] = { ...row, pgc: v };
                        onDraftChange({ ...draft, historico: next });
                      }}
                    />
                  </FieldGrid>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-3 text-muted-foreground"
                    onClick={() =>
                      onDraftChange({ ...draft, historico: draft.historico.filter((_, i) => i !== index) })
                    }
                  >
                    <Trash2 className="mr-1 h-4 w-4" /> Remover linha
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  onDraftChange({
                    ...draft,
                    historico: [
                      ...draft.historico,
                      { data: "", peso: "", massaMuscularEsqueletica: "", pgc: "" },
                    ],
                  })
                }
              >
                <Plus className="mr-1 h-4 w-4" /> Adicionar data
              </Button>
            </CardContent>
          </Card>

          {(draft.duvidas.length > 0 || draft.identityReview) && (
            <Card className="border-gold/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-lg">
                  <AlertTriangle className="h-4 w-4 text-gold" /> Notas internas da extração
                </CardTitle>
                <CardDescription>Nunca aparecem no documento do paciente.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                {draft.identityReview && (
                  <p className="text-foreground">
                    Identidade a rever: o nome do exame não corresponde ao nome da jornada.
                  </p>
                )}
                {draft.duvidas.map((d, i) => (
                  <p key={i}>• {d}</p>
                ))}
                {draft.fontes.length > 0 && (
                  <p className="pt-2 text-xs">Fontes: {draft.fontes.join(" · ")}</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" onClick={onBack}>
          Voltar
        </Button>
        <Button size="lg" onClick={onSaveAndContinue} disabled={saving || busy}>
          {saving ? "A guardar…" : "Confirmar bioimpedância e continuar"}
        </Button>
      </div>
    </div>
  );
}
