import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import {
  emptyBodyComposition,
  type BodyCompositionData,
  type HistoryPoint,
} from "@/store/report-store";

const ACCEPTED_MIMES = ["application/pdf", "image/png", "image/jpeg"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

const inputSchema = z.object({
  fileBase64: z.string().min(1).max(20_000_000),
  mimeType: z.enum(ACCEPTED_MIMES),
  fileName: z.string().min(1).max(255),
});

export type ExtractionResult = {
  data: BodyCompositionData | null;
  error: string | null;
};

const historyPointSchema = {
  type: "object",
  properties: {
    date: { type: "string", description: "Data no formato YYYY-MM-DD ou texto original" },
    value: { type: "string", description: "Valor numérico em string" },
  },
  required: ["date", "value"],
  additionalProperties: false,
} as const;

const toolSchema = {
  type: "function" as const,
  function: {
    name: "extract_bioimpedance",
    description:
      "Extrai os campos de um exame de bioimpedância. Para cada campo, retorne o valor numérico como string (sem unidade) ou null se ausente.",
    parameters: {
      type: "object",
      properties: {
        patientName: { type: ["string", "null"] },
        examDateTime: {
          type: ["string", "null"],
          description:
            "Data e hora do exame, preferencialmente em ISO 8601 (YYYY-MM-DDTHH:mm). Se só houver data, use YYYY-MM-DD.",
        },
        sex: {
          type: ["string", "null"],
          enum: ["feminino", "masculino", null],
          description: "Normalize para 'feminino' ou 'masculino'.",
        },
        age: { type: ["string", "null"], description: "Idade em anos" },
        height: { type: ["string", "null"], description: "Altura em cm" },
        weight: { type: ["string", "null"], description: "Peso em kg" },
        bmi: { type: ["string", "null"], description: "IMC em kg/m²" },
        skeletalMuscleMass: { type: ["string", "null"], description: "Massa muscular esquelética em kg" },
        bodyFatPercentage: { type: ["string", "null"], description: "Percentual de gordura corporal" },
        bodyFatMass: { type: ["string", "null"], description: "Massa de gordura corporal em kg" },
        visceralFat: { type: ["string", "null"], description: "Nível de gordura visceral" },
        basalMetabolicRate: { type: ["string", "null"], description: "Taxa metabólica basal em kcal" },
        waistHipRatio: { type: ["string", "null"], description: "Relação cintura-quadril" },
        totalBodyWater: { type: ["string", "null"], description: "Água corporal total em litros" },
        fatFreeMass: { type: ["string", "null"], description: "Massa livre de gordura em kg" },
        history: {
          type: "object",
          description:
            "Histórico de medições anteriores, quando o exame mostrar tabela/gráfico de evolução. Listas vazias quando ausente.",
          properties: {
            weight: { type: "array", items: historyPointSchema },
            skeletalMuscle: { type: "array", items: historyPointSchema },
            bodyFat: { type: "array", items: historyPointSchema },
          },
          required: ["weight", "skeletalMuscle", "bodyFat"],
          additionalProperties: false,
        },
      },
      required: [
        "patientName",
        "examDateTime",
        "sex",
        "age",
        "height",
        "weight",
        "bmi",
        "skeletalMuscleMass",
        "bodyFatPercentage",
        "bodyFatMass",
        "visceralFat",
        "basalMetabolicRate",
        "waistHipRatio",
        "totalBodyWater",
        "fatFreeMass",
        "history",
      ],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `Você é um extrator especializado em exames de bioimpedância (InBody, Tanita, Omron e similares) em português.
Analise o documento e devolva APENAS via a tool 'extract_bioimpedance'.
Regras:
- Valores numéricos sempre como string sem unidade (ex.: "72.4", não "72.4 kg").
- Use ponto como separador decimal.
- Quando o campo não estiver presente no exame, retorne null.
- Normalize "F"/"Feminino" para "feminino" e "M"/"Masculino" para "masculino".
- Se houver tabela de evolução, preencha os arrays de histórico com cada medição encontrada.`;

function s(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizeHistory(arr: unknown): HistoryPoint[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((p) => ({ date: s((p as any)?.date), value: s((p as any)?.value) }))
    .filter((p) => p.date || p.value);
}

function mapToBodyComposition(raw: any): BodyCompositionData {
  const sex = s(raw?.sex).toLowerCase();
  return {
    ...emptyBodyComposition,
    patientName: s(raw?.patientName),
    examDateTime: s(raw?.examDateTime),
    sex: sex === "feminino" || sex === "masculino" ? sex : "",
    age: s(raw?.age),
    height: s(raw?.height),
    weight: s(raw?.weight),
    bmi: s(raw?.bmi),
    skeletalMuscleMass: s(raw?.skeletalMuscleMass),
    bodyFatPercentage: s(raw?.bodyFatPercentage),
    bodyFatMass: s(raw?.bodyFatMass),
    visceralFat: s(raw?.visceralFat),
    basalMetabolicRate: s(raw?.basalMetabolicRate),
    waistHipRatio: s(raw?.waistHipRatio),
    totalBodyWater: s(raw?.totalBodyWater),
    fatFreeMass: s(raw?.fatFreeMass),
    weightHistory: normalizeHistory(raw?.history?.weight),
    skeletalMuscleHistory: normalizeHistory(raw?.history?.skeletalMuscle),
    bodyFatHistory: normalizeHistory(raw?.history?.bodyFat),
  };
}

export const extractBioimpedance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<ExtractionResult> => {
    // Fluxo legado, mas exige sessão iniciada com papel de administrador.
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) {
      return { data: null, error: "Acesso restrito a administradores autenticados." };
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { data: null, error: "Serviço de IA indisponível no momento." };
    }

    // Tamanho aproximado do binário
    const approxBytes = Math.floor((data.fileBase64.length * 3) / 4);
    if (approxBytes > MAX_BYTES) {
      return { data: null, error: "Arquivo maior que 10 MB." };
    }

    const dataUrl = `data:${data.mimeType};base64,${data.fileBase64}`;
    const isPdf = data.mimeType === "application/pdf";

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Extraia os dados do exame de bioimpedância no arquivo "${data.fileName}".`,
      },
      isPdf
        ? {
            type: "file",
            file: {
              filename: data.fileName,
              file_data: dataUrl,
            },
          }
        : { type: "image_url", image_url: { url: dataUrl } },
    ];

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userContent },
          ],
          tools: [toolSchema],
          tool_choice: { type: "function", function: { name: "extract_bioimpedance" } },
        }),
      });

      if (res.status === 429) {
        return { data: null, error: "Limite de uso da IA atingido. Tente novamente em instantes." };
      }
      if (res.status === 402) {
        return {
          data: null,
          error:
            "Créditos da IA esgotados. Adicione mais em Settings → Workspace → Usage para continuar.",
        };
      }
      if (!res.ok) {
        console.error("[bioimpedance] AI gateway status", res.status);
        return { data: null, error: "Não foi possível analisar o exame. Tente novamente." };
      }

      const payload = await res.json();
      const toolCall = payload?.choices?.[0]?.message?.tool_calls?.[0];
      const argsRaw = toolCall?.function?.arguments;
      if (!argsRaw) {
        return {
          data: null,
          error: "A IA não conseguiu identificar os campos no documento enviado.",
        };
      }
      let parsed: unknown;
      try {
        parsed = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
      } catch {
        return { data: null, error: "Resposta da IA em formato inválido." };
      }

      const mapped = mapToBodyComposition(parsed);
      const hasAnyValue = Object.entries(mapped).some(([k, v]) => {
        if (k === "weightHistory" || k === "skeletalMuscleHistory" || k === "bodyFatHistory") {
          return Array.isArray(v) && v.length > 0;
        }
        return typeof v === "string" && v.trim() !== "";
      });
      if (!hasAnyValue) {
        console.warn("[bioimpedance] extração sem campos reconhecidos");
        return {
          data: null,
          error: isPdf
            ? "Não foi possível ler este PDF. Tente reenviar ou enviar como imagem (PNG/JPG)."
            : "Não foi possível identificar os campos nesta imagem. Tente outra foto mais nítida.",
        };
      }
      return { data: mapped, error: null };
    } catch (err) {
      console.error("[bioimpedance] falha ao processar o exame");
      return { data: null, error: "Falha ao processar o exame. Verifique sua conexão e tente novamente." };
    }
  });
