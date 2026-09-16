/**
 * Pré-verificações partilhadas pela interface e pelo MCP antes e depois de
 * chamar a OpenAI. O mesmo caminho para os dois: papel de administrador e dono
 * (garantido pelo chamador), revisão confirmada, fonte da consulta atual e
 * versão esperada ANTES do envio; fonte, identidade e versão outra vez DEPOIS
 * da resposta, antes de gravar.
 */
import { sourceIssues } from "./core.server";
import type { Journey } from "./types";
import { protocolAiConfigured } from "./protocol-openai.server";

export type PreflightResult = { ok: true } | { ok: false; error: string };

export async function preflightProtocolGeneration(
  jornada: Journey,
  expectedVersion: number,
): Promise<PreflightResult> {
  if (!jornada.confirmations.revisao)
    return { ok: false, error: "Confirme a revisão dos dados antes de preparar o protocolo." };

  const { assertCurrentConsultationSource } = await import("./consultation.server");
  try {
    assertCurrentConsultationSource(jornada);
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  if (jornada.version !== expectedVersion)
    return {
      ok: false,
      error: "A análise mudou. Reabra a consulta antes de gerar o protocolo.",
    };

  // Só dados de origem: um rascunho de protocolo incompleto não impede a sua
  // própria regeneração.
  const blocking = sourceIssues(jornada).blocking;
  if (blocking.length) return { ok: false, error: blocking.join(" ") };

  // Configuração lida antes de consumir quota.
  if (!protocolAiConfigured())
    return {
      ok: false,
      error:
        "A geração por IA ainda não está configurada. A equipa precisa de cadastrar OPENAI_API_KEY nos Secrets do BioReport.",
    };

  return { ok: true };
}

/** Revalidação depois da resposta da OpenAI, antes de gravar. */
export async function revalidateAfterGeneration(
  sb: Parameters<typeof import("./core.server").getJourney>[0],
  userId: string,
  id: string,
  expectedVersion: number,
): Promise<PreflightResult> {
  const { getJourney } = await import("./core.server");
  const atual = await getJourney(sb, userId, id);
  return preflightProtocolGeneration(atual, expectedVersion);
}
