import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAdminClient } from "../supabase";

export default defineTool({
  name: "jornada_preview_consultation",
  title: "Preparar a sincronização da consulta",
  description:
    "Consulta os IDs e datas de até 10 anamneses confirmadas e 10 relatórios salvos de uma consulta. O consultationId aparece na URL da tela Consulta do paciente. Permite conferir o paciente e escolher recordId antes de jornada_sync_consultation. Não envia eventos ou mensagens.",
  inputSchema: { consultationId: z.uuid("Identificador da consulta inválido.") },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async ({ consultationId }, ctx) => {
    const access = await requireAdminClient(ctx);
    const fail = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
    if (!access.ok) return fail(access.message);
    if (!z.uuid().safeParse(consultationId).success)
      return fail("Identificador da consulta inválido.");
    const { data: consultation, error } = await access.supabase
      .from("consultations")
      .select("id,patient_id,patient_name,consultation_date")
      .eq("id", consultationId)
      .maybeSingle();
    if (error || !consultation) return fail("Consulta não encontrada ou sem acesso.");
    const [submissions, reports] = await Promise.all([
      access.supabase
        .from("anamnesis_submissions")
        .select("id,confirmed_at")
        .eq("consultation_id", consultationId)
        .eq("accepted", true)
        .order("confirmed_at", { ascending: false })
        .limit(11),
      access.supabase
        .from("reports")
        .select("id,generated_at")
        .eq("consultation_id", consultationId)
        .order("generated_at", { ascending: false })
        .limit(11),
    ]);
    if (submissions.error || reports.error)
      return fail("Não foi possível consultar os registros desta consulta.");
    const data = {
      consultation,
      anamneses: (submissions.data ?? []).slice(0, 10),
      reports: (reports.data ?? []).slice(0, 10),
      truncated: (submissions.data?.length ?? 0) > 10 || (reports.data?.length ?? 0) > 10,
      next_step:
        "Confira o paciente e o contato HighLevel com o utilizador antes de confirmar o envio.",
    };
    return { content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data };
  },
});
