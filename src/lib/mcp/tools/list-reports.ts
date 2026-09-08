import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_reports",
  title: "Listar relatórios",
  description:
    "Lista os relatórios clínicos gerados, do mais recente para o mais antigo. Opcionalmente filtra por nome do paciente.",
  inputSchema: {
    patientName: z
      .string()
      .trim()
      .optional()
      .describe("Filtro parcial pelo nome do paciente."),
    limit: z.number().int().optional().describe("Número máximo de relatórios (1 a 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patientName, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 20, 1), 100);
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("reports")
      .select("id, patient_name, exam_date, generated_at, main_goal, body_classification")
      .order("generated_at", { ascending: false })
      .limit(take);
    if (patientName) query = query.ilike("patient_name", `%${patientName}%`);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { reports: data ?? [] },
    };
  },
});
