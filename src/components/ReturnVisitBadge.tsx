import { RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { useReportStore } from "@/store/report-store";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function ReturnVisitBadge() {
  const previousExam = useReportStore((s) => s.previousExam);
  const clearPreviousExam = useReportStore((s) => s.clearPreviousExam);

  if (!previousExam) return null;

  const lastDate = previousExam.examDate || previousExam.generatedAt;

  return (
    <div className="mb-6 flex items-center justify-between gap-3 rounded-md border border-gold/50 bg-gold-soft/30 px-4 py-2.5 text-sm">
      <div className="flex items-center gap-2 text-foreground">
        <RefreshCw className="h-4 w-4 text-gold" />
        <span>
          <span className="font-medium">Consulta de retorno</span>
          <span className="text-muted-foreground">
            {" · "}último exame em {formatDate(lastDate)}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={() => {
          clearPreviousExam();
          toast.success("Modo retorno desativado");
        }}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
        Sair
      </button>
    </div>
  );
}
