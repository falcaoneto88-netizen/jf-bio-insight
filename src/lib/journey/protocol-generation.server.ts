/**
 * Serviço único de geração do protocolo, partilhado pela UI e pelo MCP.
 * Não aprova, não assina e não grava nada por si: devolve o protocolo para
 * gravação pelo chamador, que mantém expectedVersion, quotas e RLS.
 */
import { z } from "zod";

import { dateSortKey } from "./format";
import {
  computeEnergyPlan,
  energyInputSchema,
  resolveFfmDetailed,
  type EnergyPlan,
} from "./energy";
import { buildProtocolContext, protocoloGerado, type ProtocolAiOutput } from "./protocol-ai";
import {
  ProtocolAiFailure,
  protocolFailureMessages,
  readProtocolAiConfig,
  requestProtocol,
} from "./protocol-openai.server";
import { protocolEssentialIssues } from "./protocol-quality";
import {
  prescriptionEntrySchema,
  protocolLocaleSchema,
  type Bio,
  type Journey,
  type Protocolo,
} from "./types";

export const protocolGenerationRequestSchema = z.object({
  objetivo: z.enum(["hipertrofia", "recomposicao", "emagrecimento"]),
  instrucoes: z.string().max(6000).default(""),
  locale: protocolLocaleSchema.optional(),
  /** Meta calórica escrita pelo profissional (unificada com energyInput.professionalTarget). */
  calorieTarget: z.string().trim().max(200).optional(),
  mealCount: z.number().int().min(1).max(12).optional(),
  energyInput: energyInputSchema.optional(),
  liquidMealNumbers: z.array(z.number().int().min(1).max(12)).max(12).optional(),
  prescriptions: z.array(prescriptionEntrySchema).max(20).optional(),
});
export type ProtocolGenerationRequest = z.infer<typeof protocolGenerationRequestSchema>;

/**
 * Peso e PGC da MESMA data: a do exame atual, ou a data válida mais recente.
 * Posição na lista nunca decide; valores em conflito na mesma data bloqueiam.
 */
export function measuresForExam(bio: Bio): {
  pesoKg: string;
  pgc: string;
  date: string;
  issues: string[];
} {
  const empty = { pesoKg: "", pgc: "", date: "", issues: [] as string[] };
  if (bio.semExame) return empty;
  const rows = bio.historico
    .map((row) => ({ ...row, key: dateSortKey(String(row.data).trim().split(/[\s,]+/)[0] ?? "") }))
    .filter((row) => row.key);
  if (!rows.length) return empty;

  const examKey = dateSortKey(String(bio.dataHoraExame ?? "").trim().split(/[\s,]+/)[0] ?? "");
  const target = examKey && rows.some((r) => r.key === examKey)
    ? examKey
    : [...rows].sort((a, b) => a.key.localeCompare(b.key)).at(-1)!.key;

  const sameDate = rows.filter((r) => r.key === target);
  const issues: string[] = [];
  const pick = (field: "peso" | "pgc", label: string) => {
    const values = [...new Set(sameDate.map((r) => r[field].trim()).filter(Boolean))];
    if (values.length > 1) {
      issues.push(
        `Conflito no histórico: há mais de um valor de ${label} para a data ${sameDate[0]!.data}. Corrija antes de calcular.`,
      );
      return "";
    }
    return values[0] ?? "";
  };
  return {
    pesoKg: pick("peso", "peso"),
    pgc: pick("pgc", "percentual de gordura"),
    date: target,
    issues,
  };
}

export function resolveEnergy(bio: Bio, request: ProtocolGenerationRequest) {
  const measures = measuresForExam(bio);
  const { ffm, issues } = resolveFfmDetailed({
    ffmExameKg: bio.semExame ? "" : (bio.massaLivreGorduraKg ?? ""),
    ffmManualKg: request.energyInput?.ffmManualKg ?? "",
    pesoKg: measures.pesoKg,
    pgc: measures.pgc,
  });
  const result = computeEnergyPlan({
    objetivo: request.objetivo,
    ffm,
    input: request.energyInput ?? {},
    ...(request.calorieTarget ? { professionalTarget: request.calorieTarget } : {}),
  });
  return {
    plan: result.plan,
    pendencias: [...measures.issues, ...issues, ...result.pendencias],
  };
}

/**
 * Verificações feitas ANTES de chamar a OpenAI: sem meta válida ou sem número
 * de refeições não se pede à IA que invente o plano.
 */
export function generationPreflight(args: {
  plan: EnergyPlan | null;
  mealCount: number | null;
  pendencias: string[];
}): string | null {
  if (!args.plan)
    return [
      "Defina a meta calórica antes de gerar: escreva a meta profissional ou complete o cálculo interno.",
      ...args.pendencias,
    ].join(" ");
  if (!args.mealCount)
    return "Indique o número de refeições antes de gerar o plano alimentar.";
  return null;
}

export type ProtocolGenerationResult =
  | { data: { protocolo: Protocolo; energy: EnergyPlan | null }; error: null }
  | { data: null; error: string };

export async function gerarProtocolo(
  jornada: Pick<Journey, "anamnese" | "bio" | "protocolo">,
  raw: unknown,
  deps: {
    config?: typeof readProtocolAiConfig;
    generate?: (
      context: unknown,
      config: { apiKey: string; model: string },
    ) => Promise<ProtocolAiOutput>;
  } = {},
): Promise<ProtocolGenerationResult> {
  const parsed = protocolGenerationRequestSchema.safeParse(raw);
  if (!parsed.success)
    return { data: null, error: "Confira o objetivo e as opções antes de gerar o protocolo." };
  const request = parsed.data;
  const config = deps.config ?? readProtocolAiConfig;
  const generate = deps.generate ?? requestProtocol;

  // Configuração lida ANTES de consumir quota: sem chave não se gasta nada.
  let settings: { apiKey: string; model: string };
  try {
    settings = config();
  } catch {
    // Sem chave não há geração e NÃO há fallback para outro fornecedor.
    return { data: null, error: protocolFailureMessages.configuration! };
  }

  const locale = request.locale ?? jornada.protocolo?.locale ?? "pt-BR";
  const { plan, pendencias } = resolveEnergy(jornada.bio, request);
  const mealCount = request.mealCount ?? jornada.protocolo?.mealCount ?? null;
  const liquidMealNumbers = [...new Set(request.liquidMealNumbers ?? [])].sort((a, b) => a - b);
  const prescriptions = request.prescriptions ?? [];

  const blocked = generationPreflight({ plan, mealCount, pendencias });
  if (blocked) return { data: null, error: blocked };

  let output: ProtocolAiOutput;
  try {
    output = await generate(
      buildProtocolContext({
        objetivo: request.objetivo,
        locale,
        instrucoes: request.instrucoes,
        mealCount,
        energy: plan,
        liquidMealNumbers,
        anamnese: jornada.anamnese,
        bio: jornada.bio,
      }),
      settings,
    );
  } catch (error) {
    const code = error instanceof ProtocolAiFailure ? error.code : "unavailable";
    return {
      data: null,
      error: protocolFailureMessages[code] ?? protocolFailureMessages.unavailable!,
    };
  }

  const protocolo = protocoloGerado({
    objetivo: request.objetivo,
    locale,
    instrucoes: request.instrucoes,
    mealCount,
    energy: plan,
    ...(request.energyInput ? { energyInput: request.energyInput } : {}),
    liquidMealNumbers,
    prescriptions,
    output,
    extraPendencias: pendencias,
  });
  protocolo.pendencias = [
    ...new Set([...protocolo.pendencias, ...protocolEssentialIssues(protocolo)]),
  ].slice(0, 60);
  return { data: { protocolo, energy: plan }, error: null };
}
