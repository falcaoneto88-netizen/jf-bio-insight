import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { BrandHeader } from "@/components/BrandHeader";
import { JourneyStepper } from "@/components/jornada/JourneyStepper";
import { StepAnamnese } from "@/components/jornada/StepAnamnese";
import { StepAprovacao } from "@/components/jornada/StepAprovacao";
import { StepBio } from "@/components/jornada/StepBio";
import { StepHtml } from "@/components/jornada/StepHtml";
import { StepProtocolo } from "@/components/jornada/StepProtocolo";
import { StepRevisao } from "@/components/jornada/StepRevisao";
import { Button } from "@/components/ui/button";
import {
  abrirAnaliseDaConsulta,
  guardarJornada,
  obterJornada,
  previewHtml,
} from "@/lib/journey.functions";
import { prepareConsultation } from "@/lib/consultations/api";
import {
  JOURNEY_STEPS,
  emptyProtocolo,
  type Anamnese,
  type Bio,
  type Journey,
  type JourneyStep,
  type Protocolo,
} from "@/lib/journey/types";

export const Route = createFileRoute("/_authenticated/jornada/$id")({
  head: () => ({
    meta: [
      { title: "Atendimento — Jornada clínica Dr. João Falcão" },
      {
        name: "description",
        content:
          "Conduza o atendimento por anamnese, bioimpedância, revisão, protocolo, aprovação e documento final.",
      },
      { property: "og:title", content: "Atendimento — Jornada clínica Dr. João Falcão" },
      { property: "og:description", content: "Etapas do atendimento clínico." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JornadaDetailPage,
});

function statusToStep(journey: Journey): JourneyStep {
  if (journey.approvedVersion === journey.version) return 6;
  if (journey.protocolo && journey.protocolo.sections.length > 0) return 5;
  if (journey.confirmations.revisao) return 4;
  if (journey.confirmations.bio) return 3;
  if (journey.confirmations.anamnese) return 2;
  return 1;
}

function JornadaDetailPage() {
  const { id } = useParams({ from: "/_authenticated/jornada/$id" });
  // key={id}: mudar de paciente recria o estado interno por completo — nunca
  // sobra rascunho, etapa ou pré-visualização do atendimento anterior.
  return <JornadaDetail key={id} id={id} />;
}

function JornadaDetail({ id }: { id: string }) {
  const obter = useServerFn(obterJornada);
  const guardar = useServerFn(guardarJornada);
  const preview = useServerFn(previewHtml);
  const atualizar = useServerFn(abrirAnaliseDaConsulta);

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["jornada", id],
    queryFn: () => obter({ data: { id } }),
  });

  const journey = data?.jornada;
  const issues = data?.issues ?? { blocking: [], warnings: [] };

  const [step, setStep] = useState<JourneyStep>(1);
  const [anamnese, setAnamnese] = useState<Anamnese | null>(null);
  const [bio, setBio] = useState<Bio | null>(null);
  const [protocolo, setProtocolo] = useState<Protocolo | null>(null);
  const [saving, setSaving] = useState(false);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [initialised, setInitialised] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [htmlHash, setHtmlHash] = useState<string | null>(null);
  const [htmlVersion, setHtmlVersion] = useState<number | null>(null);
  const [htmlError, setHtmlError] = useState<string | null>(null);
  async function refreshFromConsultation() {
    if (!journey?.consultationId || saving) return;
    if (
      !window.confirm(
        "Atualizar a análise com os dados salvos na consulta? Os ajustes desta análise serão substituídos, o protocolo voltará a rascunho e será necessária nova revisão. As aprovações anteriores serão preservadas.",
      )
    )
      return;
    setSaving(true);
    try {
      await prepareConsultation(journey.consultationId);
      const result = await atualizar({
        data: {
          consultationId: journey.consultationId,
          refresh: { id, expectedVersion: journey.version },
        },
      });
      setDraftVersion(result.jornada.version);
      setAnamnese(result.jornada.anamnese);
      setBio(result.jornada.bio);
      setProtocolo(result.jornada.protocolo ?? emptyProtocolo);
      setHtml(null);
      setHtmlHash(null);
      setHtmlVersion(null);
      setStep(1);
      await refetch();
      toast.success("Dados da consulta carregados. Confira e confirme a revisão.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!journey || initialised) return;
    setDraftVersion(journey.version);
    setAnamnese(journey.anamnese);
    setBio(journey.bio);
    setProtocolo(journey.protocolo ?? emptyProtocolo);
    setStep(statusToStep(journey));
    setInitialised(true);
  }, [journey, initialised]);

  const maxReached = useMemo<JourneyStep>(() => {
    if (!journey) return 1;
    const natural = statusToStep(journey);
    return Math.max(natural, step) as JourneyStep;
  }, [journey, step]);

  const journeyVersion = journey?.version ?? null;

  useEffect(() => {
    if (step !== 5 || journeyVersion == null) return;
    let active = true;
    // Trocar de versão limpa a prévia: nunca se aprova um documento antigo.
    setHtml(null);
    setHtmlHash(null);
    setHtmlVersion(null);
    setHtmlError(null);
    void preview({ data: { id, tipo: "candidate" } })
      .then((result) => {
        if (!active) return; // resultado de pedido anterior é descartado
        if (result.html && result.htmlHash) {
          setHtml(result.html);
          setHtmlHash(result.htmlHash);
          setHtmlVersion(result.version);
        } else {
          setHtmlError(result.error ?? "Não foi possível preparar o documento.");
        }
      })
      .catch((err: unknown) => {
        if (active) setHtmlError((err as Error).message);
      });
    return () => {
      active = false;
    };
  }, [step, journeyVersion, id, preview]);

  const save = async (
    patch: Parameters<typeof guardarJornada>[0] extends never ? never : Record<string, unknown>,
  ) => {
    if (!journey) return false;
    setSaving(true);
    try {
      const result = await guardar({
        data: { id, expectedVersion: draftVersion, ...patch } as never,
      });
      setDraftVersion(result.jornada.version);
      await refetch();
      return true;
    } catch (err) {
      toast.error((err as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  if (isPending) {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">A carregar atendimento…</p>
      </Shell>
    );
  }

  if (isError || !journey || !anamnese || !bio) {
    return (
      <Shell>
        <p className="text-sm text-destructive">Não foi possível abrir este atendimento.</p>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
          <Button asChild variant="ghost">
            <Link to="/jornada">Voltar à lista</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  const currentLabel = JOURNEY_STEPS.find((s) => s.step === step)?.label ?? "";

  return (
    <Shell>
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" size="sm" className="self-start px-0 text-muted-foreground">
          <Link to="/consulta" search={{ id: journey.consultationId ?? undefined }}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Voltar à Consulta do paciente
          </Link>
        </Button>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paciente</p>
          <h1 className="font-serif text-3xl text-foreground">
            {journey.patientName || "Sem nome"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Etapa {step} de 6 · {currentLabel} · versão {journey.version}
            {journey.approvedVersion === journey.version ? " (aprovada)" : ""}
          </p>
        </div>
        {draftVersion !== journey.version && (
          <div role="alert" className="space-y-2 rounded border border-amber-500 p-4">
            <p>Esta análise foi alterada em outra janela. Seu rascunho local foi preservado.</p>
            <Button
              variant="outline"
              onClick={() => {
                if (
                  window.confirm(
                    "Descartar os ajustes locais e carregar a versão salva desta análise?",
                  )
                ) {
                  setAnamnese(journey.anamnese);
                  setBio(journey.bio);
                  setProtocolo(journey.protocolo ?? emptyProtocolo);
                  setDraftVersion(journey.version);
                  setStep(statusToStep(journey));
                }
              }}
            >
              Carregar versão salva
            </Button>
          </div>
        )}
        <JourneyStepper current={step} maxReached={maxReached} onSelect={setStep} />
        {journey.consultationId && (
          <aside
            className={`space-y-3 rounded border p-4 text-sm ${journey.sourceCurrent === false ? "border-amber-500 bg-amber-50 text-amber-950" : "border-gold/50 bg-gold-soft/20"}`}
          >
            <p role="status">
              {journey.sourceCurrent === false
                ? "A consulta recebeu novos dados. Atualize esta análise antes de salvar, gerar ou aprovar o protocolo."
                : "Anamnese e exame carregados da consulta. Revise as respostas existentes; o paciente não precisa preencher novamente."}
            </p>
            <p>
              Esta análise usa uma versão dos dados da consulta. Os ajustes feitos aqui compõem o
              protocolo; para corrigir a ficha e o PDF de bioimpedância, volte à consulta.
            </p>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void refreshFromConsultation()}
            >
              Atualizar com dados da consulta
            </Button>
          </aside>
        )}
      </div>

      <fieldset
        disabled={saving || journey.sourceCurrent === false || draftVersion !== journey.version}
        className="mt-8 min-w-0"
      >
        {step === 1 && (
          <StepAnamnese
            journey={journey}
            draft={anamnese}
            onDraftChange={setAnamnese}
            saving={saving}
            onSaveAndContinue={async () => {
              const ok = await save({
                anamnese,
                patientName: anamnese.header.paciente || journey.patientName,
                confirmations: { anamnese: true },
                status: "bio",
              });
              if (ok) setStep(2);
            }}
          />
        )}

        {step === 2 && (
          <StepBio
            journey={journey}
            draft={bio}
            onDraftChange={setBio}
            saving={saving}
            onBack={() => setStep(1)}
            onSaveAndContinue={async () => {
              const ok = await save({ bio, confirmations: { bio: true }, status: "revisao" });
              if (ok) setStep(3);
            }}
          />
        )}

        {step === 3 && (
          <StepRevisao
            journey={journey}
            issues={issues}
            saving={saving}
            onBack={() => setStep(2)}
            onConfirm={async () => {
              const ok = await save({ confirmations: { revisao: true }, status: "protocolo" });
              if (ok) setStep(4);
            }}
          />
        )}

        {step === 4 && (
          <StepProtocolo
            journey={journey}
            draft={protocolo ?? emptyProtocolo}
            onDraftChange={setProtocolo}
            saving={saving}
            onBack={() => setStep(3)}
            onRefresh={() => {
              void refetch().then((result) => {
                const updated = result.data?.jornada;
                if (!updated) return;
                setAnamnese(updated.anamnese);
                setBio(updated.bio);
                setProtocolo(updated.protocolo ?? emptyProtocolo);
                setDraftVersion(updated.version);
                setStep(statusToStep(updated));
              });
            }}
            onSave={() =>
              void save({ protocolo: protocolo ?? emptyProtocolo, status: "protocolo" })
            }
            onContinue={async () => {
              const ok = await save({
                protocolo: protocolo ?? emptyProtocolo,
                status: "protocolo",
              });
              if (ok) setStep(5);
            }}
          />
        )}

        {step === 5 && (
          <StepAprovacao
            journey={journey}
            issues={issues}
            html={html}
            htmlHash={htmlHash}
            htmlVersion={htmlVersion}
            htmlError={htmlError}
            onBack={() => setStep(4)}
            onApproved={async () => {
              await refetch();
              setStep(6);
            }}
          />
        )}

        {step === 6 && <StepHtml journey={journey} onBack={() => setStep(4)} />}
      </fieldset>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <BrandHeader />
      <main className="mx-auto w-full max-w-4xl px-6 py-10">{children}</main>
    </div>
  );
}
