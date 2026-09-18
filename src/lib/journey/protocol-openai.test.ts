/**
 * Testes da chamada à OpenAI com fetch SIMULADO.
 * Nenhuma chamada real é feita, nenhuma credencial real é usada e todos os
 * dados são fictícios. A chave real continua ausente no projeto.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProtocolAiOutput } from "./protocol-ai";
import {
  ProtocolAiFailure,
  protocolAiConfigured,
  readProtocolAiConfig,
  requestProtocol,
} from "./protocol-openai.server";

const config = { apiKey: "chave-ficticia", model: "gpt-5.4" };

const aiOutput = (): ProtocolAiOutput => ({
  objetivoResumo: "Resumo fictício.",
  orientacoesGerais: ["Beber água."],
  orientacoesAtividade: ["Manter atividade relatada."],
  refeicoes: [
    {
      liquida: false,
      alimentos: [
        { nome: "Proteína fictícia", quantidade: "120 g", categoria: "proteina" },
        { nome: "Carboidrato fictício", quantidade: "80 g", categoria: "carboidrato" },
        { nome: "Azeite", quantidade: "10 ml", categoria: "gordura" },
      ],
      preparo: "Cozinhar.",
      substituicoes: {
        proteina: ["Frango 120 g", "Peixe 130 g", "Ovos 3 unidades"],
        carboidrato: ["Arroz 80 g", "Batata 200 g", "Aveia 60 g"],
        gordura: ["Azeite 10 ml", "Abacate 50 g", "Castanhas 20 g"],
      },
    },
  ],
  substituicoesGerais: [],
  pendencias: [],
});

function completed(text: string) {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
    }),
  );
}

afterEach(() => vi.useRealTimers());

describe("chamada à OpenAI (simulada)", () => {
  it("usa o endpoint oficial Responses, store:false e schema estrito", async () => {
    let seen: { url: string; body: Record<string, unknown>; init: RequestInit } | null = null;
    const output = await requestProtocol({ ok: true }, config, (async (url, init) => {
      seen = {
        url: String(url),
        body: JSON.parse(String(init?.body)),
        init: init as RequestInit,
      };
      return completed(JSON.stringify(aiOutput()));
    }) as typeof fetch);

    expect(output.refeicoes).toHaveLength(1);
    const call = seen as unknown as {
      url: string;
      body: {
        store: boolean;
        model: string;
        text: { format: { type: string; strict: boolean; schema: unknown } };
      };
      init: RequestInit;
    };
    expect(call.url).toBe("https://api.openai.com/v1/responses");
    expect(call.init.redirect).toBe("manual");
    expect(call.body.store).toBe(false);
    expect(call.body.model).toBe("gpt-5.4");
    expect(call.body.text.format.type).toBe("json_schema");
    expect(call.body.text.format.strict).toBe(true);
    expect(call.body.text.format.schema).toBeTruthy();
  });

  it("traduz 401, 403, 429 e 500 em códigos distintos", async () => {
    const codes: Record<number, string> = {
      401: "credentials",
      403: "credentials",
      429: "quota",
      500: "unavailable",
      // redirect "manual": a redireção nunca é seguida com a credencial.
      302: "rejected",
      400: "rejected",
      404: "rejected",
    };
    for (const [status, code] of Object.entries(codes)) {
      await expect(
        requestProtocol(
          {},
          config,
          (async () => new Response("erro", { status: Number(status) })) as typeof fetch,
        ),
      ).rejects.toMatchObject({ code });
    }
  });

  it("assinala recusa e resposta incompleta", async () => {
    await expect(
      requestProtocol(
        {},
        config,
        (async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              output: [{ type: "message", role: "assistant", content: [{ type: "refusal" }] }],
            }),
          )) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "refusal" });

    await expect(
      requestProtocol(
        {},
        config,
        (async () => new Response(JSON.stringify({ status: "incomplete" }))) as typeof fetch,
      ),
    ).rejects.toMatchObject({ code: "incomplete" });
  });

  it("recusa resposta fora do schema e corpo gigante", async () => {
    await expect(
      requestProtocol({}, config, (async () =>
        completed(JSON.stringify({ qualquer: "coisa" }))) as typeof fetch),
    ).rejects.toMatchObject({ code: "invalid_response" });

    const enorme = completed(JSON.stringify(aiOutput()) + " ".repeat(500_000));
    await expect(
      requestProtocol({}, config, (async () => enorme) as typeof fetch),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("recusa entrada demasiado grande sem sequer chamar o serviço", async () => {
    let chamou = false;
    await expect(
      requestProtocol({ texto: "x".repeat(80_000) }, config, (async () => {
        chamou = true;
        return completed("{}");
      }) as typeof fetch),
    ).rejects.toBeInstanceOf(ProtocolAiFailure);
    expect(chamou).toBe(false);
  });

  it("aborta por tempo limite e devolve o código timeout", async () => {
    vi.useFakeTimers();
    const pending = requestProtocol(
      {},
      config,
      ((_url: unknown, init: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("abortado")));
        })) as unknown as typeof fetch,
    );
    const assertion = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(180_000);
    await assertion;
  });
});

describe("configuração", () => {
  it("sem OPENAI_API_KEY não há configuração nem fallback", () => {
    expect(protocolAiConfigured({})).toBe(false);
    expect(() => readProtocolAiConfig({})).toThrow(ProtocolAiFailure);
    expect(protocolAiConfigured({ OPENAI_API_KEY: "x" })).toBe(true);
    expect(readProtocolAiConfig({ OPENAI_API_KEY: "x" }).model).toBe("gpt-5.4");
    expect(() =>
      readProtocolAiConfig({ OPENAI_API_KEY: "x", OPENAI_CLINICAL_MODEL: "modelo inválido!" }),
    ).toThrow(ProtocolAiFailure);
  });
});
