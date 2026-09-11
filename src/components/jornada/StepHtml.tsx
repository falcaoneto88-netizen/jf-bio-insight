import { useState } from "react";
import { Copy, Download, Eye } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { previewHtml } from "@/lib/journey.functions";
import type { Journey } from "@/lib/journey/types";

export function StepHtml({ journey, onBack }: { journey: Journey; onBack: () => void }) {
  const aprovado = journey.approvedVersion === journey.version;
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchHtml = async () => {
    const result = await previewHtml({ data: { id: journey.id, tipo: aprovado ? "final" : "draft" } });
    if (!result.html) {
      toast.error(result.error ?? "Não foi possível gerar o HTML.");
      return null;
    }
    return result;
  };

  const baixar = async () => {
    setBusy(true);
    try {
      const result = await fetchHtml();
      if (!result?.html) return;
      const blob = new Blob([result.html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName ?? "protocolo.html";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("HTML descarregado.");
    } finally {
      setBusy(false);
    }
  };

  const copiar = async () => {
    setBusy(true);
    try {
      const result = await fetchHtml();
      if (!result?.html) return;
      await navigator.clipboard.writeText(result.html);
      toast.success("HTML copiado.");
    } catch {
      toast.error("Não foi possível copiar. Use o download.");
    } finally {
      setBusy(false);
    }
  };

  const visualizar = async () => {
    setBusy(true);
    try {
      const result = await fetchHtml();
      if (result?.html) setPreview(result.html);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">HTML completo</CardTitle>
          <CardDescription>
            {aprovado
              ? `Entrega final da versão aprovada ${journey.approvedVersion}.`
              : "Sem aprovação em vigor: o ficheiro sai marcado como RASCUNHO."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button size="lg" onClick={baixar} disabled={busy}>
            <Download className="mr-1 h-4 w-4" /> Baixar HTML completo
          </Button>
          <Button variant="outline" onClick={copiar} disabled={busy}>
            <Copy className="mr-1 h-4 w-4" /> Copiar HTML
          </Button>
          <Button variant="outline" onClick={visualizar} disabled={busy}>
            <Eye className="mr-1 h-4 w-4" /> Visualizar
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Voltar para editar
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-lg">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent>
            <iframe
              title="Documento"
              sandbox=""
              srcDoc={preview}
              className="h-[70vh] w-full rounded-md border border-border bg-white"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
