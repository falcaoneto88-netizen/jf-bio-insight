import { describe, expect, it } from "vitest";

import { computeEvolution } from "./evolution";
import { dateSortKey, decimalComma, integerValue, isRealDate, needsNumberReview } from "./format";
import { protocoloTemConteudoRenderizavel, renderProtocolHtml } from "./html";
import { bioSchema } from "./types";
import { fixtureAnamnese, fixtureBio, fixtureJourney, fixtureProtocolo } from "./__fixtures__/jornada-sintetica";

describe("formatação por campo e unidade", () => {
  it("não transforma milhares em decimais", () => {
    expect(decimalComma("1.365")).toBe("1.365");
    expect(integerValue("1365")).toBe("1.365");
    expect(integerValue("1.365")).toBe("1.365");
  });

  it("preserva a precisão original dos decimais", () => {
    expect(decimalComma("34,0")).toBe("34,0");
    expect(decimalComma("70,0")).toBe("70,0");
    expect(decimalComma("34.0")).toBe("34,0");
    expect(decimalComma("1,78")).toBe("1,78");
  });
});

describe("datas reais", () => {
  it("rejeita datas inexistentes", () => {
    expect(dateSortKey("31/02/2026")).toBe("");
    expect(dateSortKey("29/02/2025")).toBe("");
    expect(dateSortKey("31/04/2026")).toBe("");
  });

  it("aceita 29 de fevereiro em ano bissexto", () => {
    expect(isRealDate(2024, 2, 29)).toBe(true);
    expect(dateSortKey("29/02/2024")).toBe("2024-02-29");
  });

  it("não altera a data por fuso horário", () => {
    expect(dateSortKey("01/01/2026")).toBe("2026-01-01");
  });
});

describe("evolução", () => {
  it("ignora datas impossíveis em vez de criar avaliações", () => {
    const bio = bioSchema.parse({
      historico: [
        { data: "31/02/2026", peso: "80,0", massaMuscularEsqueletica: "", pgc: "" },
        { data: "10/03/2026", peso: "79,0", massaMuscularEsqueletica: "", pgc: "" },
      ],
    });
    const result = computeEvolution(bio);
    expect(result.points).toHaveLength(1);
    expect(result.ignoredDates).toContain("31/02/2026");
    expect(result.hasTrend).toBe(false);
  });

  it("preserva a transcrição literal na tabela", () => {
    const bio = bioSchema.parse({
      historico: [{ data: "10/03/2026", peso: "70,0", massaMuscularEsqueletica: "34,50", pgc: "34,0" }],
    });
    const result = computeEvolution(bio);
    expect(result.points[0]!.literal).toEqual({ peso: "70,0", massaMuscular: "34,50", pgc: "34,0" });
  });

  it("junta linhas complementares da mesma data sem perder valores", () => {
    const bio = bioSchema.parse({
      historico: [
        { data: "10/03/2026", peso: "70,0", massaMuscularEsqueletica: "", pgc: "" },
        { data: "10/03/2026", peso: "", massaMuscularEsqueletica: "34,5", pgc: "30,0" },
      ],
    });
    const result = computeEvolution(bio);
    expect(result.points).toHaveLength(1);
    expect(result.points[0]!.literal).toEqual({ peso: "70,0", massaMuscular: "34,5", pgc: "30,0" });
    expect(result.conflicts).toHaveLength(0);
  });

  it("sinaliza conflitos em vez de os resolver em silêncio", () => {
    const bio = bioSchema.parse({
      historico: [
        { data: "10/03/2026", peso: "70,0", massaMuscularEsqueletica: "", pgc: "" },
        { data: "10/03/2026", peso: "72,0", massaMuscularEsqueletica: "", pgc: "" },
      ],
    });
    const result = computeEvolution(bio);
    expect(result.points[0]!.literal.peso).toBe("70,0");
    expect(result.conflicts.join(" ")).toContain("valores diferentes de peso");
  });

  it("compara PGC em pontos percentuais", () => {
    const result = computeEvolution(fixtureBio);
    expect(result.summaryLines.join(" ")).toContain("p.p.");
  });
});

describe("HTML do paciente", () => {
  const html = renderProtocolHtml({
    patientName: fixtureJourney.patientName,
    objetivo: fixtureProtocolo.objetivo,
    anamnese: fixtureAnamnese,
    bio: fixtureBio,
    protocolo: fixtureProtocolo,
    draft: false,
    version: fixtureJourney.version,
  });

  it("é um documento completo e autossuficiente", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('charset="utf-8"');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("@import");
  });

  it("não expõe conteúdo interno", () => {
    expect(html).not.toContain("Pendência interna sintética");
    expect(html).not.toContain("Nota interna sintética");
  });

  it("mostra a TMB como número inteiro", () => {
    expect(html).toContain("1.365");
    expect(html).not.toContain("1,365");
  });
});

describe("valores ambíguos e alinhamento de tabelas", () => {
  it("nunca multiplica a TMB por dez ao encontrar um decimal", () => {
    expect(integerValue("1365,0")).not.toBe("13.650");
    expect(integerValue("1365,0")).toBe("1365,0");
    expect(integerValue("1365.0")).toBe("1365.0");
    expect(needsNumberReview("1365,0")).toBe(true);
    expect(needsNumberReview("1365")).toBe(false);
  });

  it("remove colunas sem cabeçalho SEM deslocar as células", () => {
    const html = renderProtocolHtml({
      patientName: "Paciente Sintético Um",
      objetivo: fixtureProtocolo.objetivo,
      anamnese: fixtureAnamnese,
      bio: fixtureBio,
      protocolo: {
        ...fixtureProtocolo,
        sections: [
          {
            title: "Tabela",
            blocks: [
              {
                kind: "table",
                columns: ["Substância", "", "Dose"],
                rows: [["Vitamina D", "ignorar", "1000 UI"]],
              },
            ],
          },
        ],
      } as never,
      draft: false,
      generatedAt: "11/09/2026",
      version: 1,
    });
    const linha = /<tr><td[^>]*>Vitamina D<\/td><td[^>]*>([^<]*)<\/td>/.exec(html);
    expect(linha?.[1]).toBe("1000 UI");
    expect(html).not.toContain("ignorar");
  });

  it("protocolo sem conteúdo renderizável é detetado", () => {
    expect(
      protocoloTemConteudoRenderizavel({
        ...fixtureProtocolo,
        sections: [{ title: "Vazia", blocks: [] }],
      } as never),
    ).toBe(false);
    expect(protocoloTemConteudoRenderizavel(fixtureProtocolo)).toBe(true);
  });

  it("datas inválidas com valores são sinalizadas para correção explícita", () => {
    const result = computeEvolution({
      ...fixtureBio,
      historico: [{ data: "31/02/2026", peso: "80,0", massaMuscularEsqueletica: "", pgc: "" }],
    } as never);
    expect(result.ignoredDatesWithValues).toContain("31/02/2026");
  });
});
