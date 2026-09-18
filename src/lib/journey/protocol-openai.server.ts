/**
 * Geração do protocolo pela API oficial Responses da OpenAI (server-only).
 * Sem fallback para outro modelo. Nunca regista chaves, payloads ou conteúdo clínico.
 */
import { z } from "zod";

import { protocolAiOutputSchema, type ProtocolAiOutput } from "./protocol-ai";
import { PROTOCOL_GENERATION_PROMPT } from "./protocol-prompt.server";

export class ProtocolAiFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const protocolFailureMessages: Record<string, string> = {
  configuration:
    "A geração por IA ainda não está configurada. A equipa precisa de cadastrar OPENAI_API_KEY nos Secrets do BioReport.",
  credentials: "A credencial da OpenAI foi recusada. Confirme a configuração no servidor.",
  quota:
    "O limite ou os créditos da OpenAI foram atingidos. Tente mais tarde ou peça verificação da conta.",
  timeout: "A geração demorou demasiado tempo. Nada foi gravado; tente novamente.",
  refusal: "O modelo recusou-se a produzir este conteúdo. Reveja as instruções profissionais.",
  incomplete: "A resposta ficou incompleta. Reduza as instruções e gere novamente.",
  invalid_response: "A IA não devolveu um protocolo válido. Nenhum rascunho foi gravado.",
  unavailable: "O serviço de geração está indisponível. Tente novamente mais tarde.",
};

export function readProtocolAiConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env["OPENAI_API_KEY"]?.trim();
  const model = env["OPENAI_CLINICAL_MODEL"]?.trim() || "gpt-5.4";
  if (!apiKey || !/^[a-zA-Z0-9._:-]{1,100}$/.test(model))
    throw new ProtocolAiFailure("configuration");
  return { apiKey, model };
}

/** Booleano apenas: o valor da chave nunca é lido fora daqui nem devolvido. */
export function protocolAiConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env["OPENAI_API_KEY"]?.trim());
}

const MAX_INPUT_BYTES = 70_000;
const MAX_BODY_BYTES = 400_000;
const TIMEOUT_MS = 180_000;

export async function requestProtocol(
  context: unknown,
  config: { apiKey: string; model: string },
  fetcher: typeof fetch = fetch,
): Promise<ProtocolAiOutput> {
  const input = JSON.stringify(context);
  if (new TextEncoder().encode(input).length > MAX_INPUT_BYTES)
    throw new ProtocolAiFailure("invalid_response");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      // workerd só aceita "follow"/"manual"; nunca seguimos redireção com a credencial.
      redirect: "manual",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        store: false,
        instructions: PROTOCOL_GENERATION_PROMPT,
        input: [{ role: "user", content: input }],
        max_output_tokens: 12000,
        text: {
          format: {
            type: "json_schema",
            name: "clinical_protocol",
            strict: true,
            schema: z.toJSONSchema(protocolAiOutputSchema, { target: "draft-7" }),
          },
        },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProtocolAiFailure(
        response.status === 401 || response.status === 403
          ? "credentials"
          : response.status === 429
            ? "quota"
            : "unavailable",
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new ProtocolAiFailure("invalid_response");
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ProtocolAiFailure("invalid_response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let payload: {
      status?: string;
      output?: { type?: string; role?: string; content?: { type?: string; text?: string }[] }[];
    };
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ProtocolAiFailure("invalid_response");
    }
    if (payload.status === "incomplete") throw new ProtocolAiFailure("incomplete");
    if (payload.status !== "completed" || !Array.isArray(payload.output))
      throw new ProtocolAiFailure("invalid_response");
    const content = payload.output
      .filter((item) => item.type === "message" && item.role === "assistant")
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []));
    if (content.some((item) => item.type === "refusal")) throw new ProtocolAiFailure("refusal");
    const text = content
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("");
    try {
      return protocolAiOutputSchema.parse(JSON.parse(text));
    } catch {
      throw new ProtocolAiFailure("invalid_response");
    }
  } catch (error) {
    if (error instanceof ProtocolAiFailure) throw error;
    throw new ProtocolAiFailure(controller.signal.aborted ? "timeout" : "unavailable");
  } finally {
    clearTimeout(timer);
  }
}
