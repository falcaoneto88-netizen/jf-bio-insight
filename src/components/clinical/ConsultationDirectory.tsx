import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CalendarDays, Search, X, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Consultation } from "@/lib/consultations/types";
import { filterConsultations } from "@/lib/consultations/search";

export function ConsultationDirectory({ items }: { items: Consultation[] }) {
  const [query, setQuery] = useState("");
  const visible = filterConsultations(items, query);
  return (
    <div className="clinical-directory">
      <div className="clinical-directory-toolbar">
        <label className="clinical-search">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="sr-only">Buscar nas consultas carregadas</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, e-mail ou data"
          />
        </label>
        {query && (
          <Button variant="ghost" size="sm" onClick={() => setQuery("")}>
            <X className="h-4 w-4" aria-hidden="true" />
            Limpar busca
          </Button>
        )}
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
          {query ? `${visible.length} de ${items.length}` : `${items.length}`} consulta(s)
          carregada(s)
        </p>
      </div>
      {visible.length ? (
        <ul className="divide-y divide-border">
          {visible.map((c) => (
            <li key={c.id}>
              <Link
                to="/consulta"
                search={{ id: c.id }}
                className="clinical-consultation-row"
                aria-label={`Retomar consulta de ${c.patient_name} em ${c.consultation_date.split("-").reverse().join("/")}`}
              >
                <span className="clinical-list-avatar" aria-hidden="true">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <strong className="block break-words font-medium text-foreground">
                    {c.patient_name}
                  </strong>
                  <span className="mt-1 block break-all text-xs text-muted-foreground">
                    {c.invite_email || "Preenchimento na clínica"}
                  </span>
                </div>
                <span className="clinical-row-date">
                  <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {c.consultation_date.split("-").reverse().join("/")}
                </span>
                <span className="clinical-row-action">
                  Retomar <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="p-8 text-center">
          <Search className="mx-auto mb-3 h-6 w-6 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">
            {items.length
              ? "Nenhuma consulta corresponde à busca"
              : "Sua lista de consultas começa aqui"}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {items.length
              ? "A busca considera somente as consultas carregadas. Tente outro nome ou data."
              : "Use Nova consulta para iniciar um atendimento."}
          </p>
        </div>
      )}
    </div>
  );
}
