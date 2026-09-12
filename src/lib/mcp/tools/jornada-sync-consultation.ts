import { defineTool } from "@lovable.dev/mcp-js";
import { requireAdminClient } from "../supabase";
import { syncInput } from "@/lib/jornada-events/core";

export default defineTool({
  name: "jornada_sync_consultation",
  title: "Registrar evento da consulta no Jornada AI",
  description:
    "Envia apenas o estado de uma anamnese confirmada ou relatório salvo ao Jornada AI. Confira o contato HighLevel e a consulta com o utilizador; exige confirm: true. Vincula os IDs e registra o evento, sem enviar mensagens nem mudar etapas. Não envia respostas clínicas ou conteúdo do relatório.",
  inputSchema: syncInput.shape,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (raw, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) return { content: [{ type: "text", text: access.message }], isError: true };
    const parsed = syncInput.safeParse(raw);
    if (!parsed.success)
      return {
        content: [
          {
            type: "text",
            text: "Confira os identificadores e confirme o vínculo e envio com confirm: true.",
          },
        ],
        isError: true,
      };
    const input = parsed.data;
    const { data: consultation, error } = await access.supabase
      .from("consultations")
      .select("id,patient_id")
      .eq("id", input.consultationId)
      .maybeSingle();
    if (error || !consultation)
      return {
        content: [{ type: "text", text: "Consulta não encontrada ou sem acesso." }],
        isError: true,
      };
    const isAnamnesis = input.eventType === "anamnese_recebida";
    const record = await access.supabase
      .from(isAnamnesis ? "anamnesis_submissions" : "reports")
      .select(
        isAnamnesis
          ? "id,consultation_id,confirmed_at,accepted"
          : "id,consultation_id,generated_at",
      )
      .eq("id", input.recordId)
      .eq("consultation_id", consultation.id)
      .maybeSingle();
    const row = record.data as unknown as {
      id: string;
      confirmed_at?: string;
      generated_at?: string;
      accepted?: boolean;
    } | null;
    if (record.error || !row || (isAnamnesis && row.accepted !== true))
      return {
        content: [
          {
            type: "text",
            text: "Registro confirmado não encontrado nesta consulta. Salve a anamnese ou o relatório antes de sincronizar.",
          },
        ],
        isError: true,
      };
    try {
      const { sendJornadaEvent } = await import("@/lib/jornada-events/client.server");
      const receipt = await sendJornadaEvent(input, {
        consultationId: consultation.id,
        patientId: consultation.patient_id,
        recordId: row.id,
        occurredAt: (isAnamnesis ? row.confirmed_at : row.generated_at) ?? "",
      });
      return {
        content: [
          {
            type: "text",
            text:
              receipt.status === "duplicate"
                ? "Este evento já foi recebido pelo Jornada AI. Nenhuma mensagem enviada."
                : "Evento recebido pelo Jornada AI. Nenhuma mensagem enviada.",
          },
        ],
        structuredContent: receipt,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Não foi possível sincronizar o evento.",
          },
        ],
        isError: true,
      };
    }
  },
});
