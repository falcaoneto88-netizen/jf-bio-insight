import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireAdminClient } from "../supabase";
import { buildEvolution, escapeLike, type EvolutionRow } from "../evolution";

export default defineTool({
  name: "patient_evolution",
  title: "Evolução do paciente",
  description:
    "Compara exames distintos por nome completo e exato. Recusa nomes abreviados, resultados ambíguos e medições conflitantes na mesma data. Remove relatórios regenerados do mesmo exame e compara as datas dos exames mais recentes. A identificação por nome não distingue homónimos.",
  inputSchema: {
    patientName: z
      .string({ error: "Indique um texto válido." })
      .trim()
      .min(2, "O valor é inferior ao mínimo permitido (2).")
      .max(200, "Use no máximo 200 caracteres.")
      .describe("Nome completo e exato de list_reports, sem abreviações."),
    limit: z
      .number({ error: "O limite deve ser numérico." })
      .int("O limite deve ser um número inteiro.")
      .min(2, "O valor é inferior ao mínimo permitido (2).")
      .max(50, "O valor excede o máximo permitido (50).")
      .optional()
      .describe("Número máximo de exames distintos mais recentes (2 a 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patientName, limit }, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) return { content: [{ type: "text", text: access.message }], isError: true };
    const { data, error, count } = await access.supabase
      .from("reports")
      .select("id, patient_name, exam_date, generated_at, body_classification, body_composition", {
        count: "exact",
      })
      .ilike("patient_name", `%${escapeLike(patientName)}%`)
      .order("generated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(501);
    if (error)
      return {
        content: [{ type: "text", text: "Não foi possível consultar a evolução do paciente." }],
        isError: true,
      };
    if (!data?.length)
      return {
        content: [
          {
            type: "text",
            text: "Nenhum relatório encontrado. Use o nome completo de list_reports.",
          },
        ],
      };
    if (count === null || count > 500 || count > data.length)
      return {
        content: [
          {
            type: "text",
            text: "Histórico incompleto ou superior a 500 relatórios. Refine a identificação antes de comparar exames.",
          },
        ],
        isError: true,
      };
    try {
      const result = buildEvolution(data as EvolutionRow[], patientName, limit ?? 12);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Não foi possível comparar os exames.",
          },
        ],
        isError: true,
      };
    }
  },
});
