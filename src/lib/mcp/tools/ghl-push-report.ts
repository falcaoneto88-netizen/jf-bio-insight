import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ghlErrorMessage } from "@/lib/ghl/errors";

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
    "Adiciona o resumo como nota no GoHighLevel. Sem contactId, cria ou atualiza o contacto por email/telefone, incluindo nome e etiqueta bioreport. Requer confirmação explícita (confirm: true) e um contacto existente ou email/telefone do paciente.",
  inputSchema: {
    reportId: z
      .string({ error: "Indique um texto válido." })
      .trim()
      .uuid("Indique um UUID válido.")
      .describe("Identificador do relatório (list_reports)."),
    contactId: z
      .string({ error: "Indique um texto válido." })
      .trim()
      .min(1, "O valor é inferior ao mínimo permitido (1).")
      .max(128, "Use no máximo 128 caracteres.")
      .regex(/^[A-Za-z0-9_-]+$/, "Identificador de contacto inválido.")
      .optional()
      .describe("Id do contacto no GoHighLevel, se já conhecido."),
    email: z
      .string({ error: "Indique um texto válido." })
      .trim()
      .max(254, "Use no máximo 254 caracteres.")
      .email("Email inválido.")
      .optional()
      .describe("Email do paciente (se não houver contactId)."),
    phone: z
      .string({ error: "Indique um texto válido." })
      .trim()
      .regex(/^\+[1-9]\d{6,14}$/, "Use telefone internacional, por exemplo +5511999999999.")
      .optional()
      .describe("Telefone do paciente (se não houver contactId)."),
    confirm: z
      .literal(true, "Confirme o envio explicitamente com confirm: true.")
      .describe("Tem de ser true. Confirme com o utilizador antes de escrever no GoHighLevel."),
  },
  annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
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

    if (error)
      return {
        content: [{ type: "text", text: "Não foi possível consultar o relatório." }],
        isError: true,
      };
    if (!data)
      return { content: [{ type: "text", text: "Relatório não encontrado." }], isError: true };

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
      visceralFatLevel: str(bc["visceralFat"]),
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
      const message = ghlErrorMessage(err);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  },
});
