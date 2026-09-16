import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { LOGO_DATA_URI, LOGO_SHA256, DOCUMENT_TEMPLATE_VERSION } from "./brand";
import {
  renderProtocolHtml,
  renderProtocolSections,
  protocoloTemConteudoRenderizavel,
} from "./html";
import { hideMealTimes, presentMeals } from "./meal-presentation";
import { protocolSchema } from "./types";
import { shortProtocolFixture, longProtocolFixture } from "./__fixtures__/protocol-visual";

const html = () => renderProtocolHtml(shortProtocolFixture());
function legacy(blocks: unknown[], title = "Plano alimentar") {
  return protocolSchema.parse({ sections: [{ id: "legacy", title, blocks }] });
}

describe("documento individual e identidade visual", () => {
  it("não reaproveita dados de um exame descartado ao marcar sem exame", () => {
    const fixture = shortProtocolFixture();
    fixture.bio = {
      ...fixture.bio,
      semExame: true,
      sexo: "SEXO_DESCARTADO",
      idadeAnos: "999",
      taxaMetabolicaBasalKcal: "9999",
    };
    const output = renderProtocolHtml(fixture);
    const visibleText = output.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, "");
    expect(visibleText).not.toMatch(/SEXO_DESCARTADO|999|Bioimpedância/);
    expect(output).toContain("38 anos");
  });
  it("isola dois pacientes e não injeta os dados da referência", () => {
    const a = html();
    const b = renderProtocolHtml(longProtocolFixture());
    expect(a).toContain("Paciente Fictícia Aurora");
    expect(a).not.toContain("Paciente Ficticio Bento");
    expect(b).toContain("Paciente Ficticio Bento");
    expect(b).not.toContain("Paciente Fictícia Aurora");
    expect(a).not.toContain("1876");
    expect(b).not.toContain("1523");
    for (const output of [a, b]) expect(output).not.toMatch(/roselys|bonaci/i);
    expect(a).toContain("A confirmar");
    expect(a).not.toContain("Nega alergias");
    expect(a).not.toContain("Meta calórica");
    expect(b).toContain("2.173 kcal/día");
  });
  it("embute duas cópias da marca original com hash verificável", () => {
    const original = readFileSync(
      new URL("../../../public/brand/dr-joao-falcao.png", import.meta.url),
    );
    expect(LOGO_DATA_URI).toBe(`data:image/png;base64,${original.toString("base64")}`);
    expect(createHash("sha256").update(original).digest("hex")).toBe(LOGO_SHA256);
    expect(html().match(/<img /g)).toHaveLength(2);
    expect(html()).toContain(DOCUMENT_TEMPLATE_VERSION);
    expect(html()).not.toMatch(/<script|@import|(?:src|href)="https?:/);
  });
  it("usa quantidade individual de refeições, preparo e substituições disponíveis", () => {
    expect(html().match(/class="meal-card"/g)).toHaveLength(2);
    expect(renderProtocolHtml(longProtocolFixture()).match(/class="meal-card"/g)).toHaveLength(7);
    expect(html()).toContain("Refeição 2 · Líquida");
    expect(html()).toContain("misturar por 5 minutos");
    expect(html()).not.toContain("<h4>Gordura</h4>");
    for (const title of ["Refeição 1 — não líquida", "Refeição 1: alimento com textura líquida"]) {
      const output = renderProtocolSections(
        legacy([{ type: "paragraph", text: "Alimento de teste" }], title),
      );
      expect(output).not.toContain("· Líquida");
    }
  });
  it("mantém horários de medicação, suplemento, trabalho e sono", () => {
    for (const time of ["07:35", "21:25", "09:00", "17:30", "06:20", "22:40"])
      expect(html()).toContain(time);
  });
  it("localiza rótulos e datas sem alterar a redação clínica confirmada", () => {
    const fixture = shortProtocolFixture();
    fixture.protocolo.locale = "en";
    const output = renderProtocolHtml(fixture);
    expect(output).toContain('<html lang="en">');
    expect(output).toContain("09/16/2026");
    expect(output).toContain("Meal 1");
    expect(output).toContain("Current medication");
    expect(output).toContain("A confirmar");
    expect(output).toContain("Alimento demonstrativo A");
    const es = renderProtocolHtml(longProtocolFixture());
    expect(es).toContain("Comida 1");
    expect(es).toContain("Fecha");
    expect(es).toContain("Sueño y energía");
  });
  it("ordena categorias sem perder outras seções clínicas", () => {
    const fixture = longProtocolFixture();
    fixture.protocolo.sections.reverse();
    const output = renderProtocolHtml(fixture);
    const positions = [
      "<h2>Anamnesis",
      "<h2>Bioimpedancia",
      "<h2>Objetivo",
      "<h2>Orientaciones",
      "<h2>Plan alimentario",
      "<h2>Tabla general",
      "<h2>Prescripción",
      "<h2>Seguimiento",
    ].map((t) => output.indexOf(t));
    expect(positions.every((i) => i > 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
  it("escapa conteúdo fornecido e não expõe instruções internas", () => {
    const f = shortProtocolFixture();
    f.patientName = '<script>alert("x")</script>';
    f.protocolo.instrucoes = "INTERNAL_ONLY";
    f.protocolo.pendencias = ["PRIVATE_PENDING"];
    const output = renderProtocolHtml(f);
    expect(output).toContain("&lt;script&gt;");
    expect(output).not.toContain("<script>");
    expect(output).not.toContain("INTERNAL_ONLY");
    expect(output).not.toContain("PRIVATE_PENDING");
  });
  it("fragmenta células extensas sem perder nem misturar doses de linhas diferentes", () => {
    const cells = Array.from({ length: 8 }, (_, i) => `COLUNA_${i} ` + `valor${i} `.repeat(75));
    const p = legacy(
      [
        {
          type: "table",
          columns: cells.map((_, i) => `Campo ${i}`),
          rows: [cells, ["Medicamento seguinte", "Dose seguinte"]],
        },
      ],
      "Prescrição",
    );
    const output = renderProtocolSections(p);
    const rows = [...output.matchAll(/<tr>(.*?)<\/tr>/g)]
      .slice(1)
      .map((match) =>
        [...match[1].matchAll(/<td>(.*?)<\/td>/g)].map((cell) => cell[1].replace(/<[^>]+>/g, "")),
      );
    const last = rows.pop();
    expect(last?.[0]).toBe("Medicamento seguinte");
    expect(last?.[1]).toBe("Dose seguinte");
    cells.forEach((original, i) => expect(rows.map((row) => row[i]).join("")).toBe(original));
  });
  it("não modifica hashes antigos por acrescentar defaults opcionais ao ler", () => {
    const old = {
      templateVersion: "modelo-protocolo-v1",
      objetivo: "recomposicao",
      instrucoes: "",
      sections: [{ id: "s", title: "Nota", blocks: [{ type: "paragraph", text: "Texto" }] }],
      pendencias: [],
    };
    expect(protocolSchema.parse(old)).toEqual(old);
  });
});

describe("horários de refeições legadas", () => {
  it("encontra refeições em seção genérica mantendo os horários da rotina em seu bloco", () => {
    const p = legacy(
      [
        { type: "paragraph", text: "Trabalho das 09:00 às 17:30; dormir às 22:40." },
        {
          type: "paragraph",
          text: "07:15 — Café da manhã: Alimento A 100 g\n12:25 — Almoço: Alimento B 150 g",
        },
      ],
      "Protocolo individual",
    );
    const output = renderProtocolSections(p);
    expect(output.match(/class="meal-card"/g)).toHaveLength(2);
    expect(output).not.toMatch(/07:15|12:25/);
    for (const time of ["09:00", "17:30", "22:40"]) expect(output).toContain(time);
  });
  it("preserva duração de preparo e elimina campos de horário opcionais vazios", () => {
    expect(hideMealTimes("Às 07h, deixar de molho por 2h e cozinhar durante 1 hora.")).toBe(
      "deixar de molho por 2h e cozinhar durante 1 hora.",
    );
    const output = renderProtocolSections(
      legacy([
        {
          type: "table",
          columns: ["Alimento", "Horário (opcional)"],
          rows: [["Alimento de teste", "07:15 / 08:25"]],
        },
      ]),
    );
    expect(output).toContain("Alimento de teste");
    expect(output).not.toMatch(/Horário|07:15|08:25/);
  });
  it.each([
    "07:15",
    "7h",
    "7h30",
    "07:15–08:25",
    "das 7 às 8 horas",
    "entre 07:15 e 08:25",
    "7 a 8h",
    "7 am – 8 am",
    "Horário: 7",
    "Horário:",
  ])("oculta %s e preserva porção e duração", (time) => {
    const result = hideMealTimes(`${time}\nAlimento X — 120 g. Preparar por 10 minutos.`);
    expect(result).toBe("Alimento X — 120 g. Preparar por 10 minutos.");
  });
  it("converte tabela antiga em cards e elimina a coluna de horário por índice", () => {
    const p = legacy([
      {
        type: "table",
        columns: ["Refeição", "Horário", "Alimento", "Porção"],
        rows: [
          ["Café da manhã", "07:15", "Alimento A", "120 g"],
          ["Refeição 5 — Líquida", "18:25–19:35", "Alimento B", "150 ml"],
        ],
      },
    ]);
    const before = JSON.stringify(p);
    const output = renderProtocolSections(p);
    expect(output.match(/class="meal-card"/g)).toHaveLength(2);
    expect(output).toContain("Refeição 2 · Líquida");
    expect(output).not.toMatch(/07:15|18:25|19:35|Horário|Café da manhã/);
    expect(output).toContain("120 g");
    expect(output).toContain("150 ml");
    expect(JSON.stringify(p)).toBe(before);
  });
  it("numera títulos antigos e remove horários também de texto, listas e notas", () => {
    const p = legacy(
      [
        { type: "paragraph", text: "Consumir às 07:15. Alimento A — 100 g." },
        { type: "list", items: ["08:25 — Alimento B — 90 g"] },
        { type: "patientNote", text: "Horário: 09:35" },
      ],
      "Café da manhã — 06:05",
    );
    const output = renderProtocolSections(p);
    expect(output).toContain("Refeição 1");
    expect(output).not.toMatch(/06:05|07:15|08:25|09:35|Horário|Café da manhã/);
    expect(output).toContain("100 g");
    expect(output).toContain("90 g");
  });
  it("separa várias refeições históricas dentro de parágrafo ou lista", () => {
    for (const block of [
      {
        type: "paragraph",
        text: "Refeição 1 — 07:15\nAlimento A 100 g\nRefeição 2 — 13h\nAlimento B 200 g",
      },
      {
        type: "list",
        items: ["Café da manhã 07:15: Alimento A 100 g", "Jantar às 20h: Alimento B 200 g"],
      },
    ]) {
      const p = legacy([block]);
      const output = renderProtocolSections(p);
      expect(presentMeals(p.sections[0])).toHaveLength(2);
      expect(output).not.toMatch(/07:15|13h|20h/);
      expect(output).toContain("Alimento A 100 g");
      expect(output).toContain("Alimento B 200 g");
    }
  });
  it("não aceita um plano composto apenas por horário como conteúdo visível", () => {
    expect(
      protocoloTemConteudoRenderizavel(legacy([{ type: "paragraph", text: "Horário: 07:15" }])),
    ).toBe(false);
  });
});

describe("documento dos protocolos gerados", () => {
  const gerado = (over: Partial<ReturnType<typeof shortProtocolFixture>> = {}) => {
    const fixture = shortProtocolFixture();
    fixture.protocolo = protocolSchema.parse({
      ...fixture.protocolo,
      objetivo: "hipertrofia",
      generator: "protocolo-openai-2026-09-16-v1",
    });
    fixture.objetivo = "hipertrofia";
    return renderProtocolHtml({ ...fixture, ...over });
  };

  it("usa o título «Protocolo avançado de …» e um único objetivo", () => {
    const output = gerado();
    expect(output).toContain("Protocolo avançado de Hipertrofia");
    expect(output.match(/Protocolo avançado de/g)?.length).toBeGreaterThan(0);
  });

  it("indica campos ausentes em vez de os esconder", () => {
    const fixture = shortProtocolFixture();
    fixture.protocolo = protocolSchema.parse({
      ...fixture.protocolo,
      generator: "protocolo-openai-2026-09-16-v1",
    });
    fixture.bio = { ...fixture.bio, semExame: true };
    const output = renderProtocolHtml(fixture);
    expect(output).toContain("Não informado");
  });

  it("repete paciente, versão e rascunho no rodapé de todas as páginas", () => {
    const output = gerado({ draft: true, version: 7 });
    const page = /@bottom-center \{ content: "([^"]*)"/.exec(output)?.[1] ?? "";
    expect(page).toContain("Paciente Fictícia Aurora");
    expect(page).toContain("7");
    expect(page.toLowerCase()).toContain("rascunho");
  });

  it("não repete o logotipo grande final na impressão dos protocolos novos", () => {
    expect(gerado()).toContain("@media print { .doc-footer { display: none; } }");
    // O documento legado mantém o rodapé com a marca.
    expect(renderProtocolHtml(shortProtocolFixture())).not.toContain(".doc-footer { display: none");
    expect(gerado().match(/<img /g)).toHaveLength(2);
  });

  it("nomes maliciosos não escapam da folha de estilo nem do título", () => {
    const output = gerado({
      patientName: 'Fictício" } </style><script>alert(1)</script><style>{',
      draft: true,
      version: 2,
    });
    expect(output).not.toMatch(/<script/);
    const styles = output.match(/<style>([\s\S]*?)<\/style>/g) ?? [];
    expect(styles).toHaveLength(1);
    expect(styles[0]!.slice(7, -8)).not.toContain("</style>");
  });
});
