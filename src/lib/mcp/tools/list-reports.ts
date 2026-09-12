import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { escapeLike } from "../evolution";

import { requireAdminClient } from "../supabase";

export default defineTool({
  name: "list_reports",
  title: "Listar relatórios",
  description:
    "Lista os relatórios clínicos gerados, do mais recente para o mais antigo. Filtros opcionais por nome do paciente e intervalo de datas de geração.",
  inputSchema: {
    patientName: z
      .string({ error: "Indique um texto válido." })
      .trim()
      .min(1, "Indique um nome.")
      .max(200, "O nome deve ter no máximo 200 caracteres.")
      .optional()
      .describe("Filtro parcial pelo nome do paciente."),
    generatedAfter: z.iso
      .date("Indique uma data válida no formato AAAA-MM-DD.")
      .optional()
      .describe("Data ISO (AAAA-MM-DD): apenas relatórios gerados nesta data ou depois."),
    generatedBefore: z.iso
      .date("Indique uma data válida no formato AAAA-MM-DD.")
      .optional()
      .describe("Data ISO (AAAA-MM-DD): apenas relatórios gerados nesta data ou antes."),
    limit: z
      .number({ error: "O limite deve ser numérico." })
      .int("O limite deve ser um número inteiro.")
      .min(1, "O valor é inferior ao mínimo permitido (1).")
      .max(100, "O valor excede o máximo permitido (100).")
      .optional()
      .describe("Número máximo de relatórios (1 a 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patientName, generatedAfter, generatedBefore, limit }, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) {
      return { content: [{ type: "text", text: access.message }], isError: true };
    }
    if (generatedAfter && generatedBefore && generatedAfter > generatedBefore) {
      return {
        content: [
          { type: "text", text: "A data inicial deve ser anterior ou igual à data final." },
        ],
        isError: true,
      };
    }
    const take = Math.min(Math.max(limit ?? 20, 1), 100);
    const supabase = access.supabase;
    let query = supabase
      .from("reports")
      .select("id, patient_name, exam_date, generated_at, main_goal, body_classification")
      .order("generated_at", { ascending: false })
      .limit(take + 1);
    if (patientName) query = query.ilike("patient_name", `%${escapeLike(patientName)}%`);
    if (generatedAfter) query = query.gte("generated_at", generatedAfter);
    if (generatedBefore)
      query = query.lt(
        "generated_at",
        new Date(Date.parse(`${generatedBefore}T00:00:00Z`) + 86400000).toISOString(),
      );

    const { data, error } = await query;
    if (error) {
      return {
        content: [{ type: "text", text: "Não foi possível listar os relatórios." }],
        isError: true,
      };
    }
    const truncated = (data?.length ?? 0) > take;
    const reports = (data ?? []).slice(0, take);
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
