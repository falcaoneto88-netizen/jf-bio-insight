import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { pushReportToGhl } from "@/lib/ghl.functions";
import type { ReportSummaryInput } from "@/lib/ghl-summary";

type Props = {
  name: string;
  email?: string;
  phone?: string;
  summary: ReportSummaryInput;
};

export function GhlPushButton({ name, email, phone, summary }: Props) {
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    setSending(true);
    try {
      await pushReportToGhl({ data: { name, email, phone, summary } });
      toast.success("Resumo enviado para o GoHighLevel");
    } catch (err) {
      const description = err instanceof Error ? err.message : undefined;
      toast.error("Falha ao enviar para o GoHighLevel", { description });
    } finally {
      setSending(false);
    }
  };

  const hasContact = Boolean(email?.trim() || phone?.trim());

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="lg" disabled={sending || !hasContact}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar para o GoHighLevel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Enviar resumo para o GoHighLevel?</AlertDialogTitle>
          <AlertDialogDescription>
            O contacto de {name} será criado ou atualizado e o resumo clínico do relatório
            ficará registado como nota. Nada é enviado sem esta confirmação.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => void handleSend()}>Confirmar envio</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
