import { useEffect, useRef, useState } from "react";
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
  const [erro, setErro] = useState<string | null>(null);

  /** Falso depois de desmontar: resposta tardia não toca no ecrã. */
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current += 1;
    };
  }, []);

  // Mudar de atendimento ou de versão descarta prévia e pedidos pendentes:
  // nunca se mostra ou descarrega o documento de outro paciente/versão.
  useEffect(() => {
    requestRef.current += 1;
    setPreview(null);
    setErro(null);
    setBusy(false);
  }, [journey.id, journey.version]);

  /** Devolve null quando o pedido ficou obsoleto ou falhou (erro já visível). */
  const fetchHtml = async (requestId: number) => {
    try {
      const result = await previewHtml({
        data: { id: journey.id, tipo: aprovado ? "final" : "draft" },
      });
      if (!mountedRef.current || requestId !== requestRef.current) return null;
      if (!result.html) {
        const msg = result.error ?? "Não foi possível gerar o HTML.";
        setErro(msg);
        toast.error(msg);
        return null;
      }
      setErro(null);
      return result;
    } catch (err) {
      if (mountedRef.current && requestId === requestRef.current) {
        const msg = (err as Error).message;
        setErro(msg);
        toast.error(msg);
      }
      return null;
    }
  };

  const run = async (action: (result: { html: string; fileName?: string | null }) => Promise<void> | void) => {
    const requestId = ++requestRef.current;
    setBusy(true);
    setErro(null);
    try {
      const result = await fetchHtml(requestId);
      if (!result?.html) return;
      if (!mountedRef.current || requestId !== requestRef.current) return;
      await action({ html: result.html, fileName: result.fileName });
    } finally {
      if (mountedRef.current && requestId === requestRef.current) setBusy(false);
    }
  };

  const baixar = () =>
    run(({ html, fileName }) => {
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName ?? "protocolo.html";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("HTML descarregado.");
    });

  const copiar = () =>
    run(async ({ html }) => {
      try {
        await navigator.clipboard.writeText(html);
        toast.success("HTML copiado.");
      } catch {
        const msg = "Não foi possível copiar. Use o download.";
        setErro(msg);
        toast.error(msg);
      }
    });

  const visualizar = () =>
    run(({ html }) => {
      setPreview(html);
    });

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
          <Button size="lg" onClick={() => void baixar()} disabled={busy}>
            <Download className="mr-1 h-4 w-4" /> Baixar HTML completo
          </Button>
          <Button variant="outline" onClick={() => void copiar()} disabled={busy}>
            <Copy className="mr-1 h-4 w-4" /> Copiar HTML
          </Button>
          <Button variant="outline" onClick={() => void visualizar()} disabled={busy}>
            <Eye className="mr-1 h-4 w-4" /> Visualizar
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Voltar para editar
          </Button>
        </CardContent>
      </Card>

      {erro && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{erro}</p>
          </CardContent>
        </Card>
      )}

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
