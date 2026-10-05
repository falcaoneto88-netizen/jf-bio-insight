/**
 * Dados FICTÍCIOS. Nenhuma chamada real de IA, nenhum registo de paciente.
 * Cobre os 3 blocos do protocolo: tabela geral, prescrição oral e injetável.
 */
import { describe, expect, it } from "vitest";

import { buildProtocolSections, PROTOCOL_GENERATOR_VERSION } from "./protocol-ai";
import {
  buildPrescriptionSections,
  emittedPrescriptions,
  prescriptionIssues,
  withoutPrescriptionSections,
  INJECTABLE_SECTION_ID,
  LEGACY_PRESCRIPTION_SECTION_ID,
  ORAL_SECTION_ID,
} from "./prescription-sections";
import {
  generalCategoryValue,
  missingSubstitutionCategories,
  updateGeneralCategory,
} from "./substitution-categories";
import {
  applyPrescriptionRules,
  protocolEssentialIssues,
  rebuildPrescriptionSection,
  requiresGeneralSubstitutionCategories,
  applyProtocolIntegrity,
  generalSubstitutionRows,
  prescriptionSignature,
} from "./protocol-quality";
import { reviewIssues } from "./core.server";
import { fixtureJourney } from "./__fixtures__/jornada-sintetica";
import { protocolSchema, type PrescriptionEntry, type Protocolo } from "./types";
import { renderProtocolSections } from "./html";

const oral: PrescriptionEntry = {
  grupo: "oral",
  substancia: "Substância fictícia A",
  dose: "10 mg",
  via: "oral",
  frequencia: "1x/dia",
  horario: "08:00",
  observacoes: "Com alimento",
  confirmada: true,
};

const injetavel: PrescriptionEntry = {
  grupo: "injetavel",
  substancia: "Substância fictícia B",
  dose: "1 ml",
  via: "intramuscular",
  frequencia: "1x/semana",
  horario: "",
  observacoes: "",
  confirmada: true,
};

function base(over: Partial<Protocolo> = {}): Protocolo {
  return protocolSchema.parse({
    objetivo: "hipertrofia",
    instrucoes: "Instruções fictícias.",
    locale: "pt-BR",
    generator: PROTOCOL_GENERATOR_VERSION,
    ...over,
  });
}

const categoriasCompletas = [
  { label: "Proteínas", options: ["Frango 120 g"] },
  { label: "Carboidratos", options: ["Arroz 100 g"] },
  { label: "Gorduras boas", options: ["Azeite 10 ml"] },
  { label: "Frutas", options: ["Banana 1 unidade"] },
];

describe("edição direta e integridade dos blocos", () => {
  it("edita somente a categoria escolhida, sem perder refeições, extras ou tabelas personalizadas", () => {
    const original = base({
      sections: [
        {
          id: "refeicoes",
          kind: "meals",
          title: "Plano alimentar",
          blocks: [{ type: "paragraph", text: "Refeição original" }],
        },
        {
          id: "substituicoes",
          kind: "substitutions",
          title: "Tabela geral",
          blocks: [
            {
              type: "table",
              columns: ["Categoria", "Opções"],
              rows: [
                ["Proteínas", "Opção A"],
                ["Vegetais", "Vegetal fictício"],
              ],
            },
            { type: "paragraph", text: "Observação a preservar" },
            {
              type: "table",
              columns: ["Categoria", "Opções", "Nota"],
              rows: [["Frutas", "Fruta anterior", "Nota extra"]],
            },
          ],
        },
      ],
    });
    const before = JSON.stringify(original);
    const next = {
      ...original,
      sections: updateGeneralCategory(original, "proteinas", "Opção B; Opção C"),
    };
    expect(generalCategoryValue(next, "proteinas")).toBe("Opção B; Opção C");
    expect(next.sections[0]).toEqual(original.sections[0]);
    expect(next.sections[1].blocks.slice(1)).toEqual(original.sections[1].blocks.slice(1));
    expect(JSON.stringify(next)).toContain("Vegetal fictício");
    expect(JSON.stringify(original)).toBe(before);
    expect(applyProtocolIntegrity(original, next)?.regenerationRequired).not.toBe(true);
  });

  it.each(["pt-BR", "es", "en"] as const)(
    "cria e reconhece as quatro categorias em %s",
    (locale) => {
      let p = base({ locale });
      for (const key of ["proteinas", "carboidratos", "gorduras", "frutas"] as const) {
        p = { ...p, sections: updateGeneralCategory(p, key, `Opção fictícia ${key}`) };
      }
      expect(missingSubstitutionCategories(generalSubstitutionRows(p))).toEqual([]);
      expect(protocolSchema.safeParse(p).success).toBe(true);
      p = { ...p, sections: updateGeneralCategory(p, "frutas", "") };
      expect(missingSubstitutionCategories(generalSubstitutionRows(p)).map((f) => f.key)).toEqual([
        "frutas",
      ]);
    },
  );

  it("não permite trocar v2 por v1 para dispensar categorias", () => {
    const current = base();
    const result = applyProtocolIntegrity(current, {
      ...current,
      generator: "protocolo-openai-2026-09-16-v1",
    })!;
    expect(result.generator).toBe(current.generator);
    expect(protocolEssentialIssues(result).join(" ")).toContain("Tabela geral");
  });

  it("distingue delimitadores e maiúsculas nos campos confirmados", () => {
    const previous = { ...oral, horario: "A|B", observacoes: "C" };
    const next = { ...oral, horario: "A", observacoes: "B|C" };
    expect(prescriptionSignature(previous)).not.toBe(prescriptionSignature(next));
    expect(applyPrescriptionRules([previous], [next])?.[0].confirmada).toBe(false);
    expect(applyPrescriptionRules([oral], [{ ...oral, dose: "10 MG" }])?.[0].confirmada).toBe(
      false,
    );
  });

  it("protocolo manual emite somente entradas completas e confirmadas e bloqueia parciais", () => {
    const p = base({
      generator: undefined,
      prescriptions: [oral, { ...injetavel, dose: "", confirmada: false }],
    });
    const rendered = rebuildPrescriptionSection(p);
    expect(rendered.sections.map((s) => s.id)).toEqual([ORAL_SECTION_ID]);
    expect(reviewIssues({ ...fixtureJourney, protocolo: p }).blocking.join(" ")).toContain(
      "falta dose",
    );
  });

  it("não modifica protocolo legado sem estrutura de prescrições", () => {
    const legacy = base({
      generator: undefined,
      prescriptions: undefined,
      sections: [
        {
          id: "antigo",
          title: "Nota anterior",
          blocks: [{ type: "paragraph", text: "Conteúdo preservado" }],
        },
      ],
    });
    expect(rebuildPrescriptionSection(legacy)).toBe(legacy);
  });
});

describe("tabela geral de substituições", () => {
  it("só vegetais e temperos é pendência no gerador novo", () => {
    const faltas = missingSubstitutionCategories([
      { label: "Vegetais", options: ["Brócolis à vontade"] },
      { label: "Temperos", options: ["Orégãos"] },
    ]);
    expect(faltas.map((f) => f.label)).toEqual([
      "Proteínas",
      "Carboidratos",
      "Gorduras boas",
      "Frutas",
    ]);
  });

  it("as 4 categorias presentes não geram pendência, extras são aceites", () => {
    expect(
      missingSubstitutionCategories([
        ...categoriasCompletas,
        { label: "Vegetais", options: ["Brócolis"] },
      ]),
    ).toEqual([]);
  });

  it("a exigência vale só para o gerador novo, não para documentos legados", () => {
    expect(requiresGeneralSubstitutionCategories(base())).toBe(true);
    expect(
      requiresGeneralSubstitutionCategories(base({ generator: "protocolo-openai-2026-09-16-v1" })),
    ).toBe(false);
  });

  it("uma geração nova só com vegetais aponta as categorias em falta", () => {
    const { pendencias } = buildProtocolSections(
      {
        objetivoResumo: "Resumo fictício.",
        refeicoes: [],
        orientacoesGerais: [],
        orientacoesAtividade: [],
        substituicoesGerais: [{ categoria: "Vegetais", opcoes: ["Brócolis"] }],
        pendencias: [],
      },
      { locale: "pt-BR", energy: null, prescriptions: [] },
    );
    expect(pendencias.join(" ")).toContain("falta a categoria Proteínas");
    expect(pendencias.join(" ")).toContain("falta a categoria Frutas");
  });
});

describe("blocos separados de prescrição", () => {
  it("oral e injetável saem em secções distintas, com identificadores próprios", () => {
    const sections = buildPrescriptionSections([oral, injetavel], "pt-BR");
    expect(sections.map((s) => s.id)).toEqual([ORAL_SECTION_ID, INJECTABLE_SECTION_ID]);
    expect(sections[0]?.title).toBe("Prescrição e suplementação oral");
    expect(sections[1]?.title).toBe("Prescrições injetáveis");
  });

  it("a tabela antiga nunca fica duplicada na reconstrução", () => {
    const antiga = base({
      prescriptions: [oral],
      sections: [
        {
          id: LEGACY_PRESCRIPTION_SECTION_ID,
          title: "Prescrições",
          kind: "prescription",
          blocks: [{ type: "paragraph", text: "Texto antigo" }],
        },
      ],
    });
    const refeita = rebuildPrescriptionSection(antiga);
    expect(refeita.sections.map((s) => s.id)).toEqual([ORAL_SECTION_ID]);
    expect(JSON.stringify(refeita.sections)).not.toContain("Texto antigo");
    expect(withoutPrescriptionSections(refeita.sections)).toEqual([]);
  });

  it("entradas parciais, sem nome, sem dose ou sem grupo não entram no documento", () => {
    const parciais: PrescriptionEntry[] = [
      { ...oral, substancia: "", confirmada: false },
      { ...oral, dose: "", confirmada: false },
      { ...oral, grupo: undefined, confirmada: false },
    ];
    expect(emittedPrescriptions(parciais)).toEqual([]);
    const issues = prescriptionIssues(parciais);
    expect(issues.join(" ")).toContain("sem substância indicada");
    expect(issues.join(" ")).toContain("falta dose");
    expect(issues.join(" ")).toContain("classificação pendente");
    expect(buildPrescriptionSections(parciais, "pt-BR")).toEqual([]);
  });

  it("a via nunca é deduzida pelo nome: sem grupo fica pendente", () => {
    const semGrupo: PrescriptionEntry = { ...injetavel, grupo: undefined };
    expect(prescriptionIssues([semGrupo]).join(" ")).toContain("classificação pendente");
    expect(emittedPrescriptions([semGrupo])).toEqual([]);
  });

  it("alterar qualquer campo, inclusive horário e observações, revoga a confirmação", () => {
    for (const patch of [
      { grupo: "injetavel" as const },
      { substancia: "Outra" },
      { dose: "20 mg" },
      { via: "sublingual" },
      { frequencia: "2x/dia" },
      { horario: "20:00" },
      { observacoes: "Em jejum" },
    ]) {
      const [depois] = applyPrescriptionRules([oral], [{ ...oral, ...patch }]) ?? [];
      expect(depois?.confirmada).toBe(false);
    }
    const [igual] = applyPrescriptionRules([oral], [{ ...oral }]) ?? [];
    expect(igual?.confirmada).toBe(true);
  });

  it("o limite de 60 entradas é aceite pelo schema e 61 é recusado", () => {
    const muitos = (n: number) => Array.from({ length: n }, () => ({ ...oral }));
    expect(() => protocolSchema.parse({ ...base(), prescriptions: muitos(60) })).not.toThrow();
    expect(() => protocolSchema.parse({ ...base(), prescriptions: muitos(61) })).toThrow();
  });

  it("nenhuma prescrição é criada pela IA a partir de doses relatadas", () => {
    const { sections } = buildProtocolSections(
      {
        objetivoResumo: "Paciente relata uso anterior de 10 mg de substância fictícia.",
        refeicoes: [],
        orientacoesGerais: ["Relato de suplemento fictício 5 g ao dia."],
        orientacoesAtividade: [],
        substituicoesGerais: categoriasCompletas.map((c) => ({
          categoria: c.label,
          opcoes: c.options,
        })),
        pendencias: [],
      },
      { locale: "pt-BR", energy: null, prescriptions: [] },
    );
    expect(sections.some((s) => s.kind === "prescription")).toBe(false);
  });
});

describe("documento final", () => {
  it("mantém campos e horários das duas tabelas, com títulos próprios", () => {
    const protocolo = rebuildPrescriptionSection(base({ prescriptions: [oral, injetavel] }));
    const html = renderProtocolSections(protocolo);
    expect(html).toContain("Prescrição e suplementação oral");
    expect(html).toContain("Prescrições injetáveis");
    expect(html).toContain("Via");
    expect(html).toContain("Horário");
    expect(html).toContain("08:00");
    expect(html).toContain("Substância fictícia B");
    expect(html).not.toContain("classificação pendente");
  });
});

describe("compatibilidade com documentos legados", () => {
  it("um protocolo sem os campos novos serializa exatamente na mesma forma", () => {
    const legado = {
      substancia: "Substância fictícia C",
      dose: "5 mg",
      via: "oral",
      frequencia: "1x/dia",
      observacoes: "",
      confirmada: true,
    };
    const antes = JSON.stringify(legado);
    const depois = JSON.stringify(
      protocolSchema.parse({ objetivo: "hipertrofia", prescriptions: [legado] }).prescriptions![0],
    );
    expect(depois).toBe(antes);
  });

  it("um protocolo legado não ganha pendências de categorias da tabela geral", () => {
    const legado = base({ generator: undefined, sections: [] });
    expect(protocolEssentialIssues(legado).join(" ")).not.toContain("Tabela geral");
  });
});
