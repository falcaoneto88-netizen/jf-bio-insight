import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createConsultation,
  listConsultations,
  loadConsultation,
  saveConsultationDraft,
} from "@/lib/consultations/api";
import { identityWarnings, mapAnamnesis, parseSavedAnswers } from "@/lib/consultations/mapping";
import { anamnesisSections, formatAnswer, isFieldVisible } from "@/lib/anamnesis/form";
import { useReportStore, type BodyCompositionData, type ClinicalData } from "@/store/report-store";
import type { Submission } from "@/lib/consultations/types";
export const Route = createFileRoute("/consulta")({
  validateSearch: (search: Record<string, unknown>) => ({
    id: typeof search.id === "string" ? search.id : undefined,
  }),
  head: () => ({ meta: [{ title: "Consulta do paciente — BioReport Studio" }] }),
  component: ConsultationPage,
});
type Loaded = Awaited<ReturnType<typeof loadConsultation>>;
function ConsultationPage() {
  const { id } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <Link to="/" className="text-sm underline">
          Início
        </Link>
        <h1 className="font-serif text-3xl">Consulta do paciente</h1>
        <p className="text-muted-foreground">
          Anamnese, bioimpedância e relatório no mesmo atendimento.
        </p>
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
    <>
      {error && (
        <div role="alert" className="rounded border border-destructive p-4">
          {error}{" "}
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Nova consulta</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              Paciente
              <select
                disabled={busy}
                className="block w-full rounded border p-3"
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
                className="mt-2 block w-full rounded border p-3"
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
                className="mt-2 block w-full rounded border p-3"
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
                className="mt-2 block w-full rounded border p-3"
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
        </CardContent>
      </Card>
      {!items && !error && <p>Carregando consultas…</p>}
      {items && (
        <Card>
          <CardHeader>
            <CardTitle>Consultas recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-muted-foreground">
              Até 100 consultas recentes e 200 pacientes para seleção.
            </p>
            {items.consultations.length ? (
              <ul className="divide-y">
                {items.consultations.map((c) => (
                  <li key={c.id} className="flex flex-wrap justify-between gap-3 py-4">
                    <span>
                      <strong>{c.patient_name}</strong> ·{" "}
                      {c.consultation_date.split("-").reverse().join("/")}
                      <small className="block text-muted-foreground">
                        {c.invite_email || "Preenchimento na clínica"}
                      </small>
                    </span>
                    <Button asChild variant="outline">
                      <Link to="/consulta" search={{ id: c.id }}>
                        Abrir consulta
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nenhuma consulta cadastrada.</p>
            )}
          </CardContent>
        </Card>
      )}
    </>
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
  useEffect(() => {
    let live = true;
    setError("");
    void loadConsultation(id)
      .then((d) => {
        if (live) {
          setData(d);
          setSelected(d.submissions[0] ?? null);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, attempt]);
  function openWorkspace(target: "/upload" | "/clinical-form" | "/review", loaded: Loaded = data!) {
    const store = useReportStore.getState();
    if (store.consultation?.id !== id) {
      if (
        (store.bodyComposition || store.clinicalData) &&
        !window.confirm("Abrir esta consulta substituirá o rascunho local atual. Continuar?")
      )
        return;
      store.reset();
    }
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
  return (
    <>
      <div className="flex flex-wrap justify-between gap-3 rounded border bg-muted/30 p-5">
        <div>
          <h2 className="font-serif text-2xl">{data.consultation.patient_name}</h2>
          <p>{data.consultation.consultation_date.split("-").reverse().join("/")}</p>
          <small>Paciente {data.consultation.patient_id.slice(0, 8)}</small>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            Atualizar
          </Button>
          <Button asChild variant="outline">
            <Link to="/consulta" search={{ id: undefined }}>
              Todas as consultas
            </Link>
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded border border-destructive p-4">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Anamnese</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              {data.submissions.length
                ? `${data.submissions.length} versão(ões) recebida(s)`
                : "Aguardando preenchimento"}
            </p>
            <Button asChild>
              <Link to="/anamnese" search={{ consulta: id }}>
                Preencher anamnese
              </Link>
            </Button>
            {data.consultation.invite_email && (
              <>
                <p className="break-words text-sm">
                  Convite para {data.consultation.invite_email}
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
                      setNotice("Link copiado. O paciente precisa entrar com o e-mail do convite.");
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
                    className="mt-2 block w-full rounded border p-2"
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
                <Button disabled={busy || !!invalid} onClick={() => void importSubmission()}>
                  {busy ? "Carregando…" : "Carregar na ficha clínica"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bioimpedância</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{data.draft.body_composition ? "Dados do exame salvos" : "Aguardando exame"}</p>
            <p className="text-sm text-muted-foreground">
              Importe o exame e confira as medidas antes de salvar.
            </p>
            <Button onClick={() => openWorkspace("/upload")}>
              {data.draft.body_composition ? "Importar novo exame" : "Adicionar exame"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Relatório</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>
              {data.reports.length
                ? `${data.reports.length} relatório(s) salvo(s)`
                : "Ainda não gerado"}
            </p>
            <Button
              disabled={!data.draft.clinical_data}
              onClick={() => openWorkspace("/clinical-form")}
            >
              Revisar ficha clínica
            </Button>
            <p className="text-xs text-muted-foreground">
              Carregue a anamnese ou adicione um exame para completar a ficha antes de gerar.
            </p>
            <ul>
              {data.reports.map((r) => (
                <li className="break-words border-t py-2 text-xs" key={r.id}>
                  {r.pdf_file_name}
                  <br />
                  {new Date(r.generated_at).toLocaleString("pt-BR")}
                </li>
              ))}
            </ul>
            <Link to="/history" className="text-sm underline">
              Abrir histórico de relatórios
            </Link>
          </CardContent>
        </Card>
      </div>
      {invalid && <p role="alert">{invalid}</p>}
      {warnings.map((w) => (
        <p key={w} role="alert" className="rounded border border-amber-400 bg-amber-50 p-4">
          {w}
        </p>
      ))}
      {answers && selected && (
        <Card>
          <CardHeader>
            <CardTitle>Respostas originais da anamnese</CardTitle>
            <p className="text-sm">
              Confirmada por {selected.confirmed_name} em{" "}
              {new Date(selected.confirmed_at).toLocaleString("pt-BR")}.{" "}
              {data.draft.anamnesis_id === selected.id
                ? "Versão carregada na ficha."
                : "Esta versão ainda não está carregada na ficha."}
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
    </>
  );
}
