import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireAdminClient } from "../supabase";

type Row = {
  id: string;
  patient_name: string | null;
  exam_date: string | null;
  generated_at: string;
  body_classification: string | null;
  body_composition: Record<string, unknown> | null;
};

function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/[^\d,.\-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default defineTool({
  name: "patient_evolution",
  title: "Evolução do paciente",
  description:
    "Compara os relatórios de um paciente ao longo do tempo (peso, gordura corporal, massa muscular e gordura visceral) e devolve a variação entre o primeiro e o último exame.",
  inputSchema: {
    patientName: z.string().trim().min(1).describe("Nome (ou parte do nome) do paciente."),
    limit: z.number().int().optional().describe("Número máximo de relatórios a comparar (1 a 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ patientName, limit }, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) return { content: [{ type: "text", text: access.message }], isError: true };

    const take = Math.min(Math.max(limit ?? 12, 1), 50);
    const { data, error } = await access.supabase
      .from("reports")
      .select("id, patient_name, exam_date, generated_at, body_classification, body_composition")
      .ilike("patient_name", `%${patientName}%`)
      .order("generated_at", { ascending: true })
      .limit(take);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const rows = (data ?? []) as unknown as Row[];
    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: `Nenhum relatório encontrado para "${patientName}".` }],
      };
    }

    const points = rows.map((r) => {
      const bc = r.body_composition ?? {};
      return {
        id: r.id,
        patientName: r.patient_name ?? "",
        examDate: r.exam_date ?? "",
        generatedAt: r.generated_at,
        classification: r.body_classification ?? "",
        weight: num(bc["weight"]),
        bodyFatPercentage: num(bc["bodyFatPercentage"]),
        skeletalMuscleMass: num(bc["skeletalMuscleMass"]),
        visceralFatLevel: num(bc["visceralFat"]),
      };
    });

    const first = points[0]!;
    const last = points[points.length - 1]!;
    const delta = (a: number | null, b: number | null) =>
      a !== null && b !== null ? Number((b - a).toFixed(2)) : null;

    const change = {
      weight: delta(first.weight, last.weight),
      bodyFatPercentage: delta(first.bodyFatPercentage, last.bodyFatPercentage),
      skeletalMuscleMass: delta(first.skeletalMuscleMass, last.skeletalMuscleMass),
      visceralFatLevel: delta(first.visceralFatLevel, last.visceralFatLevel),
    };

    const result = { reports: points.length, first, last, change, points };
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: result,
    };
  },
});
