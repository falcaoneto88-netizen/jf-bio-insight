import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STAGE_LABEL, type AppointmentRow, type Stage } from "@/lib/appointments/core";
import { listarAgendamentosConfirmados } from "@/lib/appointments/functions";
import { SYNC_LABEL, type SyncState } from "@/lib/jornada-events/outbox";
import {
  configurarAvisoJornada,
  listarEnviosJornada,
  obterAvisoJornada,
  reenviarAvisoJornada,
} from "@/lib/jornada-events/functions";

export const Route = createFileRoute("/_authenticated/agendamentos")({
  head: () => ({
    meta: [
      { title: "Agendamentos — Harmonização Glútea | BioReport Studio" },
      {
        name: "description",
        content:
          "Acompanhamento somente leitura dos agendamentos confirmados de Harmonização Glútea e do progresso da anamnese.",
      },
      { property: "og:title", content: "Agendamentos — Harmonização Glútea" },
      {
        property: "og:description",
        content: "Agendamentos confirmados e situação da anamnese de cada paciente.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AppointmentsPage,
});

const STAGE_TONE: Record<Stage, string> = {
  sem_convite: "border-border text-muted-foreground",
  convite_criado: "border-gold/60 text-foreground",
  convite_expirado: "border-destructive/40 text-destructive",
  convite_revogado: "border-destructive/40 text-destructive",
  recebida: "border-gold text-foreground",
  aplicada: "border-foreground/40 text-foreground",
  nova_versao: "border-gold text-foreground",
  conflito: "border-destructive/60 text-destructive",
  indisponivel: "border-border text-muted-foreground",
};

const FILTERS: (Stage | "todas")[] = [
  "todas",
  "sem_convite",
  "convite_criado",
  "recebida",
  "aplicada",
  "nova_versao",
  "convite_expirado",
  "convite_revogado",
  "conflito",
  "indisponivel",
];

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function formatStamp(iso: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: timezone,
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const SYNC_TONE: Record<SyncState, string> = {
  nao_aplicavel: "text-muted-foreground",
  pendente: "text-foreground",
  confirmada: "text-foreground",
  falha: "text-destructive",
  falha_intervencao: "text-destructive",
  pendencia_vinculo: "text-destructive",
  ausente_na_fila: "text-destructive",
  indisponivel: "text-muted-foreground",
};

/** Ativação e pausa do aviso administrativo automático. Nunca envia mensagens ao paciente. */
function SyncPanel({ onChanged }: { onChanged: () => void }) {
  const carregar = useServerFn(obterAvisoJornada);
  const configurar = useServerFn(configurarAvisoJornada);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const queryClient = useQueryClient();
  const settings = useQuery({
    queryKey: ["aviso-jornada"],
    queryFn: () => carregar({ data: {} }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = settings.data?.ok ? settings.data.data : null;

  async function change(enabled: boolean) {
    setBusy(true);
    try {
      const r = await configurar({ data: { enabled, confirm: true } });
      setMessage(
        r.ok
          ? enabled
            ? "Aviso automático ativado. Nenhuma anamnese anterior à primeira ativação é reprocessada; as pendências registradas desde a primeira ativação voltam a ser entregues."
            : "Aviso automático pausado. A fila é preservada; nada é apagado."
          : r.message,
      );
      await settings.refetch();
      await queryClient.invalidateQueries({ queryKey: ["envios-jornada"] });
      onChanged();
    } catch {
      setMessage("Não foi possível alterar o aviso automático.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <h2 className="font-serif text-lg">Aviso automático ao Jornada AI</h2>
      <p className="text-sm text-muted-foreground">
        Envia somente o estado administrativo (identificadores) de anamneses definitivamente
        confirmadas. Não envia respostas, medidas, exames nem mensagens ao paciente.
      </p>
      {settings.isError && (
        <p className="text-sm text-destructive">
          Não foi possível ler a situação do aviso automático. Os contadores abaixo não estão
          disponíveis; nada foi alterado.
        </p>
      )}
      {settings.data && !settings.data.ok && (
        <p className="text-sm text-destructive">{settings.data.message}</p>
      )}
      {data && (
        <>
          <p className="text-sm">
            Situação:{" "}
            <strong>
              {!data.configOk
                ? "configuração indisponível"
                : data.enabled
                  ? data.jobActive
                    ? "ativo"
                    : "ativo, verificação periódica desligada"
                  : "pausado"}
            </strong>
            {data.activatedAt && data.enabled
              ? ` · ativado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.activatedAt))}`
              : ""}
            {data.firstActivatedAt
              ? ` · primeira ativação em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(data.firstActivatedAt))}`
              : ""}
            {` · na fila: ${data.pending} · pendências de vínculo: ${data.blocked} · precisam de intervenção: ${data.exhausted} · fora da fila: ${data.missing} · confirmados: ${data.sent}`}
          </p>
          {!data.configOk && (
            <p className="text-sm text-destructive">
              {data.keyReady
                ? "O recebimento de anamneses do GHL não está configurado para esta clínica. Confira a integração antes de ativar."
                : "O preparo do aviso ainda não foi concluído no servidor. Ative para concluir o preparo."}
            </p>
          )}
          {data.enabled && !data.jobActive && (
            <p className="text-sm text-destructive">
              A verificação periódica no servidor está desligada: os avisos ficam na fila sem
              entrega automática.
            </p>
          )}
          <Button
            disabled={busy}
            variant={data.enabled ? "outline" : "default"}
            onClick={() => void change(!data.enabled)}
          >
            {data.enabled ? "Pausar aviso automático" : "Ativar aviso automático"}
          </Button>
        </>
      )}
      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}

function stamp(iso: string | null) {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date)
    : iso;
}

/**
 * Envios administrativos da fila, independentes da leitura e dos filtros da
 * agenda GHL: mostra também anamneses sem convite ou sem agendamento.
 */
function EnviosPanel() {
  const listar = useServerFn(listarEnviosJornada);
  const reenviar = useServerFn(reenviarAvisoJornada);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const limit = 10;
  const query = useQuery({
    queryKey: ["envios-jornada", offset],
    queryFn: () => listar({ data: { limit, offset } }),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = query.data?.ok ? query.data.data : null;
  const readFailure = query.isError
    ? "Não foi possível ler a fila de envios. A lista abaixo não está completa."
    : query.data && !query.data.ok
      ? query.data.message
      : null;

  async function requeue(outboxId: string) {
    setBusy(outboxId);
    try {
      const r = await reenviar({ data: { outboxId, confirm: true } });
      setMessage(
        r.ok
          ? r.data.requeued
            ? "Aviso recolocado na fila."
            : "Este aviso já não está em falha."
          : r.message,
      );
      await query.refetch();
    } catch {
      setMessage("Não foi possível recolocar o aviso na fila.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-3 rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-lg">Envios administrativos</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {query.isFetching ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Fila completa da clínica configurada, independente do período e dos filtros da agenda.
        Inclui anamneses preenchidas sem convite ou sem agendamento. Pendências aparecem primeiro.
      </p>
      {readFailure && <p className="text-sm text-destructive">{readFailure}</p>}
      {query.isPending && <p className="text-sm text-muted-foreground">Lendo a fila…</p>}
      {data && (
        <>
          <p className="text-sm">
            {data.total} envio(s) registrados · mostrando {data.rows.length} a partir de{" "}
            {data.offset + 1}
          </p>
          {data.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum envio registrado nesta página.</p>
          ) : (
            <ul className="space-y-3">
              {data.rows.map((row) => (
                <li key={row.outboxId} className="rounded-md border p-3 text-sm">
                  <p className={SYNC_TONE[row.sync.state]}>{SYNC_LABEL[row.sync.state]}</p>
                  {row.sync.note && <p className="text-muted-foreground">{row.sync.note}</p>}
                  <p className="text-muted-foreground">
                    Tentativas: {row.attempts} de {row.maxAttempts} · na fila desde{" "}
                    {stamp(row.enqueuedAt)}
                  </p>
                  <p className="text-muted-foreground">
                    Última tentativa: {stamp(row.sync.lastAttemptAt)} · próxima:{" "}
                    {stamp(row.sync.nextAttemptAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <Link to="/consulta" search={{ id: row.consultationId }}>
                        Abrir consulta
                      </Link>
                    </Button>
                    {(row.sync.state === "falha" ||
                      row.sync.state === "falha_intervencao" ||
                      row.sync.state === "pendencia_vinculo") && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === row.outboxId}
                        onClick={() => void requeue(row.outboxId)}
                      >
                        Recolocar na fila
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={data.offset === 0 || query.isFetching}
              onClick={() => setOffset(Math.max(0, offset - limit))}
            >
              Página anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.offset + data.rows.length >= data.total || query.isFetching}
              onClick={() => setOffset(offset + limit)}
            >
              Próxima página
            </Button>
            <span className="text-xs text-muted-foreground">
              Até {limit} envios por página, ordenados por pendência.
            </span>
          </div>
        </>
      )}
      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}

function SyncLine({
  row,
  timezone,
  onRequeued,
}: {
  row: AppointmentRow;
  timezone: string;
  onRequeued: () => void;
}) {
  const reenviar = useServerFn(reenviarAvisoJornada);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sync = row.sync;
  return (
    <div className="mt-3 border-t border-border pt-3 text-sm">
      <p className={SYNC_TONE[sync.state]}>Sincronização: {SYNC_LABEL[sync.state]}</p>
      {sync.note && <p className="text-muted-foreground">{sync.note}</p>}
      {sync.lastAttemptAt && (
        <p className="text-muted-foreground">
          Última tentativa: {formatStamp(sync.lastAttemptAt, timezone)}
        </p>
      )}
      {sync.nextAttemptAt && (
        <p className="text-muted-foreground">
          Próxima tentativa: {formatStamp(sync.nextAttemptAt, timezone)}
        </p>
      )}
      {sync.outboxId &&
        (sync.state === "falha" ||
          sync.state === "falha_intervencao" ||
          sync.state === "pendencia_vinculo") && (
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await reenviar({
                  data: { outboxId: sync.outboxId as string, confirm: true },
                });
                setMessage(
                  r.ok
                    ? r.data.requeued
                      ? "Aviso recolocado na fila."
                      : "Este aviso já não está em falha."
                    : r.message,
                );
                onRequeued();
              } catch {
                setMessage("Não foi possível recolocar o aviso na fila.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Recolocar na fila
          </Button>
        )}
      {message && <p className="mt-2 text-muted-foreground">{message}</p>}
    </div>
  );
}

function AppointmentsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string } | undefined>();
  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage | "todas">("todas");

  const listar = useServerFn(listarAgendamentosConfirmados);
  const query = useQuery({
    // A chave inclui o período: uma resposta antiga nunca sobrescreve a busca atual.
    queryKey: ["agendamentos", applied?.from, applied?.to],
    queryFn: () => listar({ data: applied ?? {} }),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  const payload = !query.isError && query.data?.ok ? query.data.data : null;
  const failure = query.data && !query.data.ok ? query.data : null;
  useEffect(() => {
    if (payload && !applied) {
      setFrom((previous) => previous || payload.range.from);
      setTo((previous) => previous || payload.range.to);
    }
  }, [payload, applied]);

  const rows = useMemo(() => {
    const all: AppointmentRow[] = payload?.rows ?? [];
    const term = name.trim().toLowerCase();
    return all.filter(
      (r) =>
        (stage === "todas" || r.stage === stage) &&
        (!term || (r.patientName ?? "").toLowerCase().includes(term)),
    );
  }, [payload, name, stage]);

  const counts = useMemo(() => {
    const map = new Map<Stage, number>();
    for (const r of rows) map.set(r.stage, (map.get(r.stage) ?? 0) + 1);
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="clinical-workspace min-h-screen bg-background text-foreground">
      <BrandHeader />
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/consulta"
          search={{ id: undefined }}
          className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Consulta do paciente
        </Link>

        <div className="max-w-2xl border-b border-border pb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Área clínica — somente leitura
          </p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Harmonização Glútea</h1>
          <p className="mt-2 text-muted-foreground">Agendamentos confirmados e anamnese</p>
        </div>

        <form
          className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setApplied({ from, to });
          }}
        >
          <label className="text-sm">
            <span className="mb-1 block font-medium">De</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Até</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Nome do paciente</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Filtrar por nome"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Etapa</span>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={stage}
              onChange={(e) => setStage(e.target.value as Stage | "todas")}
            >
              {FILTERS.map((option) => (
                <option key={option} value={option}>
                  {option === "todas" ? "Todas as etapas" : STAGE_LABEL[option]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
            <Button type="submit">Aplicar período</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {query.isFetching ? "Atualizando…" : "Atualizar agora"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Período limitado a 31 dias. Padrão: próximos 30 dias.
            </p>
          </div>
        </form>

        <SyncPanel onChanged={() => void query.refetch()} />

        <EnviosPanel />

        <p className="text-xs text-muted-foreground">
          Os controles do aviso gerenciam apenas a fila de envios administrativos ao Jornada AI: não
          criam agendamentos, convites nem mensagens ao paciente. A agenda acima permanece somente
          leitura.
        </p>

        <div role="status" aria-live="polite" className="space-y-4">
          {query.isPending && (
            <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">
              Consultando a agenda da clínica…
            </p>
          )}

          {query.isError && (
            <div className="rounded-md border border-destructive/50 bg-card p-4">
              <p className="text-sm text-destructive">
                Não foi possível atualizar a agenda. Verifique a conexão e tente novamente.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void query.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {failure && (
            <div className="rounded-md border border-destructive/50 bg-card p-4">
              <p className="text-sm text-destructive">{failure.message}</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {failure.code === "unauthorized" ? (
                  <Button asChild size="sm">
                    <a href="/login?returnTo=%2Fagendamentos">Entrar novamente</a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                    Tentar novamente
                  </Button>
                )}
              </div>
            </div>
          )}

          {payload && (
            <>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-card p-4 text-sm">
                <span className="font-medium">
                  {rows.length} agendamento(s) confirmados no período e filtros
                </span>
                {counts.map(([key, count]) => (
                  <span key={key} className="text-muted-foreground">
                    {STAGE_LABEL[key]}: {count}
                  </span>
                ))}
                <span className="text-xs text-muted-foreground">
                  Período {formatDate(payload.range.from)} a {formatDate(payload.range.to)} · fuso
                  da clínica {payload.timezone} · última consulta aos serviços{" "}
                  {formatStamp(payload.fetchedAt, payload.timezone)}
                </span>
              </div>

              {payload.warnings.map((w) => (
                <p key={w} className="rounded-md border border-gold/60 bg-card p-3 text-sm">
                  Resultado parcial: {w}
                </p>
              ))}

              {rows.length === 0 ? (
                <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                  {payload.warnings.length > 0
                    ? "Nenhum agendamento pôde ser exibido com estes filtros. A leitura está parcial; confira os avisos acima."
                    : "Nenhum agendamento confirmado neste período e filtros."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {rows.map((row) => (
                    <li
                      key={`${row.appointmentId}-${row.startIso}`}
                      className="rounded-md border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 break-words">
                          <p className="font-serif text-lg">
                            {row.patientName ?? "Nome indisponível neste momento"}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatDate(row.localDate)} às {row.localTime} ({payload.timezone})
                            {row.nameSource === "cadastro"
                              ? " · nome do cadastro da consulta"
                              : row.nameSource === "ghl"
                                ? " · nome do contato na agenda"
                                : " · não foi possível confirmar o nome"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs ${STAGE_TONE[row.stage]}`}
                        >
                          {STAGE_LABEL[row.stage]}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                        {row.receivedAt && (
                          <p>Recebida em {formatStamp(row.receivedAt, payload.timezone)}</p>
                        )}
                        {row.stage === "aplicada" && <p>Versão recebida atual aplicada à ficha.</p>}
                        {row.stage === "nova_versao" && (
                          <p>A ficha usa uma versão anterior. Revise a versão mais recente.</p>
                        )}
                        {row.expiresAt && !row.receivedAt && (
                          <p>
                            Validade registrada do convite:{" "}
                            {formatStamp(row.expiresAt, payload.timezone)}
                          </p>
                        )}
                        {row.note && <p>{row.note}</p>}
                      </div>
                      <SyncLine
                        row={row}
                        timezone={payload.timezone}
                        onRequeued={() => void query.refetch()}
                      />
                      {row.consultationId && (
                        <Button asChild variant="outline" size="sm" className="mt-3">
                          <Link to="/consulta" search={{ id: row.consultationId }}>
                            Abrir consulta
                          </Link>
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <p className="text-xs text-muted-foreground">
                Esta página é somente leitura: não cria convites, não envia mensagens e não altera
                agendamentos. A criação de um convite não comprova envio ou entrega ao paciente.
              </p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
