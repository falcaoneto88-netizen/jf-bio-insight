import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  generateConsultationAnalysis,
  getConsultationAnalyses,
} from "@/lib/clinical-analysis/functions";
import {
  goals,
  failureMessages,
  type AnalysisRecord,
  type AnalysisRequest,
} from "@/lib/clinical-analysis/schema";
import { requireAdminAccess } from "@/lib/access";

export function ClinicalAnalysisPanel({
  consultationId,
  sourceVersion,
  anamnesisId,
  hasExam,
}: {
  consultationId: string;
  sourceVersion: number;
  anamnesisId: string | null;
  hasExam: boolean;
}) {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [goal, setGoal] = useState<AnalysisRequest["goal"]>("analise");
  const [instructions, setInstructions] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const request = useRef<AnalysisRequest | null>(null);
  const live = useRef(false);
  const pending = records.some(
    (a) => a.status === "pending" && Date.now() - Date.parse(a.created_at) < 300000,
  );
  const ready = !!anamnesisId && hasExam;
  const refresh = useCallback(async () => {
    try {
      await requireAdminAccess();
      const reply = await getConsultationAnalyses({ data: consultationId });
      if (!live.current) return;
      if (!reply.ok) {
        setError(reply.message);
        return;
      }
      setRecords(reply.data);
      setError("");
      const saved = reply.data.find((a) => a.id === request.current?.requestId);
      if (
        saved &&
        (saved.status !== "pending" || Date.now() - Date.parse(saved.created_at) >= 300000)
      )
        request.current = null;
    } catch {
      if (live.current)
        setError("Não foi possível consultar as análises. Confira sua sessão e tente novamente.");
    } finally {
      if (live.current) setLoading(false);
    }
  }, [consultationId]);
  useEffect(() => {
    live.current = true;
    void refresh();
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    return () => {
      live.current = false;
      window.removeEventListener("focus", focus);
    };
  }, [refresh, sourceVersion]);
  useEffect(() => {
    if (!pending || busy) return;
    const timer = setInterval(() => {
      void refresh();
    }, 10000);
    return () => clearInterval(timer);
  }, [pending, busy, refresh]);

  async function generate() {
    if (busy || !ready || !confirmed) return;
    setBusy(true);
    setError("");
    try {
      await requireAdminAccess();
      request.current ??= {
        requestId: crypto.randomUUID(),
        consultationId,
        expectedVersion: sourceVersion,
        goal,
        professionalInstructions: instructions,
        confirm: true,
      };
      const reply = await generateConsultationAnalysis({ data: request.current });
      if (!live.current) return;
      if (!reply.ok) {
        setError(reply.message);
        return;
      }
      setRecords((current) =>
        [reply.data, ...current.filter((a) => a.id !== reply.data.id)].slice(0, 10),
      );
      if (reply.data.status !== "pending") {
        request.current = null;
        setConfirmed(false);
      }
    } catch {
      if (live.current)
        setError(
          "A conexão foi interrompida. Atualize o histórico para conferir se a análise foi salva antes de tentar novamente.",
        );
    } finally {
      if (live.current) setBusy(false);
    }
  }

  return (
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle>Análise clínica</CardTitle>
        <p className="text-sm text-muted-foreground">
          Agente Clínico Dr. João Falcão · rascunho para revisão profissional
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm">
          Reúne a anamnese carregada na ficha e a bioimpedância salva nesta consulta. A análise fica
          no histórico deste atendimento para conferência da equipe.
        </p>
        {!ready && (
          <p className="rounded border bg-muted/40 p-3 text-sm">
            Para começar, carregue uma anamnese na ficha clínica e adicione o exame de
            bioimpedância.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="block font-medium">Objetivo da análise</span>
            <select
              value={goal}
              disabled={busy || pending}
              className="w-full rounded border bg-background p-3"
              onChange={(event) => {
                setGoal(event.target.value as AnalysisRequest["goal"]);
                request.current = null;
                setConfirmed(false);
              }}
            >
              {Object.entries(goals).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm">
            <span className="block font-medium">Orientações do profissional (opcional)</span>
            <textarea
              value={instructions}
              disabled={busy || pending}
              maxLength={3000}
              rows={3}
              placeholder="Ex.: destacar a evolução e relacionar os achados à rotina de treino."
              className="w-full rounded border bg-background p-3"
              onChange={(event) => {
                setInstructions(event.target.value);
                request.current = null;
                setConfirmed(false);
              }}
            />
          </label>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy || pending || !ready}
            className="mt-1"
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          <span>
            Conferi que a anamnese e o exame pertencem a este paciente e autorizo o envio dos dados
            clínicos à OpenAI para gerar este rascunho.
          </span>
        </label>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={busy || pending || !ready || !confirmed}
            onClick={() => void generate()}
          >
            {busy ? "Gerando e salvando análise…" : "Gerar análise clínica"}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void refresh()}>
            Atualizar histórico de análises
          </Button>
        </div>
        {error && (
          <p role="alert" className="rounded border border-destructive p-3 text-sm">
            {error}
          </p>
        )}
        {loading && (
          <p role="status" className="text-sm">
            Carregando análises…
          </p>
        )}
        {!loading && !records.length && !error && (
          <p className="text-sm text-muted-foreground">Nenhuma análise salva nesta consulta.</p>
        )}
        <div className="space-y-4">
          {records.map((record) => (
            <AnalysisView key={record.id} record={record} sourceVersion={sourceVersion} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Últimas dez solicitações. A análise não aprova relatórios, não prescreve e não dispara
          mensagens ou workflows. Revise o conteúdo antes de utilizá-lo na documentação clínica.
        </p>
      </CardContent>
    </Card>
  );
}

export function AnalysisView({
  record,
  sourceVersion,
}: {
  record: AnalysisRecord;
  sourceVersion: number;
}) {
  const stale =
    record.status === "stale" ||
    record.is_current === false ||
    record.source_version !== sourceVersion;
  const expired =
    record.status === "pending" && Date.now() - Date.parse(record.created_at) >= 300000;
  const label = stale
    ? "Desatualizada"
    : expired
      ? "Geração interrompida"
      : {
          pending: "Em andamento",
          draft: "Rascunho salvo · aguardando revisão",
          failed: "Não concluída",
          stale: "Desatualizada",
        }[record.status];
  return (
    <article className="space-y-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{goals[record.goal]}</h3>
          <p className="text-xs text-muted-foreground">
            {new Date(record.created_at).toLocaleString("pt-BR")} · versão da consulta{" "}
            {record.source_version}
          </p>
        </div>
        <span className="rounded border px-2 py-1 text-xs">{label}</span>
      </div>
      {stale && (
        <p role="status" className="text-sm text-amber-800">
          Os dados usados nesta análise diferem dos dados atuais. Gere uma nova análise para revisar
          a consulta atual.
        </p>
      )}
      {record.status === "pending" && (
        <p role="status" className="text-sm">
          {expired
            ? failureMessages.interrupted
            : "A análise está sendo gerada. O histórico será atualizado automaticamente."}
        </p>
      )}
      {record.error_code && (
        <p className="text-sm">
          {failureMessages[record.error_code] ?? failureMessages.unavailable}
        </p>
      )}
      {record.result && (
        <details open={!stale} className="space-y-4">
          <summary className="cursor-pointer text-sm font-medium">Ler rascunho da análise</summary>
          <AnalysisText title="Síntese dos dados" text={record.result.synthesis} />
          <AnalysisList
            title="Relação entre os achados e a rotina"
            items={record.result.correlations}
          />
          <AnalysisList title="Informações ausentes" items={record.result.missingInformation} />
          <AnalysisList
            title="Pontos para revisão profissional"
            items={record.result.pointsForReview}
          />
          <AnalysisText
            title="Nota clínica sugerida para revisão"
            text={record.result.professionalDraft}
          />
          <p className="text-xs text-muted-foreground">
            Modelo: {record.model} · regras: {record.prompt_version}
          </p>
        </details>
      )}
    </article>
  );
}
function AnalysisText({ title, text }: { title: string; text: string }) {
  return (
    <section>
      <h4 className="mb-2 font-medium">{title}</h4>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{text}</p>
    </section>
  );
}
function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return items.length ? (
    <section>
      <h4 className="mb-2 font-medium">{title}</h4>
      <ul className="list-disc space-y-2 pl-5 text-sm">
        {items.map((item, index) => (
          <li className="whitespace-pre-wrap break-words" key={index}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
