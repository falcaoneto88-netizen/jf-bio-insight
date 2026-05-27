import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { BrandHeader } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  clearReportHistory,
  getReportHistory,
  type ReportHistoryEntry,
} from "@/lib/report-history";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Histórico de relatórios — JF BioReport" },
      { name: "description", content: "Histórico de relatórios clínicos gerados." },
    ],
  }),
  component: HistoryPage,
});

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function HistoryPage() {
  const [entries, setEntries] = useState<ReportHistoryEntry[]>([]);

  useEffect(() => {
    setEntries(getReportHistory());
  }, []);

  const handleClear = () => {
    if (entries.length === 0) return;
    if (!window.confirm("Limpar todo o histórico de relatórios?")) return;
    clearReportHistory();
    setEntries([]);
    toast.success("Histórico limpo");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-4">
            <Button asChild variant="ghost" size="sm">
              <Link to="/">
                <ArrowLeft />
                Início
              </Link>
            </Button>
            {entries.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleClear}>
                <Trash2 className="h-4 w-4" />
                Limpar histórico
              </Button>
            )}
          </div>

          <div className="mt-8 mb-8 text-center">
            <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
              Histórico de relatórios
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Registros dos relatórios gerados neste dispositivo.
            </p>
          </div>

          {entries.length === 0 ? (
            <Card className="border-border/80">
              <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="grid h-12 w-12 place-content-center rounded-full border border-gold/40 text-gold">
                  <FileText className="h-5 w-5" />
                </div>
                <p className="font-serif text-lg text-foreground">
                  Nenhum relatório ainda
                </p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Os relatórios gerados aparecerão aqui automaticamente.
                </p>
                <Button asChild className="mt-2 bg-gold text-gold-foreground hover:bg-gold/90">
                  <Link to="/upload">Iniciar novo relatório</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/80">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Paciente</TableHead>
                        <TableHead>Data do exame</TableHead>
                        <TableHead>Geração</TableHead>
                        <TableHead>Objetivo</TableHead>
                        <TableHead>Classificação</TableHead>
                        <TableHead>Arquivo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="font-medium text-foreground">
                            {e.patientName || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {e.examDate || "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDateTime(e.generatedAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {e.mainGoal || "—"}
                          </TableCell>
                          <TableCell>
                            <span className="rounded-sm border border-gold/60 bg-gold/10 px-2 py-0.5 text-xs uppercase tracking-[0.12em] text-gold">
                              {e.bodyClassification || "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {e.pdfFileName || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
