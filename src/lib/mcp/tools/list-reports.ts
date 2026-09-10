import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireAdminClient } from "../supabase";

export default defineTool({
  name: "list_reports",
  title: "Listar relatórios",
  description:
    "Lista os relatórios clínicos gerados, do mais recente para o mais antigo. Filtros opcionais por nome do paciente e intervalo de datas de geração.",
  inputSchema: {
    patientName: z
      .string()
      .trim()
      .optional()
      .describe("Filtro parcial pelo nome do paciente."),
    generatedAfter: z
      .string()
      .trim()
      .optional()
      .describe("Data ISO (AAAA-MM-DD): apenas relatórios gerados nesta data ou depois."),
    generatedBefore: z
      .string()
      .trim()
      .optional()
      .describe("Data ISO (AAAA-MM-DD): apenas relatórios gerados nesta data ou antes."),
    limit: z.number().int().optional().describe("Número máximo de relatórios (1 a 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patientName, generatedAfter, generatedBefore, limit }, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) {
      return { content: [{ type: "text", text: access.message }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 20, 1), 100);
    const supabase = access.supabase;
    let query = supabase
      .from("reports")
      .select("id, patient_name, exam_date, generated_at, main_goal, body_classification")
      .order("generated_at", { ascending: false })
      .limit(take);
    if (patientName) query = query.ilike("patient_name", `%${patientName}%`);
    if (generatedAfter) query = query.gte("generated_at", generatedAfter);
    if (generatedBefore) query = query.lte("generated_at", `${generatedBefore}T23:59:59.999Z`);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const reports = data ?? [];
    const truncated = reports.length === take;
    const result = {
      reports,
      count: reports.length,
      truncated,
      ...(truncated
        ? { notice: `Lista truncada em ${take} relatórios — refine os filtros ou aumente o limit.` }
        : {}),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
