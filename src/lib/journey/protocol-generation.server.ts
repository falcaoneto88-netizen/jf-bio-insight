/**
 * Serviço único de geração do protocolo, partilhado pela UI e pelo MCP.
 * Não aprova, não assina e não grava nada por si: devolve o protocolo para
 * gravação pelo chamador, que mantém expectedVersion, quotas e RLS.
 */
import { z } from "zod";

import {
  computeEnergyPlan,
  energyInputSchema,
  measuresForExam,
  resolveEnergyForBio,
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

export { measuresForExam };

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

export function resolveEnergy(bio: Bio, request: ProtocolGenerationRequest) {
  const { plan, pendencias } = resolveEnergyForBio({
    bio,
    objetivo: request.objetivo,
    ...(request.energyInput ? { energyInput: request.energyInput } : {}),
    ...(request.calorieTarget ? { calorieTarget: request.calorieTarget } : {}),
  });
  return { plan, pendencias };
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
  if (!args.mealCount) return "Indique o número de refeições antes de gerar o plano alimentar.";
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
