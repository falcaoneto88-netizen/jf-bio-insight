import { Check, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { JOURNEY_STEPS, type JourneyStep } from "@/lib/journey/types";

export function JourneyStepper({
  current,
  maxReached,
  completedSteps,
  onSelect,
}: {
  current: JourneyStep;
  maxReached: JourneyStep;
  completedSteps: ReadonlySet<JourneyStep>;
  onSelect: (step: JourneyStep) => void;
}) {
  return (
    <nav aria-label="Etapas do atendimento" className="w-full">
      <ol className="clinical-steps">
        {JOURNEY_STEPS.map(({ step, label }) => {
          const isActive = step === current;
          const isDone = completedSteps.has(step);
          const reachable = step <= maxReached;
          const state = isDone
            ? step === 4
              ? "Rascunho salvo"
              : step === 5
                ? "Aprovada"
                : "Concluída"
            : reachable
              ? "A revisar"
              : "Não disponível";
          return (
            <li key={step} className="min-w-0">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(step)}
                aria-current={isActive ? "step" : undefined}
                className={cn("clinical-step", isActive && "is-active", isDone && "is-done")}
              >
                <span className="clinical-step-number" aria-hidden="true">
                  {isDone ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : !reachable ? (
                    <LockKeyhole className="h-3.5 w-3.5" />
                  ) : (
                    String(step).padStart(2, "0")
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-medium">{step === 6 ? "Documento" : label}</span>
                  <span className="clinical-step-state">{state}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
