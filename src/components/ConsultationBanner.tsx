import { Link } from "@tanstack/react-router";
import { useReportStore } from "@/store/report-store";
export function ConsultationBanner() {
  const c = useReportStore((s) => s.consultation);
  if (!c) return null;
  return (
    <aside className="my-5 flex flex-wrap items-center justify-between gap-3 rounded border border-gold/50 bg-gold-soft/20 p-4 text-sm">
      <span>
        Consulta de <strong>{c.patientName}</strong>
      </span>
      <Link to="/consulta" search={{ id: c.id }} className="underline">
        Anamnese · Bioimpedância · Relatório
      </Link>
    </aside>
  );
}
