/**
 * Preflight partilhado pela interface e pelo MCP: revisão, fonte da consulta,
 * versão esperada e configuração — antes e depois da resposta da IA.
 * Dados fictícios; nenhuma chamada real e nenhuma base de dados real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { emptyAnamnese, emptyBio, type Journey } from "./types";

const sourceState = { blocking: [] as string[], current: true };

vi.mock("./consultation.server", () => ({
  assertCurrentConsultationSource: () => {
    if (!sourceState.current) throw new Error("A consulta de origem mudou.");
  },
}));
vi.mock("./core.server", () => ({
  sourceIssues: () => ({ blocking: sourceState.blocking, warnings: [] }),
  getJourney: async () => journey(),
}));

const { preflightProtocolGeneration, revalidateAfterGeneration } = await import(
  "./protocol-preflight.server"
);

function journey(over: Partial<Journey> = {}): Journey {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    version: 3,
    contentHash: "hash-ficticio",
    anamnese: emptyAnamnese,
    bio: emptyBio,
    protocolo: null,
    confirmations: { anamnese: true, bio: true, revisao: true },
    ...(over as Journey),
  } as Journey;
}

beforeEach(() => {
  sourceState.blocking = [];
  sourceState.current = true;
  process.env["OPENAI_API_KEY"] = "chave-ficticia";
});
afterEach(() => {
  delete process.env["OPENAI_API_KEY"];
});

describe("preflight antes de chamar a IA", () => {
  it("aprova quando revisão, fonte, versão e configuração estão em ordem", async () => {
    expect(await preflightProtocolGeneration(journey(), 3)).toEqual({ ok: true });
  });

  it("bloqueia sem confirmação da revisão", async () => {
    const sem = journey({ confirmations: { anamnese: true, bio: true, revisao: false } } as never);
    expect(await preflightProtocolGeneration(sem, 3)).toMatchObject({ ok: false });
  });

  it("bloqueia quando a consulta de origem deixou de ser a atual", async () => {
    sourceState.current = false;
    const result = await preflightProtocolGeneration(journey(), 3);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("origem");
  });

  it("bloqueia quando a versão esperada não bate certo", async () => {
    const result = await preflightProtocolGeneration(journey(), 2);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("Reabra");
  });

  it("bloqueia por conflito de identidade na origem", async () => {
    sourceState.blocking = ["Identidade divergente entre anamnese e exame."];
    const result = await preflightProtocolGeneration(journey(), 3);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("Identidade");
  });

  it("sem chave configurada não deixa sequer consumir quota", async () => {
    delete process.env["OPENAI_API_KEY"];
    const result = await preflightProtocolGeneration(journey(), 3);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.error).toContain("OPENAI_API_KEY");
  });
});

describe("revalidação depois da resposta", () => {
  it("recusa a gravação se a fonte mudou durante a geração", async () => {
    sourceState.current = false;
    const result = await revalidateAfterGeneration({} as never, "user", "id", 3);
    expect(result).toMatchObject({ ok: false });
  });

  it("recusa a gravação se a versão mudou durante a geração", async () => {
    expect(await revalidateAfterGeneration({} as never, "user", "id", 9)).toMatchObject({
      ok: false,
    });
  });

  it("aceita quando nada mudou", async () => {
    expect(await revalidateAfterGeneration({} as never, "user", "id", 3)).toEqual({ ok: true });
  });
});
