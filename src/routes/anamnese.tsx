import { z } from "zod";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { loadPatientInvitation, submitAnamnesis } from "@/lib/consultations/api";
import type { Consultation } from "@/lib/consultations/types";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Printer,
  ShieldCheck,
} from "lucide-react";
import {
  anamnesisFields,
  anamnesisSchema,
  anamnesisSections,
  confirmationSchema,
  emptyAnamnesis,
  formatAnswer,
  isFieldVisible,
  patientDeclaration,
  updateAnswer,
  type AnamnesisAnswers,
  type IntakeField,
} from "@/lib/anamnesis/form";
import "@/styles/anamnesis.css";

export const Route = createFileRoute("/anamnese")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    consulta: typeof search.consulta === "string" ? search.consulta : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Anamnese — Paciente | Dr. João Falcão" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AnamnesisPage,
});

type Step = "fill" | "review" | "done";
function AnamnesisPage() {
  const { consulta } = Route.useSearch();
  return consulta ? (
    z.uuid().safeParse(consulta).success ? (
      <InvitedAnamnesis key={consulta} id={consulta} />
    ) : (
      <main className="p-10" role="alert">
        O link da consulta é inválido. Solicite outro link à clínica.
      </main>
    )
  ) : (
    <AnamnesisForm />
  );
}
function InvitedAnamnesis({ id }: { id: string }) {
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void loadPatientInvitation(id)
      .then((c) => {
        if (live) {
          setConsultation(c);
          setError("");
        }
      })
      .catch((e) => {
        if (live) {
          setConsultation(null);
          setError(e.message);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setConsultation(null);
        setError("Sua sessão expirou. Entre novamente para continuar.");
      }
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, [id, attempt]);
  async function login() {
    setBusy(true);
    setError("");
    try {
      const redirect = new URL("/anamnese", window.location.origin);
      redirect.searchParams.set("consulta", id);
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirect.href });
      if ("error" in result && result.error)
        throw new Error("Não foi possível entrar com Google. Tente novamente.");
      if ("redirected" in result && result.redirected) return;
      setAttempt((a) => a + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }
  if (consultation) return <AnamnesisForm consultation={consultation} />;
  return (
    <main className="mx-auto max-w-lg space-y-5 p-8">
      <h1 className="font-serif text-3xl">Anamnese da consulta</h1>
      <p>
        Entre com a conta Google do e-mail informado à clínica. Este acesso permite preencher apenas
        as consultas destinadas a você.
      </p>
      {error ? <p role="alert">{error}</p> : <p>Verificando convite…</p>}
      <button
        className="rounded bg-foreground px-5 py-3 text-background"
        disabled={busy}
        onClick={() => void login()}
      >
        {busy ? "Entrando…" : "Entrar com Google"}
      </button>
      <button
        className="block underline"
        disabled={busy}
        onClick={async () => {
          const { error } = await supabase.auth.signOut({ scope: "local" });
          if (error) setError("Não foi possível sair. Tente novamente.");
          else setAttempt((a) => a + 1);
        }}
      >
        Sair para trocar de conta
      </button>
      <button className="block underline" onClick={() => setAttempt((a) => a + 1)}>
        Verificar novamente
      </button>
    </main>
  );
}
function AnamnesisForm({ consultation }: { consultation?: Consultation }) {
  const draftKey = consultation ? `bioreport-anamnesis-${consultation.id}` : null;
  const submissionId = useRef<string | null>(null);
  const [answers, setAnswers] = useState<AnamnesisAnswers>(() => {
    const initial: AnamnesisAnswers = {
      ...emptyAnamnesis(),
      ...(consultation
        ? {
            patientName: consultation.patient_name,
            consultationDate: consultation.consultation_date,
          }
        : {}),
    };
    if (draftKey) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
        if (z.uuid().safeParse(saved?.submissionId).success)
          submissionId.current = saved.submissionId;
        if (saved?.answers)
          for (const key of Object.keys(initial))
            if (typeof saved.answers[key] === "string") initial[key] = saved.answers[key];
      } catch {
        /* A blocked browser storage must not block filling. */
      }
    }
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [remoteSaved, setRemoteSaved] = useState(false);
  useEffect(() => {
    if (draftKey && !remoteSaved) {
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ answers, submissionId: submissionId.current }),
        );
      } catch {
        /* Filling remains available without storage. */
      }
    }
  }, [draftKey, answers, remoteSaved]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>("fill");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const [confirmedAt, setConfirmedAt] = useState("");
  const [validated, setValidated] = useState<AnamnesisAnswers | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  const dirty = !remoteSaved && Object.values(answers).some(Boolean);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  useEffect(() => {
    if (step !== "fill") heading.current?.focus();
  }, [step]);
  const visibleRequired = anamnesisFields.filter(
    (field) => field.required && isFieldVisible(field, answers),
  );
  const filled = visibleRequired.filter((field) => answers[field.id]?.trim()).length;
  function change(id: string, value: string) {
    const next = updateAnswer(answers, id, value);
    setAnswers(next);
    setErrors((current) =>
      Object.fromEntries(
        Object.entries(current).filter(
          ([key]) =>
            key !== id &&
            isFieldVisible(
              anamnesisFields.find((field) => field.id === key)!,
              next,
            ),
        ),
      ),
    );
    setAccepted(false);
  }
  function review(event: FormEvent) {
    event.preventDefault();
    const result = anamnesisSchema.safeParse(answers);
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          result.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      requestAnimationFrame(() => errorSummary.current?.focus());
      return;
    }
    setErrors({});
    setValidated(result.data);
    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function edit() {
    if (saving) return;
    setRemoteSaved(false);
    submissionId.current = null;
    setStep("fill");
    setAccepted(false);
    setConfirmationError("");
    setConfirmedAt("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    const result = confirmationSchema.safeParse({ name, accepted });
    if (!result.success) {
      setConfirmationError(
        [...new Set(result.error.issues.map((issue) => issue.message))].join(" "),
      );
      return;
    }
    setSaving(true);
    setConfirmationError("");
    try {
      if (consultation) {
        submissionId.current ??= crypto.randomUUID();
        try {
          sessionStorage.setItem(
            draftKey!,
            JSON.stringify({ answers, submissionId: submissionId.current }),
          );
        } catch {
          /* Retry remains possible in this page. */
        }
        const saved = await submitAnamnesis({
          id: submissionId.current,
          consultationId: consultation.id,
          answers: validated,
          name: result.data.name,
          accepted: true,
        });
        setConfirmedAt(saved.confirmed_at);
        setRemoteSaved(true);
        try {
          sessionStorage.removeItem(draftKey!);
        } catch {
          /* The saved server record is already confirmed. */
        }
      } else setConfirmedAt(new Date().toISOString());
    } catch (error) {
      setConfirmationError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. Suas respostas foram preservadas.",
      );
      return;
    } finally {
      setSaving(false);
    }
    setName(result.data.name);
    setStep("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="anamnesis">
      <div className="ana-topbar ana-no-print">
        <a href="/" aria-label="Voltar ao início do BioReport">
          <span className="ana-monogram">JF</span>
          <span>BioReport Studio</span>
        </a>
        <span>
          {consultation ? `Consulta de ${consultation.patient_name}` : "Área do paciente"}
        </span>
      </div>
      <main className="ana-page">
        <header className="ana-header">
          <div>
            <p className="ana-eyebrow">Dr. João Falcão</p>
            <h1>Anamnese — Paciente</h1>
            <p className="ana-brandline">Estética Avançada • Emagrecimento • Alta Performance</p>
          </div>
          <div className="ana-badge">
            <ClipboardCheck size={20} aria-hidden="true" />
            <span>
              Documento clínico
              <br />
              Pré-consulta
            </span>
          </div>
        </header>
        <div className="ana-intro ana-no-print">
          <div>
            <p className="ana-eyebrow">Um cuidado que começa com você</p>
            <h2 ref={heading} tabIndex={-1}>
              {step === "fill"
                ? "Vamos conhecer você melhor."
                : step === "review"
                  ? "Confira suas respostas com calma."
                  : "Seu preenchimento está concluído."}
            </h2>
            <p>
              {step === "fill"
                ? "Reserve alguns minutos para contar sobre sua saúde e rotina. Os campos com * são obrigatórios; os demais são opcionais."
                : step === "review"
                  ? "Revise as informações abaixo. Se precisar, volte para corrigir antes de confirmar."
                  : "Imprima ou salve sua cópia em PDF para apresentar na consulta."}
            </p>
          </div>
          <ol className="ana-steps" aria-label="Etapas do formulário">
            {["Preencher", "Revisar", "Concluir"].map((label, index) => (
              <li
                key={label}
                aria-current={
                  index === ["fill", "review", "done"].indexOf(step) ? "step" : undefined
                }
              >
                <span>
                  {index < ["fill", "review", "done"].indexOf(step) ? (
                    <Check size={15} />
                  ) : (
                    index + 1
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <aside className="ana-notice ana-no-print">
          <ShieldCheck size={20} aria-hidden="true" />
          <p>
            {consultation ? (
              <>
                <strong>Anamnese vinculada à consulta.</strong> Suas respostas serão enviadas à
                clínica somente após confirmar. Enquanto preenche, um rascunho fica nesta aba para
                retomar após o login.
              </>
            ) : (
              <>
                <strong>Suas respostas ficam nesta página.</strong> Para enviar à clínica, abra o
                link individual da sua consulta. Neste formulário avulso, você pode preencher e
                salvar uma cópia em PDF.
              </>
            )}
          </p>
        </aside>
        {step === "fill" ? (
          <form noValidate onSubmit={review}>
            <div className="ana-progress ana-no-print">
              <span>Campos obrigatórios preenchidos</span>
              <strong>
                {filled} de {visibleRequired.length}
              </strong>
              <progress
                aria-label="Campos obrigatórios preenchidos"
                value={filled}
                max={visibleRequired.length}
              />
            </div>
            {Object.keys(errors).length > 0 && (
              <div className="ana-errors" role="alert" ref={errorSummary} tabIndex={-1}>
                <strong>Revise os campos indicados para continuar.</strong>
                <ul>
                  {anamnesisFields
                    .filter((field) => errors[field.id])
                    .map((field) => (
                      <li key={field.id}>
                        <a
                          href={`#field-${field.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            const element = document.getElementById(`field-${field.id}`);
                            element?.scrollIntoView({ block: "center", behavior: "smooth" });
                            (element?.querySelector("input") ?? element)?.focus();
                          }}
                        >
                          {field.label}: {errors[field.id]}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            )}
            {anamnesisSections.map((section, index) => (
              <section
                className="ana-section"
                key={section.title}
                aria-labelledby={`section-${index}`}
              >
                <div className="ana-section-title">
                  <h2 id={`section-${index}`}>
                    <span className="ana-section-number">{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </h2>
                  <span>{section.subtitle}</span>
                </div>
                <div className="ana-section-body">
                  {section.note && <p className="ana-clinical-note">{section.note}</p>}
                  <div className="ana-grid">
                    {section.fields
                      .filter((field) => isFieldVisible(field, answers))
                      .map((field) => (
                        <AnswerField
                          key={field.id}
                          field={field}
                          value={answers[field.id]}
                          error={errors[field.id]}
                          onChange={(value) => change(field.id, value)}
                        />
                      ))}
                  </div>
                </div>
              </section>
            ))}
            <section className="ana-section">
              <div className="ana-section-title">
                <h2>
                  <span className="ana-section-number">08</span>Confirmação do Paciente
                </h2>
                <span>Declaração</span>
              </div>
              <div className="ana-section-body">
                <p>{patientDeclaration}</p>
                <p className="ana-hint">
                  Você confirmará esta declaração depois de revisar suas respostas.
                </p>
              </div>
            </section>
            <div className="ana-actions ana-no-print">
              <p>Você poderá revisar tudo antes de concluir.</p>
              <button type="submit" className="ana-button">
                Revisar anamnese <ArrowRight size={18} />
              </button>
            </div>
          </form>
        ) : (
          <>
            {step === "done" && (
              <div className="ana-success ana-no-print" role="status">
                <CheckCircle2 aria-hidden="true" />
                <div>
                  <strong>
                    {remoteSaved
                      ? "Anamnese salva na consulta"
                      : "Anamnese confirmada neste dispositivo"}
                  </strong>
                  <p>
                    {remoteSaved
                      ? "A clínica já pode consultar suas respostas. Você também pode guardar uma cópia."
                      : "As respostas ainda não foram enviadas à clínica. Use Imprimir / salvar PDF para guardar uma cópia."}
                  </p>
                </div>
              </div>
            )}
            {anamnesisSections.map((section, index) => (
              <section className="ana-section" key={section.title}>
                <div className="ana-section-title">
                  <h2>
                    <span className="ana-section-number">{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </h2>
                  <span>{section.subtitle}</span>
                </div>
                <dl className="ana-section-body ana-review-grid">
                  {section.fields
                    .filter((field) => isFieldVisible(field, answers))
                    .map((field) => (
                      <div
                        key={field.id}
                        className={field.wide || field.kind === "textarea" ? "ana-wide" : undefined}
                      >
                        <dt>{field.label}</dt>
                        <dd>{formatAnswer(field, validated?.[field.id] ?? "")}</dd>
                      </div>
                    ))}
                </dl>
              </section>
            ))}
            <section className="ana-section">
              <div className="ana-section-title">
                <h2>
                  <span className="ana-section-number">08</span>Confirmação do Paciente
                </h2>
                <span>Declaração</span>
              </div>
              <div className="ana-section-body">
                <p className="ana-clinical-note">{patientDeclaration}</p>
                {step === "review" ? (
                  <form noValidate onSubmit={confirm}>
                    <label className="ana-label" htmlFor="confirmation-name">
                      Nome completo de quem confirma *
                    </label>
                    <input
                      id="confirmation-name"
                      className="ana-input"
                      value={name}
                      required
                      disabled={saving}
                      maxLength={150}
                      onChange={(event) => {
                        setName(event.target.value);
                        setConfirmationError("");
                      }}
                      aria-describedby="confirmation-hint confirmation-error"
                    />
                    <p className="ana-hint" id="confirmation-hint">
                      Paciente ou responsável pelo preenchimento.
                    </p>
                    <label className="ana-declaration">
                      <input
                        type="checkbox"
                        disabled={saving}
                        checked={accepted}
                        required
                        onChange={(event) => {
                          setAccepted(event.target.checked);
                          setConfirmationError("");
                        }}
                      />
                      <span>Li minhas respostas e confirmo a declaração acima. *</span>
                    </label>
                    <p
                      id="confirmation-error"
                      role={confirmationError ? "alert" : undefined}
                      className="ana-error"
                    >
                      {confirmationError}
                    </p>
                    {confirmationError && consultation && (
                      <button
                        type="button"
                        className="ana-button ana-secondary"
                        disabled={saving}
                        onClick={() => window.location.reload()}
                      >
                        Entrar novamente / verificar acesso
                      </button>
                    )}
                    <div className="ana-actions ana-no-print">
                      <button
                        type="button"
                        className="ana-button ana-secondary"
                        disabled={saving}
                        onClick={edit}
                      >
                        <ArrowLeft size={18} /> Corrigir respostas
                      </button>
                      <button type="submit" className="ana-button" disabled={saving}>
                        {saving
                          ? "Salvando…"
                          : consultation
                            ? "Confirmar e enviar à clínica"
                            : "Confirmar e concluir"}{" "}
                        <Check size={18} />
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="ana-signature">
                    <div>
                      <span>Confirmado por</span>
                      <strong>{name}</strong>
                    </div>
                    <div>
                      <span>Data da confirmação</span>
                      <strong>{new Date(confirmedAt).toLocaleString("pt-BR")}</strong>
                    </div>
                    <p>
                      {remoteSaved
                        ? "Declaração confirmada e registrada na consulta."
                        : "Declaração confirmada pelo preenchente. Cópia local — sem envio à clínica."}
                    </p>
                  </div>
                )}
              </div>
            </section>
            {step === "done" && (
              <div className="ana-actions ana-no-print">
                <button
                  type="button"
                  className="ana-button ana-secondary"
                  disabled={saving}
                  onClick={edit}
                >
                  <ArrowLeft size={18} /> Editar respostas
                </button>
                <button type="button" className="ana-button" onClick={() => window.print()}>
                  <Printer size={18} /> Imprimir / salvar PDF
                </button>
              </div>
            )}
          </>
        )}
        <footer className="ana-footer">
          Dr. João Falcão<span>Harmonização Corporal • Emagrecimento • Alta Performance</span>
        </footer>
      </main>
    </div>
  );
}

function AnswerField({
  field,
  value,
  error,
  onChange,
}: {
  field: IntakeField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = `field-${field.id}`;
  const description =
    `${field.hint ? `${id}-hint ` : ""}${error ? `${id}-error` : ""}`.trim() || undefined;
  const label = (
    <>
      {field.label}
      {field.required && (
        <span className="ana-required" aria-hidden="true">
          {" "}
          *
        </span>
      )}
    </>
  );
  const common = {
    id,
    name: field.id,
    value,
    required: field.required,
    "aria-invalid": !!error,
    "aria-describedby": description,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(event.target.value),
  };
  return (
    <div
      className={`ana-field ${field.wide || field.kind === "textarea" ? "ana-wide" : ""} ${field.when ? "ana-conditional" : ""}`}
    >
      {field.kind === "choice" ? (
        <fieldset id={id} aria-describedby={description} aria-invalid={!!error}>
          <legend className="ana-label">{label}</legend>
          <div className="ana-options">
            {field.options?.map((option) => (
              <label
                key={option}
                className={value === option ? "ana-option ana-selected" : "ana-option"}
              >
                <input
                  type="radio"
                  name={field.id}
                  value={option}
                  checked={value === option}
                  required={field.required}
                  onChange={() => onChange(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <>
          <label className="ana-label" htmlFor={id}>
            {label}
          </label>
          {field.kind === "textarea" ? (
            <textarea
              {...common}
              className="ana-input ana-textarea"
              maxLength={field.max ?? 2000}
              rows={3}
            />
          ) : (
            <input
              {...common}
              className="ana-input"
              type={field.kind === "number" ? "text" : (field.kind ?? "text")}
              inputMode={
                field.kind === "number" ? (field.step === 1 ? "numeric" : "decimal") : undefined
              }
              maxLength={field.kind === "number" ? 10 : (field.max ?? 2000)}
              autoComplete={field.id === "patientName" ? "name" : "off"}
            />
          )}
        </>
      )}
      {field.hint && (
        <p id={`${id}-hint`} className="ana-hint">
          {field.hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ana-error">
          {error}
        </p>
      )}
    </div>
  );
}
