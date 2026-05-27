import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, FileText, ImageIcon, UploadCloud, X } from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useReportStore, type UploadedFile } from "@/store/report-store";

export const Route = createFileRoute("/upload")({
  head: () => ({
    meta: [
      { title: "Upload do exame — JF BioReport" },
      { name: "description", content: "Envie o exame de bioimpedância em PDF, PNG ou JPG." },
    ],
  }),
  component: UploadPage,
});

const ACCEPTED = ["application/pdf", "image/png", "image/jpeg"];
const MAX_SIZE = 10 * 1024 * 1024;

function UploadPage() {
  const navigate = useNavigate();
  const { file, setFile } = useReportStore();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (f: File | null) => {
    setError(null);
    if (!f) return;
    if (!ACCEPTED.includes(f.type)) {
      setError("Formato inválido. Envie PDF, PNG ou JPG.");
      return;
    }
    if (f.size > MAX_SIZE) {
      setError("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    const uploaded: UploadedFile = { name: f.name, size: f.size, type: f.type };
    setFile(uploaded);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <Stepper current={1} />

          <Card className="mt-10 border-border/80">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Envio do exame</CardTitle>
              <CardDescription>
                Adicione o exame de bioimpedância em PDF, PNG ou JPG (até 10 MB).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />

              {!file ? (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    handleFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                  className={cn(
                    "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-14 text-center transition-colors",
                    dragOver
                      ? "border-gold bg-gold-soft/30"
                      : "border-border hover:border-gold/60 hover:bg-muted/30",
                  )}
                >
                  <div className="grid h-12 w-12 place-content-center rounded-full border border-gold/40 text-gold">
                    <UploadCloud className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      Arraste o arquivo ou clique para selecionar
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      PDF, PNG ou JPG · até 10 MB
                    </p>
                  </div>
                </button>
              ) : (
                <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 place-content-center rounded-sm border border-gold/40 text-gold">
                      {file.type === "application/pdf" ? (
                        <FileText className="h-5 w-5" />
                      ) : (
                        <ImageIcon className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB · {file.type}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="Remover arquivo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>

          <div className="mt-8 flex items-center justify-between">
            <Button asChild variant="ghost">
              <Link to="/">
                <ArrowLeft />
                Voltar
              </Link>
            </Button>
            <Button
              disabled={!file}
              onClick={() => navigate({ to: "/body-composition" })}
            >
              Continuar
              <ArrowRight />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
