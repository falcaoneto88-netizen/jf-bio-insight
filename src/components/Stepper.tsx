import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Upload" },
  { id: 2, label: "Bioimpedância" },
  { id: 3, label: "Dados complementares" },
  { id: 4, label: "Revisão" },
] as const;

export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <nav aria-label="Progresso" className="mx-auto w-full max-w-3xl">
      <ol className="flex items-center justify-between gap-2">
        {STEPS.map((step, idx) => {
          const isActive = step.id === current;
          const isDone = step.id < current;
          return (
            <li key={step.id} className="flex flex-1 items-center gap-2">
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-content-center rounded-full border text-xs font-medium transition-colors",
                    isActive && "border-gold bg-gold text-gold-foreground",
                    isDone && "border-foreground bg-foreground text-background",
                    !isActive && !isDone && "border-border text-muted-foreground",
                  )}
                >
                  {step.id}
                </span>
                <span
                  className={cn(
                    "hidden text-sm sm:inline",
                    isActive ? "text-foreground font-medium" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1 transition-colors",
                    isDone ? "bg-foreground" : "bg-border",
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
