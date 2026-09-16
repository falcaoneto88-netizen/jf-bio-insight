/**
 * Verificação de versão/hash antes de qualquer entrega e impressão segura.
 * Puro o suficiente para ser testado sem navegador e sem imprimir nada.
 */

/** Confere se o documento servido é mesmo o da versão pedida. */
export function documentMatchesRequest(args: {
  requestedVersion: number;
  requestedHash: string;
  result: { version?: number | null; contentHash?: string | null };
}): string | null {
  const { requestedVersion, requestedHash, result } = args;
  if (typeof result.version !== "number" || !result.contentHash)
    return "O servidor não confirmou a versão deste documento. Recarregue o atendimento e tente de novo.";
  if (result.version !== requestedVersion || result.contentHash !== requestedHash)
    return `O documento preparado é da versão ${result.version} e o ecrã mostra a versão ${requestedVersion}. Recarregue o atendimento antes de baixar, copiar ou imprimir.`;
  return null;
}

/** SHA-256 hexadecimal de um texto, no navegador. */
export async function sha256Text(
  text: string,
  subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle,
): Promise<string | null> {
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fail-closed: sem hash do servidor ou sem calculadora SHA disponível, o
 * documento NÃO é entregue. Nunca se assume correspondência por omissão.
 */
export function htmlBytesMismatch(
  computed: string | null,
  expected: string | null | undefined,
): string | null {
  if (!expected)
    return "O servidor não devolveu o identificador deste documento. Recarregue o atendimento antes de continuar.";
  if (!computed)
    return "Este navegador não permite verificar o documento recebido. Recarregue a página num navegador seguro (HTTPS) antes de baixar, copiar ou imprimir.";
  if (computed !== expected)
    return "O documento recebido não corresponde ao seu identificador. Recarregue o atendimento antes de continuar.";
  return null;
}

export interface PrintFrame {
  /** Escreve o HTML e resolve quando o documento terminou de carregar. */
  load(html: string): Promise<void>;
  /** Espera fontes e imagens, com limite de tempo. */
  waitReady(limitMs: number): Promise<void>;
  /** Abre o diálogo do navegador; lança se for bloqueado. */
  print(): void;
  remove(): void;
}

export type PrintOutcome = "requested" | "stale" | "blocked";

/**
 * Imprime o HTML atual. Se o pedido deixar de ser o atual (troca de paciente,
 * de versão ou desmontagem), o iframe é removido e nada é impresso.
 * Devolve "requested" apenas porque o diálogo foi pedido: o navegador não diz
 * se a pessoa imprimiu ou cancelou.
 */
export async function printHtmlDocument(
  html: string,
  frame: PrintFrame,
  isCurrent: () => boolean,
  limitMs = 8000,
): Promise<PrintOutcome> {
  try {
    // Carregamento com limite finito: um iframe que nunca dispara load não
    // deixa o botão preso nem o iframe pendurado.
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      frame.load(html),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("tempo esgotado ao preparar a impressão")), limitMs);
      }),
    ]).finally(() => {
      if (timer) clearTimeout(timer);
    });
    if (!isCurrent()) {
      frame.remove();
      return "stale";
    }
    await frame.waitReady(limitMs);
    if (!isCurrent()) {
      frame.remove();
      return "stale";
    }
    frame.print();
    return "requested";
  } catch {
    frame.remove();
    return "blocked";
  }
}
