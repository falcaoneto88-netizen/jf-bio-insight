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
import { missingSubstitutionCategories } from "./substitution-categories";
import {
  applyPrescriptionRules,
  protocolEssentialIssues,
  rebuildPrescriptionSection,
  requiresGeneralSubstitutionCategories,
} from "./protocol-quality";
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
      requiresGeneralSubstitutionCategories(
        base({ generator: "protocolo-openai-2026-09-16-v1" }),
      ),
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
