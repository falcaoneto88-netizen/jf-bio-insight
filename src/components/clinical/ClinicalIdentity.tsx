import type { ReactNode } from "react";
import { CalendarDays, UserRound } from "lucide-react";

/** Contexto persistente da consulta; nunca indica que o rascunho local foi salvo. */
export function ClinicalIdentity({
  name,
  date,
  heading = "h2",
  titleId,
  children,
  actions,
}: {
  name: string;
  date?: string;
  heading?: "h1" | "h2";
  titleId?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  const Heading = heading;
  return (
    <section className="clinical-identity clinical-enter" aria-label="Identificação do atendimento">
      <div className="clinical-avatar" aria-hidden="true">
        <UserRound className="h-6 w-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="clinical-eyebrow">Atendimento individual</p>
        <Heading
          id={titleId}
          className="mt-1 break-words font-serif text-2xl leading-tight sm:text-3xl"
        >
          {name || "Sem nome"}
        </Heading>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {date && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden="true" />
              {date}
            </span>
          )}
          {children}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </section>
  );
}
