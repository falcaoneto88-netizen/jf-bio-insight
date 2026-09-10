import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { buildReportNote } from "@/lib/ghl-summary";
import { requireAdminClient } from "../supabase";

type ReportRow = {
  patient_name: string | null;
  exam_date: string | null;
  main_goal: string | null;
  body_classification: string | null;
  body_composition: Record<string, unknown> | null;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}

export default defineTool({
  name: "ghl_push_report",
  title: "Enviar relatório para o GoHighLevel",
  description:
    "Envia o resumo de um relatório para o GoHighLevel como nota do contacto. Requer confirmação explícita (confirm: true) e um contacto existente ou email/telefone do paciente.",
  inputSchema: {
    reportId: z.string().trim().min(1).describe("Identificador do relatório (list_reports)."),
    contactId: z.string().trim().optional().describe("Id do contacto no GoHighLevel, se já conhecido."),
    email: z.string().trim().optional().describe("Email do paciente (se não houver contactId)."),
    phone: z.string().trim().optional().describe("Telefone do paciente (se não houver contactId)."),
    confirm: z
      .boolean()
      .describe("Tem de ser true. Confirme com o utilizador antes de escrever no GoHighLevel."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  handler: async ({ reportId, contactId, email, phone, confirm }, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) return { content: [{ type: "text", text: access.message }], isError: true };

    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: "Envio não confirmado. Peça confirmação ao utilizador e repita com confirm: true.",
          },
        ],
        isError: true,
      };
    }
    if (!contactId && !email && !phone) {
      return {
        content: [{ type: "text", text: "Indique contactId, email ou telefone do paciente." }],
        isError: true,
      };
    }

    const { data, error } = await access.supabase
      .from("reports")
      .select("patient_name, exam_date, main_goal, body_classification, body_composition")
      .eq("id", reportId)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Relatório não encontrado." }], isError: true };

    const row = data as unknown as ReportRow;
    const bc = row.body_composition ?? {};
    const name = row.patient_name?.trim() || "Paciente";
    const note = buildReportNote({
      patientName: name,
      examDate: row.exam_date,
      mainGoal: row.main_goal,
      bodyClassification: row.body_classification,
      weight: str(bc["weight"]),
      bodyFatPercentage: str(bc["bodyFatPercentage"]),
      skeletalMuscleMass: str(bc["skeletalMuscleMass"]),
      visceralFatLevel: str(bc["visceralFatLevel"]),
      basalMetabolicRate: str(bc["basalMetabolicRate"]),
    });

    try {
      const { upsertGhlContact, addGhlContactNote } = await import("@/lib/ghl/client.server");
      const targetId =
        contactId ?? (await upsertGhlContact({ name, email, phone, tags: ["bioreport"] })).id;
      await addGhlContactNote(targetId, note);
      return {
        content: [{ type: "text", text: `Resumo enviado para o contacto ${targetId}.` }],
        structuredContent: { contactId: targetId },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao contactar o GoHighLevel.";
      return { content: [{ type: "text", text: message }], isError: true };
    }
  },
});
