import { useRef, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";

import { BrandHeader } from "@/components/BrandHeader";
import { Stepper } from "@/components/Stepper";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { extractBioimpedance } from "@/lib/bioimpedance.functions";
import { cn } from "@/lib/utils";
import { AccessNotice } from "@/components/AccessNotice";
import { useAdminSession } from "@/hooks/use-admin-session";
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

type Status = "idle" | "extracting" | "done" | "error";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function UploadPage() {
  const navigate = useNavigate();
  const { file, setFile, setBodyComposition } = useReportStore();
  const extract = useServerFn(extractBioimpedance);
  const session = useAdminSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [extractError, setExtractError] = useState<string | null>(null);

  const runExtraction = async (f: File) => {
    if (!session.loading && !session.isAdmin) {
      setExtractError(
        session.signedIn
          ? "Esta conta não tem permissão para a leitura automática do exame. Preencha os dados manualmente."
          : "Inicie sessão com a conta da clínica para a leitura automática do exame. Também pode preencher os dados manualmente.",
      );
      setStatus("error");
      return;
    }
    setStatus("extracting");
    setExtractError(null);
    try {
      const fileBase64 = await fileToBase64(f);
      const result = await extract({
        data: {
          fileBase64,
          mimeType: f.type as "application/pdf" | "image/png" | "image/jpeg",
          fileName: f.name,
        },
      });
      if (result.error || !result.data) {
        setExtractError(result.error ?? "Falha ao analisar o exame.");
        setStatus("error");
        return;
      }
      setBodyComposition(result.data);
      setStatus("done");
    } catch {
      console.error("[bioimpedance] falha na leitura automática");
      setExtractError(
        session.isAdmin
          ? "Erro inesperado ao analisar o exame."
          : "Sessão necessária para a leitura automática do exame. Inicie sessão ou preencha os dados manualmente.",
      );
      setStatus("error");
    }
  };

  const handleFile = (f: File | null) => {
    setError(null);
    setExtractError(null);
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
    void runExtraction(f);
  };

  const handleRemove = () => {
    setFile(null);
    setStatus("idle");
    setExtractError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const retry = () => {
    const current = inputRef.current?.files?.[0];
    if (current) void runExtraction(current);
    else inputRef.current?.click();
  };

  const continueDisabled = !file || status === "extracting";

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <BrandHeader />
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <Stepper current={1} />

          {!session.loading && !session.isAdmin && (
            <div className="mt-6">
              <AccessNotice
                signedIn={session.signedIn}
                proximo="/upload"
                descricao={
                  session.signedIn
                    ? "Esta conta não tem permissão clínica: a leitura automática do exame fica indisponível, mas pode preencher os dados manualmente."
                    : "Sem sessão iniciada a leitura automática do exame fica indisponível. Inicie sessão ou preencha os dados manualmente."
                }
              />
            </div>
          )}


          <Card className="mt-10 border-border/80">
            <CardHeader>
              <CardTitle className="font-serif text-2xl">Envio do exame</CardTitle>
              <CardDescription>
                Adicione o exame de bioimpedância em PDF, PNG ou JPG (até 10 MB). A IA lerá os
                dados automaticamente.
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
                <div className="space-y-3">
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
                      onClick={handleRemove}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      aria-label="Remover arquivo"
                      disabled={status === "extracting"}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {status === "extracting" && (
                    <div className="flex items-center gap-3 rounded-md border border-gold/40 bg-gold-soft/20 px-4 py-3 text-sm text-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-gold" />
                      <span>Analisando o exame com IA…</span>
                    </div>
                  )}

                  {status === "done" && (
                    <div className="flex items-center gap-3 rounded-md border border-success/40 bg-success-soft/40 px-4 py-3 text-sm text-foreground">
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span>Dados extraídos. Revise na próxima etapa.</span>
                    </div>
                  )}

                  {status === "error" && (
                    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-foreground">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                        <p>{extractError}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button type="button" size="sm" variant="outline" onClick={retry}>
                          <Sparkles className="h-3.5 w-3.5" />
                          Tentar novamente
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate({ to: "/body-composition" })}
                        >
                          Continuar mesmo assim
                        </Button>
                      </div>
                    </div>
                  )}
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
              disabled={continueDisabled}
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
