/**
 * Testes de verificação de versão/hash e de impressão com DOM falso.
 * Nada é impresso fisicamente e todos os dados são fictícios.
 */
import { describe, expect, it } from "vitest";

import {
  documentMatchesRequest,
  printHtmlDocument,
  sha256Text,
  type PrintFrame,
} from "./print";

describe("verificação antes de baixar, copiar ou imprimir", () => {
  it("aceita apenas a versão e o conteúdo pedidos", () => {
    expect(
      documentMatchesRequest({
        requestedVersion: 4,
        requestedHash: "abc",
        result: { version: 4, contentHash: "abc" },
      }),
    ).toBeNull();
    expect(
      documentMatchesRequest({
        requestedVersion: 4,
        requestedHash: "abc",
        result: { version: 3, contentHash: "abc" },
      }),
    ).toContain("versão");
    expect(
      documentMatchesRequest({
        requestedVersion: 4,
        requestedHash: "abc",
        result: { version: 4, contentHash: "outro" },
      }),
    ).toContain("Recarregue");
    expect(
      documentMatchesRequest({
        requestedVersion: 4,
        requestedHash: "abc",
        result: { version: null, contentHash: null },
      }),
    ).toContain("não confirmou");
  });

  it("calcula o SHA-256 do HTML recebido", async () => {
    expect(await sha256Text("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

function fakeFrame() {
  const state = { loaded: 0, ready: 0, printed: 0, removed: 0 };
  const frame: PrintFrame = {
    load: async () => {
      state.loaded += 1;
    },
    waitReady: async () => {
      state.ready += 1;
    },
    print: () => {
      state.printed += 1;
    },
    remove: () => {
      state.removed += 1;
    },
  };
  return { frame, state };
}

describe("impressão", () => {
  it("pede a impressão quando o pedido continua atual", async () => {
    const { frame, state } = fakeFrame();
    expect(await printHtmlDocument("<html></html>", frame, () => true)).toBe("requested");
    expect(state.printed).toBe(1);
  });

  it("não imprime depois de trocar de paciente ou versão", async () => {
    const { frame, state } = fakeFrame();
    let atual = true;
    const outcome = await printHtmlDocument("<html></html>", frame, () => {
      const value = atual;
      atual = false; // a versão muda logo após o carregamento
      return value;
    });
    expect(outcome).toBe("stale");
    expect(state.printed).toBe(0);
    expect(state.removed).toBe(1);
  });

  it("não imprime depois da desmontagem do ecrã", async () => {
    const { frame, state } = fakeFrame();
    expect(await printHtmlDocument("<html></html>", frame, () => false)).toBe("stale");
    expect(state.printed).toBe(0);
    expect(state.removed).toBe(1);
  });

  it("assinala bloqueio do navegador em vez de afirmar que imprimiu", async () => {
    const { frame, state } = fakeFrame();
    const bloqueado: PrintFrame = {
      ...frame,
      print: () => {
        throw new Error("bloqueado");
      },
    };
    expect(await printHtmlDocument("<html></html>", bloqueado, () => true)).toBe("blocked");
    expect(state.removed).toBe(1);
  });
});
