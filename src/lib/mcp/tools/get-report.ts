import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireAdminClient } from "../supabase";

export default defineTool({
  name: "get_report",
  title: "Detalhe do relatório",
  description:
    "Devolve um relatório pelo seu identificador. Use mode 'summary' (predefinido) para os indicadores principais ou 'full' para incluir toda a composição corporal e dados clínicos.",
  inputSchema: {
    id: z.string().trim().describe("Identificador do relatório (campo id de list_reports)."),
    mode: z
      .enum(["summary", "full"])
      .optional()
      .describe("'summary' devolve apenas os indicadores principais; 'full' devolve tudo."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, mode }, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) {
      return { content: [{ type: "text", text: access.message }], isError: true };
    }
    const supabase = access.supabase;
    const { data, error } = await supabase
      .from("reports")
      .select(
        "id, patient_name, exam_date, generated_at, main_goal, body_classification, pdf_file_name, body_composition, clinical_data",
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    if (!data) {
      return {
        content: [
          { type: "text", text: `Relatório não encontrado para o id "${id}". Use list_reports para obter ids válidos.` },
        ],
        isError: true,
      };
    }

    if ((mode ?? "summary") === "full") {
      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: { report: data },
      };
    }

    const row = data as unknown as {
      id: string;
      patient_name: string | null;
      exam_date: string | null;
      generated_at: string;
      main_goal: string | null;
      body_classification: string | null;
      body_composition: Record<string, unknown> | null;
    };
    const bc = row.body_composition ?? {};
    const report = {
      id: row.id,
      patient_name: row.patient_name,
      exam_date: row.exam_date,
      generated_at: row.generated_at,
      main_goal: row.main_goal,
      body_classification: row.body_classification,
      weight: bc["weight"] ?? null,
      body_fat_percentage: bc["bodyFatPercentage"] ?? null,
      skeletal_muscle_mass: bc["skeletalMuscleMass"] ?? null,
      visceral_fat_level: bc["visceralFatLevel"] ?? null,
      basal_metabolic_rate: bc["basalMetabolicRate"] ?? null,
      mode: "summary" as const,
      hint: "Use mode: 'full' para os dados clínicos completos.",
    };
    return {
      content: [{ type: "text", text: JSON.stringify(report) }],
      structuredContent: { report },
    };
  },
});
