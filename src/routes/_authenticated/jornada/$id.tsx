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
import { guardarJornada, obterJornada, previewHtml } from "@/lib/journey.functions";
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
        content: "Conduza o atendimento por anamnese, bioimpedância, revisão, protocolo, aprovação e documento final.",
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
  const obter = useServerFn(obterJornada);
  const guardar = useServerFn(guardarJornada);
  const preview = useServerFn(previewHtml);

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
  const [initialised, setInitialised] = useState(false);
  const [html, setHtml] = useState<string | null>(null);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  useEffect(() => {
    if (!journey || initialised) return;
    setAnamnese(journey.anamnese);
    setBio(journey.bio);
    setProtocolo(journey.protocolo ?? emptyProtocolo);
    setStep(statusToStep(journey));
    setInitialised(true);
  }, [journey, initialised]);

  const maxReached = useMemo<JourneyStep>(() => {
    if (!journey) return 1;
    const natural = statusToStep(journey);
    return (Math.max(natural, step) as JourneyStep);
  }, [journey, step]);

  useEffect(() => {
    if (step !== 5 || !journey) return;
    let active = true;
    setHtml(null);
    setHtmlError(null);
    void preview({ data: { id, tipo: "draft" } }).then((result) => {
      if (!active) return;
      if (result.html) setHtml(result.html);
      else setHtmlError(result.error ?? "Não foi possível preparar a pré-visualização.");
    });
    return () => {
      active = false;
    };
  }, [step, journey?.version, id, preview, journey]);

  const save = async (patch: Parameters<typeof guardarJornada>[0] extends never ? never : Record<string, unknown>) => {
    if (!journey) return false;
    setSaving(true);
    try {
      await guardar({ data: { id, expectedVersion: journey.version, ...patch } as never });
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
    return <Shell><p className="text-sm text-muted-foreground">A carregar atendimento…</p></Shell>;
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
          <Link to="/jornada">
            <ArrowLeft className="mr-1 h-4 w-4" /> Todos os atendimentos
          </Link>
        </Button>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Paciente</p>
          <h1 className="font-serif text-3xl text-foreground">{journey.patientName || "Sem nome"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Etapa {step} de 6 · {currentLabel} · versão {journey.version}
            {journey.approvedVersion === journey.version ? " (aprovada)" : ""}
          </p>
        </div>
        <JourneyStepper current={step} maxReached={maxReached} onSelect={setStep} />
      </div>

      <div className="mt-8">
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
              setInitialised(false);
              void refetch();
            }}
            onSave={() => void save({ protocolo: protocolo ?? emptyProtocolo, status: "protocolo" })}
            onContinue={async () => {
              const ok = await save({ protocolo: protocolo ?? emptyProtocolo, status: "protocolo" });
              if (ok) setStep(5);
            }}
          />
        )}

        {step === 5 && (
          <StepAprovacao
            journey={journey}
            issues={issues}
            html={html}
            htmlError={htmlError}
            onBack={() => setStep(4)}
            onApproved={async () => {
              await refetch();
              setStep(6);
            }}
          />
        )}

        {step === 6 && <StepHtml journey={journey} onBack={() => setStep(4)} />}
      </div>
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
