import { useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { aprovarJornada } from "@/lib/journey.functions";
import type { Journey } from "@/lib/journey/types";

export function StepAprovacao({
  journey,
  issues,
  html,
  htmlError,
  onApproved,
  onBack,
}: {
  journey: Journey;
  issues: { blocking: string[]; warnings: string[] };
  html: string | null;
  htmlError: string | null;
  onApproved: () => void;
  onBack: () => void;
}) {
  const [confirmacao, setConfirmacao] = useState("");
  const [busy, setBusy] = useState(false);
  const aprovado = journey.approvedVersion === journey.version;

  const aprovar = async () => {
    setBusy(true);
    try {
      await aprovarJornada({
        data: {
          id: journey.id,
          expectedVersion: journey.version,
          expectedHash: journey.contentHash,
          confirmacao: "APROVAR",
        },
      });
      toast.success("Versão aprovada.");
      setConfirmacao("");
      onApproved();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Pré-visualização exata</CardTitle>
          <CardDescription>
            Este é o conteúdo que será entregue. Versão {journey.version}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {htmlError ? (
            <p className="text-sm text-destructive">{htmlError}</p>
          ) : html ? (
            <iframe
              title="Pré-visualização do protocolo"
              sandbox=""
              srcDoc={html}
              className="h-[70vh] w-full rounded-md border border-border bg-white"
            />
          ) : (
            <p className="text-sm text-muted-foreground">A preparar a pré-visualização…</p>
          )}
        </CardContent>
      </Card>

      {(issues.blocking.length > 0 || issues.warnings.length > 0 || (journey.protocolo?.pendencias.length ?? 0) > 0) && (
        <Card className={issues.blocking.length ? "border-destructive/60" : "border-gold/60"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-serif text-lg">
              <AlertTriangle className="h-4 w-4" /> Pendências (só para si)
            </CardTitle>
            <CardDescription>Este painel nunca faz parte do documento.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {issues.blocking.map((b, i) => (
              <p key={`b${i}`} className="text-destructive">
                • {b}
              </p>
            ))}
            {issues.warnings.map((w, i) => (
              <p key={`w${i}`}>• {w}</p>
            ))}
            {(journey.protocolo?.pendencias ?? []).map((p, i) => (
              <p key={`p${i}`}>• {p}</p>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-serif text-xl">
            <ShieldCheck className="h-5 w-5 text-gold" /> Aprovação
          </CardTitle>
          <CardDescription>
            {aprovado
              ? `Versão ${journey.version} aprovada. Qualquer edição posterior anula esta aprovação.`
              : "Escreva APROVAR para confirmar que reviu este conteúdo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!aprovado && (
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="confirmar" className="text-xs text-muted-foreground">
                Confirmação
              </Label>
              <Input
                id="confirmar"
                value={confirmacao}
                placeholder="APROVAR"
                onChange={(e) => setConfirmacao(e.target.value.toUpperCase())}
              />
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <Button variant="ghost" onClick={onBack}>
              Voltar para editar
            </Button>
            <Button
              size="lg"
              onClick={aprovar}
              disabled={busy || aprovado || confirmacao !== "APROVAR" || issues.blocking.length > 0}
            >
              {aprovado ? "Versão aprovada" : busy ? "A aprovar…" : "Aprovar esta versão"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
