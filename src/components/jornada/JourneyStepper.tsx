import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { JOURNEY_STEPS, type JourneyStep } from "@/lib/journey/types";

export function JourneyStepper({
  current,
  maxReached,
  onSelect,
}: {
  current: JourneyStep;
  maxReached: JourneyStep;
  onSelect: (step: JourneyStep) => void;
}) {
  return (
    <nav aria-label="Etapas do atendimento" className="w-full">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {JOURNEY_STEPS.map(({ step, label }) => {
          const isActive = step === current;
          const isDone = step < current;
          const reachable = step <= maxReached;
          return (
            <li key={step} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onSelect(step)}
                aria-current={isActive ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  isActive && "border-gold bg-gold text-gold-foreground",
                  !isActive && isDone && "border-foreground/30 text-foreground",
                  !isActive && !isDone && "border-border text-muted-foreground",
                  !reachable && "cursor-not-allowed opacity-50",
                )}
              >
                <span className="grid h-5 w-5 shrink-0 place-content-center rounded-full border border-current text-[10px]">
                  {isDone ? <Check className="h-3 w-3" /> : step}
                </span>
                <span className="whitespace-nowrap">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
