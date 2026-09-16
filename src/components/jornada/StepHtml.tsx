import { useEffect, useRef, useState } from "react";
import { Copy, Download, Eye, Printer } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { previewHtml } from "@/lib/journey.functions";
import { documentMatchesRequest, printHtmlDocument, sha256Text } from "@/lib/journey/print";
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
      frameRef.current?.remove();
      frameRef.current = null;
    };
  }, []);

  // Mudar de atendimento ou de versão descarta prévia e pedidos pendentes:
  // nunca se mostra ou descarrega o documento de outro paciente/versão.
  useEffect(() => {
    requestRef.current += 1;
    setPreview(null);
    setErro(null);
    setBusy(false);
    frameRef.current?.remove();
    frameRef.current = null;
  }, [journey.id, journey.version]);

  /** Iframe de impressão em curso: removido em troca de versão/paciente ou ao sair. */
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const dropFrame = () => {
    frameRef.current?.remove();
    frameRef.current = null;
  };

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
      // O documento tem de ser desta versão e deste conteúdo — não do anterior.
      const mismatch = documentMatchesRequest({
        requestedVersion: journey.version,
        requestedHash: journey.contentHash,
        result,
      });
      if (mismatch) {
        setErro(mismatch);
        toast.error(mismatch);
        return null;
      }
      // E os bytes entregues têm de corresponder ao hash que o servidor calculou.
      const hash = await sha256Text(result.html);
      if (!mountedRef.current || requestId !== requestRef.current) return null;
      if (hash && result.htmlHash && hash !== result.htmlHash) {
        const msg =
          "O documento recebido não corresponde ao seu identificador. Recarregue o atendimento antes de continuar.";
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

  const run = async (
    action: (result: { html: string; fileName?: string | null }) => Promise<void> | void,
  ) => {
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

  /**
   * Impressão nativa do MESMO HTML servido para esta versão — sem serviço externo
   * de PDF. O navegador não informa se o utilizador imprimiu ou cancelou, por isso
   * nada é dado como impresso.
   */
  const imprimir = () =>
    run(async ({ html }) => {
      const requestId = requestRef.current;
      dropFrame();
      const frame = document.createElement("iframe");
      frame.setAttribute("title", "Impressão do protocolo");
      frame.setAttribute("sandbox", "allow-same-origin allow-modals");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
      frameRef.current = frame;
      document.body.appendChild(frame);

      const isCurrent = () =>
        mountedRef.current && requestId === requestRef.current && frameRef.current === frame;

      const outcome = await printHtmlDocument(
        html,
        {
          load: (value) =>
            new Promise<void>((resolve, reject) => {
              frame.onload = () => resolve();
              frame.onerror = () => reject(new Error("falha ao carregar"));
              frame.srcdoc = value;
            }),
          waitReady: async (limitMs) => {
            const view = frame.contentWindow;
            const doc = frame.contentDocument;
            if (!view || !doc) return;
            const ready = Promise.all([
              doc.fonts?.ready ?? Promise.resolve(),
              ...[...doc.images].map((img) =>
                img.complete
                  ? Promise.resolve()
                  : new Promise<void>((resolve) => {
                      img.addEventListener("load", () => resolve(), { once: true });
                      img.addEventListener("error", () => resolve(), { once: true });
                    }),
              ),
            ]);
            await Promise.race([ready, new Promise((resolve) => setTimeout(resolve, limitMs))]);
          },
          print: () => {
            const view = frame.contentWindow;
            if (!view) throw new Error("sem janela");
            view.focus();
            view.print();
          },
          remove: () => {
            if (frameRef.current === frame) frameRef.current = null;
            frame.remove();
          },
        },
        isCurrent,
      );

      if (outcome === "stale") return;
      if (outcome === "blocked") {
        const msg =
          "O navegador bloqueou a impressão. Use «Visualizar» e imprima a página, ou baixe o HTML.";
        if (mountedRef.current) setErro(msg);
        toast.error(msg);
        return;
      }
      toast.message("Impressão pedida ao navegador.", {
        description:
          "Se a janela de impressão aparecer, escolha «Guardar como PDF». Se não aparecer, o navegador pode tê-la bloqueado: use «Visualizar» e imprima a página.",
      });
      setTimeout(() => {
        if (frameRef.current === frame) {
          frameRef.current = null;
          frame.remove();
        }
      }, 60_000);
    });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">HTML completo</CardTitle>
          <CardDescription>
            {aprovado
              ? `Entrega final da versão aprovada ${journey.approvedVersion}.`
              : "Sem aprovação em vigor: o ficheiro sai marcado como RASCUNHO."}{" "}
            Versão atual {journey.version} · identificador {journey.contentHash.slice(0, 12)}.
            Baixar, copiar e imprimir usam exatamente este documento.
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
          <Button variant="outline" onClick={() => void imprimir()} disabled={busy}>
            <Printer className="mr-1 h-4 w-4" /> Imprimir / Salvar PDF
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
