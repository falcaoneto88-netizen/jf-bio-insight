import { Check } from "lucide-react";

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
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {JOURNEY_STEPS.map(({ step, label }) => {
          const isActive = step === current;
          const isDone = completedSteps.has(step);
          const reachable = step <= maxReached;
          return (
            <li key={step} className="flex min-w-0 items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(step)}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isActive && "border-primary bg-primary text-primary-foreground",
                  !isActive && isDone && "border-success/40 bg-success-soft/60 text-foreground",
                  !isActive && !isDone && "border-border text-muted-foreground",
                  !reachable && "cursor-not-allowed opacity-50",
                )}
              >
                <span
                  className="grid h-5 w-5 shrink-0 place-content-center rounded-full border border-current text-[10px]"
                  aria-hidden="true"
                >
                  {isDone ? <Check className="h-3 w-3" /> : step}
                </span>
                <span className="whitespace-nowrap">{label}</span>
                {isDone && <span className="sr-only"> — Concluída</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
