import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { abrirAnaliseDaConsulta, obterAnaliseDaConsulta } from "@/lib/journey.functions";
import { BrandHeader } from "@/components/BrandHeader";
import { GhlIntakeSettings } from "@/components/GhlIntakeSettings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createConsultation,
  listConsultations,
  loadConsultation,
  prepareConsultation,
  saveConsultationDraft,
} from "@/lib/consultations/api";
import { identityWarnings, mapAnamnesis, parseSavedAnswers } from "@/lib/consultations/mapping";
import { anamnesisSections, formatAnswer, isFieldVisible } from "@/lib/anamnesis/form";
import { useReportStore, type BodyCompositionData, type ClinicalData } from "@/store/report-store";
import type { Submission } from "@/lib/consultations/types";
import {
  consultationPrimaryAction,
  consultationReportState,
  isCurrentApprovedProtocol,
  type ConsultationPrimaryAction,
} from "@/lib/clinical-navigation";
export const Route = createFileRoute("/consulta")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Consulta do paciente — BioReport Studio" },
      {
        name: "description",
        content: "Organize anamnese, bioimpedância, análise clínica e relatório do atendimento.",
      },
      { property: "og:title", content: "Consulta do paciente — BioReport Studio" },
      { property: "og:description", content: "Área clínica de atendimento do paciente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ConsultationPage,
});
type Loaded = Awaited<ReturnType<typeof loadConsultation>>;
function ConsultationPage() {
  const { id } = Route.useSearch();
  return (
    <div className="clinical-workspace min-h-screen bg-background text-foreground">
      <BrandHeader />
      <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6 sm:py-10">
        <Link
          to="/"
          className="inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Início
        </Link>
        <div className="max-w-2xl border-b border-border pb-6">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Área clínica
          </p>
          <h1 className="mt-2 font-serif text-3xl sm:text-4xl">Consulta do paciente</h1>
          <p className="mt-2 text-muted-foreground">
            Anamnese, bioimpedância, análise e relatório no mesmo atendimento.
          </p>
        </div>
        {id ? (
          z.uuid().safeParse(id).success ? (
            <ConsultationDetail key={id} id={id} />
          ) : (
            <p role="alert">
              O identificador da consulta é inválido.{" "}
              <Link to="/consulta" search={{ id: undefined }} className="underline">
                Voltar à lista
              </Link>
            </p>
          )
        ) : (
          <ConsultationList />
        )}
        <details className="group rounded-md border bg-card p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Integração com agendamentos
            <ChevronDown
              className="h-4 w-4 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="mt-4">
            <GhlIntakeSettings
              key={id ?? "list"}
              consultationId={id && z.uuid().safeParse(id).success ? id : undefined}
            />
          </div>
        </details>
      </main>
    </div>
  );
}
function ConsultationList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Awaited<ReturnType<typeof listConsultations>> | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [date, setDate] = useState("");
  const ids = useRef<{ id: string; patientId: string } | null>(null);
  useEffect(() => {
    let live = true;
    setError("");
    void listConsultations()
      .then((data) => {
        if (live) setItems(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  async function create(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    ids.current ??= { id: crypto.randomUUID(), patientId: crypto.randomUUID() };
    try {
      const id = await createConsultation({
        id: ids.current.id,
        patientId: patient || ids.current.patientId,
        name,
        email: email.trim().toLowerCase(),
        date,
        existingPatient: !!patient,
      });
      await navigate({ to: "/consulta", search: { id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar a consulta.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/50 bg-card p-4"
        >
          <span>{error}</span>
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      <section aria-labelledby="recentes-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Consultas recentes
            </p>
            <h2 id="recentes-title" className="mt-1 font-serif text-2xl">
              Retomar consulta
            </h2>
          </div>
          <span className="text-sm text-muted-foreground">Até 100 consultas recentes</span>
        </div>
        {!items && !error && (
          <p role="status" className="rounded-md border bg-card p-5 text-sm text-muted-foreground">
            Carregando consultas…
          </p>
        )}
        {items?.consultations.length ? (
          <ul className="grid gap-3 lg:grid-cols-2">
            {items.consultations.map((c) => (
              <li key={c.id}>
                <Card className="h-full rounded-md shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="flex h-full flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center">
                    <div className="min-w-0">
                      <strong className="block truncate text-base">{c.patient_name}</strong>
                      <span className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <CalendarDays className="h-4 w-4" aria-hidden="true" />
                        {c.consultation_date.split("-").reverse().join("/")}
                      </span>
                      <small className="mt-2 block truncate text-muted-foreground">
                        {c.invite_email || "Preenchimento na clínica"}
                      </small>
                    </div>
                    <Button asChild className="shrink-0">
                      <Link to="/consulta" search={{ id: c.id }}>
                        Retomar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        ) : items ? (
          <div className="rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
            Nenhuma consulta cadastrada.
          </div>
        ) : null}
      </section>

      <details className="group rounded-md border bg-card shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>Nova consulta</span>
          <ChevronDown
            className="h-4 w-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t p-5">
          <form onSubmit={create} className="grid gap-5 sm:grid-cols-2">
            <label className="space-y-2">
              Paciente
              <select
                disabled={busy}
                className="block w-full rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={patient}
                onChange={(e) => {
                  setPatient(e.target.value);
                  ids.current = null;
                  const p = items?.patients.find((p) => p.id === e.target.value);
                  setName(p?.name ?? "");
                  setEmail(p?.email ?? "");
                }}
              >
                <option value="">Cadastrar novo paciente</option>
                {items?.patients.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.email || "sem e-mail"} — {p.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nome completo
              <input
                className="mt-2 block w-full rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                required
                minLength={2}
                maxLength={150}
                disabled={busy || !!patient}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  ids.current = null;
                }}
              />
            </label>
            <label>
              E-mail para o convite
              <input
                className="mt-2 block w-full rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="email"
                maxLength={254}
                disabled={busy}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  ids.current = null;
                }}
              />
              <span className="text-xs text-muted-foreground">
                Opcional. Para responder à distância, o paciente deve usar este e-mail no Google.
              </span>
            </label>
            <label>
              Data da consulta
              <input
                className="mt-2 block w-full rounded-md border bg-background p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="date"
                required
                disabled={busy}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  ids.current = null;
                }}
              />
            </label>
            <Button disabled={busy || !items} type="submit">
              {busy ? "Salvando…" : "Criar consulta"}
            </Button>
          </form>
        </div>
      </details>

      <details className="group rounded-md border bg-card p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Históricos e ferramentas anteriores
          <ChevronDown
            className="h-4 w-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <nav
          aria-label="Históricos"
          className="mt-4 flex flex-col gap-3 border-t pt-4 text-sm sm:flex-row sm:gap-6"
        >
          <Link to="/history" className="underline underline-offset-4">
            Histórico de relatórios
          </Link>
          <Link to="/jornada" className="underline underline-offset-4">
            Análises e protocolos anteriores
          </Link>
        </nav>
      </details>
    </div>
  );
}
function ConsultationDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Submission | null>(null);
  const obterAnalise = useServerFn(obterAnaliseDaConsulta);
  const abrirAnalise = useServerFn(abrirAnaliseDaConsulta);
  const [openingAnalysis, setOpeningAnalysis] = useState(false);
  const analysisQuery = useQuery({
    queryKey: ["consulta-analise", id, data?.draft.version, data?.submissions[0]?.id],
    queryFn: () => obterAnalise({ data: { consultationId: id } }),
    enabled: !!data,
  });
  const analysis = analysisQuery.data?.jornada;
  async function openAnalysis() {
    if (openingAnalysis) return;
    setOpeningAnalysis(true);
    setError("");
    try {
      const loaded = await prepareConsultation(id);
      setData(loaded);
      const result = await abrirAnalise({ data: { consultationId: id } });
      await navigate({ to: "/jornada/$id", params: { id: result.jornada.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível abrir a análise.");
    } finally {
      setOpeningAnalysis(false);
    }
  }
  useEffect(() => {
    let live = true;
    setError("");
    void prepareConsultation(id)
      .then((d) => {
        if (live) {
          setData(d);
          setSelected(
            d.submissions.find((s) => s.id === d.draft.anamnesis_id) ?? d.submissions[0] ?? null,
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  function openWorkspace(
    target: "/upload" | "/body-composition" | "/clinical-form" | "/review",
    loaded: Loaded = data!,
  ) {
    const store = useReportStore.getState();
    const differentConsultation = store.consultation?.id !== id;
    const differentDraft =
      JSON.stringify(store.bodyComposition) !== JSON.stringify(loaded.draft.body_composition) ||
      JSON.stringify(store.clinicalData) !== JSON.stringify(loaded.draft.clinical_data);
    if (
      (store.bodyComposition || store.clinicalData) &&
      (differentConsultation || differentDraft) &&
      !window.confirm(
        "Carregar os dados salvos desta consulta substituirá os dados em edição neste navegador. Continuar?",
      )
    )
      return;
    if (differentConsultation) store.reset();
    useReportStore.setState({
      consultation: {
        id,
        patientId: loaded.consultation.patient_id,
        patientName: loaded.consultation.patient_name,
        version: loaded.draft.version,
        anamnesisId: loaded.draft.anamnesis_id,
      },
      bodyComposition: loaded.draft.body_composition as unknown as BodyCompositionData | null,
      clinicalData: loaded.draft.clinical_data as unknown as ClinicalData | null,
    });
    void navigate({ to: target });
  }
  async function importSubmission() {
    if (!data || !selected || busy) return;
    if (data.draft.anamnesis_id === selected.id) {
      openWorkspace("/clinical-form");
      return;
    }
    if (
      data.draft.clinical_data &&
      !window.confirm(
        "Carregar esta versão substituirá a ficha clínica salva desta consulta. A anamnese original e os relatórios anteriores serão preservados. Continuar?",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const clinical = mapAnamnesis(
        selected.answers,
        data.draft.body_composition as unknown as BodyCompositionData | null,
      );
      const version = await saveConsultationDraft(id, data.draft.version, {
        clinicalData: clinical,
        anamnesisId: selected.id,
      });
      const next = {
        ...data,
        draft: {
          ...data.draft,
          clinical_data: clinical as unknown as Loaded["draft"]["clinical_data"],
          anamnesis_id: selected.id,
          version,
        },
      };
      setData(next);
      openWorkspace("/clinical-form", next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar a anamnese.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <>
        {error ? (
          <p role="alert">
            {error} <Button onClick={() => setAttempt((a) => a + 1)}>Tentar novamente</Button>
          </p>
        ) : (
          <p>Carregando consulta…</p>
        )}
      </>
    );
  let answers: ReturnType<typeof parseSavedAnswers> | null = null;
  let invalid = "";
  try {
    if (selected) answers = parseSavedAnswers(selected.answers);
  } catch (e) {
    invalid = (e as Error).message;
  }
  const warnings = answers
    ? identityWarnings(
        answers,
        data.draft.body_composition as unknown as BodyCompositionData | null,
      )
    : [];
  if (
    answers &&
    answers.patientName.trim().toLocaleLowerCase("pt-BR") !==
      data.consultation.patient_name.trim().toLocaleLowerCase("pt-BR")
  )
    warnings.push(
      "O nome informado na anamnese difere do cadastro da consulta. Confira a identidade antes de carregar.",
    );
  const selectedApplied = !!selected && data.draft.anamnesis_id === selected.id;
  const reportState = consultationReportState({
    analysisPending: analysisQuery.isPending,
    analysisError: analysisQuery.isError,
    analysis,
  });
  const primaryAction = consultationPrimaryAction({
    analysisPending: analysisQuery.isPending,
    analysisError: analysisQuery.isError,
    analysis,
    hasReceivedAnamnesis: data.submissions.length > 0,
    selectedAnamnesisApplied: selectedApplied,
    hasClinicalData: !!data.draft.clinical_data,
    hasBodyComposition: !!data.draft.body_composition,
  });

  function renderPrimaryAction(action: ConsultationPrimaryAction) {
    if (action.kind === "analysis-loading") return <Button disabled>{action.label}</Button>;
    if (action.kind === "analysis-error") {
      return <Button onClick={() => void analysisQuery.refetch()}>{action.label}</Button>;
    }
    if (action.kind === "refresh-analysis") {
      return (
        <Button asChild>
          <Link to="/jornada/$id" params={{ id: action.journeyId }}>
            {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      );
    }
    if (action.kind === "open-approved" || action.kind === "continue-analysis") {
      return (
        <Button asChild>
          <Link
            to="/jornada/$id"
            params={{ id: action.journeyId }}
            search={{ etapa: action.kind === "open-approved" ? 6 : undefined }}
          >
            {action.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      );
    }
    if (action.kind === "review-received") {
      return (
        <Button disabled={busy || !!invalid} onClick={() => void importSubmission()}>
          {busy ? "Carregando…" : action.label}
        </Button>
      );
    }
    if (action.kind === "start-analysis") {
      return (
        <Button disabled={openingAnalysis} onClick={() => void openAnalysis()}>
          {openingAnalysis ? "Abrindo…" : action.label}
        </Button>
      );
    }
    return (
      <Button asChild>
        <Link to="/anamnese" search={{ consulta: id }}>
          {action.label}
        </Link>
      </Button>
    );
  }
  return (
    <div className="space-y-6">
      <section
        className="flex flex-col justify-between gap-5 border-b border-border pb-6 sm:flex-row sm:items-end"
        aria-labelledby="patient-title"
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Atendimento
          </p>
          <h2 id="patient-title" className="mt-1 font-serif text-3xl">
            {data.consultation.patient_name}
          </h2>
          <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {data.consultation.consultation_date.split("-").reverse().join("/")} · Paciente{" "}
            {data.consultation.patient_id.slice(0, 8)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setAttempt((a) => a + 1)}>
            Atualizar dados
          </Button>
          <Button asChild variant="outline">
            <Link to="/consulta" search={{ id: undefined }}>
              Todas as consultas
            </Link>
          </Button>
        </div>
      </section>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/50 bg-card p-4">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border bg-card p-4 text-sm">
          {notice}
        </p>
      )}

      <section
        aria-labelledby="next-action"
        className="rounded-md border border-gold/50 bg-card p-5 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-6"
      >
        <div className="mb-4 sm:mb-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Próxima ação
          </p>
          <h3 id="next-action" className="mt-1 font-serif text-xl">
            {primaryAction.kind === "analysis-loading"
              ? "Verificando o atendimento"
              : primaryAction.kind === "analysis-error"
                ? "Retomar o carregamento da análise"
                : primaryAction.kind === "refresh-analysis"
                  ? "A análise precisa dos dados atuais"
                  : primaryAction.kind === "open-approved"
                    ? "Protocolo atual aprovado"
                    : primaryAction.kind === "review-received"
                      ? "Conferir a anamnese recebida"
                      : primaryAction.kind === "fill-anamnesis"
                        ? "Registrar a anamnese"
                        : "Dar continuidade ao atendimento"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {primaryAction.kind === "refresh-analysis"
              ? "Há dados novos na consulta. Atualize e revise antes de gerar, aprovar ou imprimir."
              : primaryAction.kind === "analysis-error"
                ? "A análise não pôde ser carregada. Tente novamente antes de continuar."
                : primaryAction.kind === "review-received"
                  ? "As respostas foram recebidas e ainda não estão aplicadas à ficha selecionada."
                  : "Continue pelo ponto atual deste atendimento."}
          </p>
        </div>
        <div className="shrink-0">{renderPrimaryAction(primaryAction)}</div>
      </section>

      <section aria-labelledby="workflow-title">
        <div className="mb-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Fluxo clínico
          </p>
          <h3 id="workflow-title" className="mt-1 font-serif text-2xl">
            Atendimento
          </h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-md shadow-sm">
            <CardHeader className="pb-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                01
              </span>
              <CardTitle className="font-serif text-xl">Anamnese</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm font-medium">
                {data.submissions.length
                  ? `${data.submissions.length} versão(ões) recebida(s)`
                  : "Aguardando preenchimento"}
              </p>
              {!data.submissions.length && (
                <Button asChild variant="outline">
                  <Link to="/anamnese" search={{ consulta: id }}>
                    Preencher anamnese
                  </Link>
                </Button>
              )}
              {data.consultation.invite_email && (
                <>
                  <p className="break-words text-sm text-muted-foreground">
                    Convite: {data.consultation.invite_email}
                    <br />
                    Válido até{" "}
                    {new Date(data.consultation.invite_expires_at).toLocaleDateString("pt-BR")}
                  </p>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}/anamnese?consulta=${id}`,
                        );
                        setNotice(
                          "Link copiado. O paciente precisa entrar com o e-mail do convite.",
                        );
                      } catch {
                        setNotice(
                          "Não foi possível copiar. Use o endereço do botão Preencher anamnese.",
                        );
                      }
                    }}
                  >
                    Copiar link do paciente
                  </Button>
                </>
              )}
              {data.submissions.length > 0 && (
                <>
                  <label className="block text-sm">
                    Versão
                    <select
                      className="mt-2 block w-full rounded-md border bg-background p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={selected?.id ?? ""}
                      onChange={(e) =>
                        setSelected(data.submissions.find((s) => s.id === e.target.value) ?? null)
                      }
                    >
                      {data.submissions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {new Date(s.confirmed_at).toLocaleString("pt-BR")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                    <p>
                      Recebida em{" "}
                      {selected ? new Date(selected.confirmed_at).toLocaleString("pt-BR") : "—"}
                    </p>
                    <p className="mt-1">
                      Ficha clínica:{" "}
                      {selectedApplied
                        ? "esta versão está aplicada"
                        : "esta versão ainda não foi aplicada"}
                    </p>
                    <p className="mt-1">
                      Confirmação:{" "}
                      {selected?.accepted ? "confirmada pelo paciente" : "confirmação pendente"}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    disabled={busy || !!invalid}
                    onClick={() => void importSubmission()}
                  >
                    {busy
                      ? "Carregando…"
                      : selectedApplied
                        ? "Revisar respostas recebidas"
                        : "Usar esta versão na ficha"}
                  </Button>
                  <Button asChild variant="ghost" className="text-muted-foreground">
                    <Link to="/anamnese" search={{ consulta: id }}>
                      Registrar nova versão
                    </Link>
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-md shadow-sm">
            <CardHeader className="pb-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                02
              </span>
              <CardTitle className="font-serif text-xl">Bioimpedância</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>{data.draft.body_composition ? "Dados do exame salvos" : "Aguardando exame"}</p>
              <p className="text-sm text-muted-foreground">
                Importe o exame e confira as medidas antes de salvar.
              </p>
              <Button variant="outline" onClick={() => openWorkspace("/upload")}>
                {data.draft.body_composition ? "Importar novo exame" : "Adicionar exame"}
              </Button>
              {data.draft.body_composition && (
                <Button variant="outline" onClick={() => openWorkspace("/body-composition")}>
                  Revisar exame salvo
                </Button>
              )}
            </CardContent>
          </Card>
          <Card className="rounded-md shadow-sm">
            <CardHeader className="pb-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                03
              </span>
              <CardTitle className="font-serif text-xl">Análise</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>
                {analysisQuery.isPending
                  ? "Conferindo análise…"
                  : analysisQuery.isError
                    ? "Não foi possível carregar a análise."
                    : !analysis
                      ? "Ainda não iniciada"
                      : analysis.sourceCurrent === false
                        ? "Dados da consulta atualizados — revisão necessária"
                        : isCurrentApprovedProtocol(analysis)
                          ? "Protocolo aprovado"
                          : "Análise em andamento"}
              </p>
              <p className="text-sm text-muted-foreground">
                Aproveita a anamnese e o exame desta consulta. Revise os dados e prepare o
                protocolo.
              </p>
              {analysis && !analysisQuery.isError && !analysisQuery.isPending && (
                <Button asChild variant="outline">
                  <Link to="/jornada/$id" params={{ id: analysis.id }}>
                    Abrir análise
                  </Link>
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Sua análise permanece vinculada a este atendimento. O acesso continua restrito ao
                profissional responsável.
              </p>
            </CardContent>
          </Card>
          <Card className="rounded-md shadow-sm">
            <CardHeader className="pb-4">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                04
              </span>
              <CardTitle className="font-serif text-xl">Relatório</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p role="status">
                {
                  {
                    loading: "Conferindo o protocolo…",
                    error: "Não foi possível conferir o protocolo.",
                    stale: "Dados atualizados — revise a análise antes de continuar.",
                    approved: "Protocolo atual aprovado — disponível para impressão.",
                    draft: "Rascunho preparado — aguarda revisão e aprovação.",
                    missing: "Protocolo ainda não preparado.",
                  }[reportState]
                }
              </p>
              {analysis && !analysisQuery.isPending && !analysisQuery.isError && (
                <Button asChild variant="outline">
                  <Link
                    to="/jornada/$id"
                    params={{ id: analysis.id }}
                    search={{
                      etapa:
                        reportState === "approved"
                          ? 6
                          : reportState === "stale"
                            ? undefined
                            : reportState === "draft"
                              ? 5
                              : 4,
                    }}
                  >
                    {reportState === "approved"
                      ? "Abrir protocolo aprovado"
                      : reportState === "stale"
                        ? "Revisar dados atualizados"
                        : reportState === "draft"
                          ? "Revisar e aprovar protocolo"
                          : "Preparar protocolo"}
                  </Link>
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                {data.draft.anamnesis_id
                  ? "As respostas recebidas já estão na ficha. Revise e complete somente o que faltar."
                  : "Adicione um exame ou aguarde a anamnese para revisar a ficha."}
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <details className="group rounded-md border bg-card shadow-sm">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Ferramentas anteriores e histórico
          <ChevronDown
            className="h-4 w-4 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="space-y-4 border-t p-5">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => openWorkspace("/clinical-form")}>
              Revisar ficha clínica
            </Button>
            <Button
              variant="outline"
              disabled={!data.draft.clinical_data}
              onClick={() => openWorkspace("/review")}
            >
              Gerador antigo de PDF
            </Button>
            <Button asChild variant="ghost">
              <Link to="/history">Abrir histórico completo</Link>
            </Button>
          </div>
          {data.reports.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {data.reports.length} documento(s) do gerador anterior
              </p>
              <ul className="divide-y rounded-md border">
                {data.reports.map((r) => (
                  <li className="break-words p-3 text-xs" key={r.id}>
                    {r.pdf_file_name}
                    <br />
                    {new Date(r.generated_at).toLocaleString("pt-BR")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
      {invalid && <p role="alert">{invalid}</p>}
      {warnings.map((w) => (
        <p key={w} role="alert" className="rounded border border-amber-400 bg-amber-50 p-4">
          {w}
        </p>
      ))}
      {answers && selected && (
        <Card className="rounded-md shadow-sm">
          <CardHeader>
            <CardTitle>Respostas originais da anamnese</CardTitle>
            <p className="text-sm">
              Confirmada por {selected.confirmed_name} em{" "}
              {new Date(selected.confirmed_at).toLocaleString("pt-BR")}.{" "}
              {data.draft.anamnesis_id === selected.id
                ? "Respostas aplicadas na ficha clínica. A revisão profissional continua disponível."
                : "Esta versão não é a utilizada na ficha atual."}
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {anamnesisSections.map((s) => (
              <section key={s.title}>
                <h3 className="font-semibold">{s.title}</h3>
                <dl className="grid gap-3 py-3 sm:grid-cols-2">
                  {s.fields
                    .filter((f) => isFieldVisible(f, answers!))
                    .map((f) => (
                      <div key={f.id}>
                        <dt className="text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="whitespace-pre-wrap break-words text-sm">
                          {formatAnswer(f, answers![f.id])}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
