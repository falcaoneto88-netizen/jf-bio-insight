import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_report",
  title: "Detalhe do relatório",
  description:
    "Devolve um relatório completo pelo seu identificador, incluindo composição corporal e dados clínicos.",
  inputSchema: {
    id: z.string().trim().describe("Identificador do relatório (campo id de list_reports)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
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
      return { content: [{ type: "text", text: "Relatório não encontrado." }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { report: data },
    };
  },
});
