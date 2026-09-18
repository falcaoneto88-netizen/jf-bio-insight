/** Dados FICTÍCIOS. Nenhuma chamada real de IA é feita nestes testes. */
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { protocolAiOutputSchema } from "./protocol-ai";
import { PROTOCOL_GENERATION_PROMPT } from "./protocol-prompt.server";
import { isValidSubstitution } from "./protocol-quality";

describe("substituições com porção", () => {
  it("o pedido à IA exige quantidade e unidade em cada substituição", () => {
    expect(PROTOCOL_GENERATION_PROMPT).toContain("quantidade + unidade + alimento");
    expect(PROTOCOL_GENERATION_PROMPT).toContain("120 g de frango grelhado");
  });

  it("o schema enviado descreve o formato exigido nas três categorias", () => {
    const json = JSON.stringify(z.toJSONSchema(protocolAiOutputSchema, { target: "draft-7" }));
    const ocorrencias = json.split("Quantidade + unidade + alimento").length - 1;
    expect(ocorrencias).toBeGreaterThanOrEqual(3);
  });

  it("uma substituição sem porção é inválida e com porção é válida", () => {
    expect(isValidSubstitution("tapioca")).toBe(false);
    expect(isValidSubstitution("banana")).toBe(false);
    expect(isValidSubstitution("60 g de tapioca")).toBe(true);
    expect(isValidSubstitution("2 fatias de pão integral")).toBe(true);
  });
});
