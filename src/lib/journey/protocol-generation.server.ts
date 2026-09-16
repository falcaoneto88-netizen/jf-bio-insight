/**
 * Serviço único de geração do protocolo, partilhado pela UI e pelo MCP.
 * Não aprova, não assina e não grava nada por si: devolve o protocolo para
 * gravação pelo chamador, que mantém expectedVersion, quotas e RLS.
 */
import { z } from "zod";

import { computeEnergyPlan, energyInputSchema, resolveFfm, type EnergyPlan } from "./energy";
import { buildProtocolContext, protocoloGerado, type ProtocolAiOutput } from "./protocol-ai";
import {
  ProtocolAiFailure,
  protocolFailureMessages,
  readProtocolAiConfig,
  requestProtocol,
} from "./protocol-openai.server";
import { protocolCompletenessIssues } from "./protocol-quality";
import { protocolLocaleSchema, type Bio, type Journey, type Protocolo } from "./types";

export const protocolGenerationRequestSchema = z.object({
  objetivo: z.enum(["hipertrofia", "recomposicao", "emagrecimento"]),
  instrucoes: z.string().max(6000).default(""),
  locale: protocolLocaleSchema.optional(),
  calorieTarget: z.string().trim().max(200).optional(),
  mealCount: z.number().int().min(1).max(12).optional(),
  energyInput: energyInputSchema.optional(),
});
export type ProtocolGenerationRequest = z.infer<typeof protocolGenerationRequestSchema>;

/** Último peso e PGC válidos do histórico do exame. */
function lastMeasures(bio: Bio) {
  const rows = bio.historico.filter((r) => r.data.trim());
  const last = <K extends "peso" | "pgc">(key: K) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) if (rows[i][key].trim()) return rows[i][key];
    return "";
  };
  return { pesoKg: last("peso"), pgc: last("pgc") };
}

export function resolveEnergy(bio: Bio, request: ProtocolGenerationRequest) {
  const measures = lastMeasures(bio);
  return computeEnergyPlan({
    objetivo: request.objetivo,
    ffm: resolveFfm({
      ffmKg: bio.massaLivreGorduraKg ?? "",
      pesoKg: measures.pesoKg,
      pgc: measures.pgc,
    }),
    input: request.energyInput ?? {},
  });
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

  let settings: { apiKey: string; model: string };
  try {
    settings = config();
  } catch {
    // Sem chave não há geração e NÃO há fallback para outro fornecedor.
    return { data: null, error: protocolFailureMessages.configuration };
  }

  const locale = request.locale ?? jornada.protocolo?.locale ?? "pt-BR";
  const { plan, pendencias } = resolveEnergy(jornada.bio, request);
  const mealCount = request.mealCount ?? jornada.protocolo?.mealCount ?? null;

  let output: ProtocolAiOutput;
  try {
    output = await generate(
      buildProtocolContext({
        objetivo: request.objetivo,
        locale,
        instrucoes: request.instrucoes,
        mealCount,
        energy: plan,
        ...(request.calorieTarget ? { calorieTarget: request.calorieTarget } : {}),
        anamnese: jornada.anamnese,
        bio: jornada.bio,
      }),
      settings,
    );
  } catch (error) {
    const code = error instanceof ProtocolAiFailure ? error.code : "unavailable";
    return { data: null, error: protocolFailureMessages[code] ?? protocolFailureMessages.unavailable };
  }

  const protocolo = protocoloGerado({
    objetivo: request.objetivo,
    locale,
    instrucoes: request.instrucoes,
    mealCount,
    energy: plan,
    ...(request.energyInput ? { energyInput: request.energyInput } : {}),
    ...(request.calorieTarget ? { calorieTarget: request.calorieTarget } : {}),
    output,
    extraPendencias: pendencias,
  });
  protocolo.pendencias = [
    ...new Set([...protocolo.pendencias, ...protocolCompletenessIssues(protocolo)]),
  ].slice(0, 60);
  return { data: { protocolo, energy: plan }, error: null };
}
