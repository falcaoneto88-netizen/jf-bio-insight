/** Todos os dados são FICTÍCIOS. Nenhuma chamada real de IA é feita nestes testes. */
import { describe, expect, it } from "vitest";

import { computeEnergyPlan, cunninghamBmr, resolveFfm } from "./energy";
import { buildProtocolContext, protocoloGerado, type ProtocolAiOutput } from "./protocol-ai";
import { gerarProtocolo } from "./protocol-generation.server";
import { protocolCompletenessIssues, isGeneratedProtocol } from "./protocol-quality";
import { renderProtocolHtml } from "./html";
import { emptyAnamnese, emptyBio, protocolSchema, type Anamnese, type Bio } from "./types";

const anamnese = (): Anamnese => ({
  ...emptyAnamnese,
  header: {
    paciente: "Paciente Fictício",
    dataConsulta: "16/09/2026",
    nascimentoOuIdade: "40",
    telefone: "900000000",
    email: "ficticio@example.com",
  },
  alergias: { ...emptyAnamnese.alergias, alimentares: "Amendoim" },
  alimentacao: { ...emptyAnamnese.alimentacao, refeicoes: "4" },
  habitos: { ...emptyAnamnese.habitos, treino: "Sim", horario: "07:00" },
  medicacoesEmUso: [
    { nome: "Substância fictícia", dose: "10 mg", frequencia: "1x/dia", horario: "08:00", motivo: "Relato" },
  ],
});

const bio = (): Bio => ({
  ...emptyBio,
  paciente: "Paciente Fictício",
  sexo: "F",
  idadeAnos: "40",
  alturaM: "1,65",
  dataHoraExame: "16/09/2026",
  taxaMetabolicaBasalKcal: "1365",
  nivelGorduraVisceral: "6",
  massaLivreGorduraKg: "45,0",
  massaGorduraKg: "20,0",
  historico: [
    { data: "16/06/2026", peso: "68,0", massaMuscularEsqueletica: "25,0", pgc: "32,0" },
    { data: "16/09/2026", peso: "65,0", massaMuscularEsqueletica: "25,5", pgc: "30,0" },
  ],
});

function meal(n: number) {
  return {
    liquida: false,
    alimentos: [
      { nome: `Proteína fictícia ${n}`, quantidade: "120 g cozido" },
      { nome: `Carboidrato fictício ${n}`, quantidade: "80 g cru" },
      { nome: "Azeite", quantidade: "10 ml" },
    ],
    preparo: "Cozinhar por 2 horas em fogo baixo",
    substituicoes: {
      proteina: ["Opção A", "Opção B", "Opção C"],
      carboidrato: ["Opção D", "Opção E", "Opção F"],
      gordura: ["Opção G", "Opção H", "Opção I"],
    },
  };
}

const output = (meals = 4): ProtocolAiOutput => ({
  objetivoResumo: "Resumo fictício do objetivo.",
  orientacoesGerais: ["Beber água ao longo do dia."],
  orientacoesAtividade: ["Manter a atividade já relatada."],
  refeicoes: Array.from({ length: meals }, (_, i) => meal(i + 1)),
  substituicoesGerais: [{ categoria: "Proteínas", opcoes: ["Opção A", "Opção B"] }],
  prescricoes: [],
  pendencias: [],
});

const journey = () => ({ anamnese: anamnese(), bio: bio(), protocolo: null });
const config = () => ({ apiKey: "ficticia", model: "gpt-5.4" });
const request = {
  objetivo: "recomposicao" as const,
  instrucoes: "Instruções fictícias.",
  mealCount: 4,
  energyInput: { activityFactor: "1,5", factorReviewed: true, adjustmentPercent: "-20" },
};

describe("cálculo energético", () => {
  it("usa Cunningham com a MLG do exame", () => {
    expect(cunninghamBmr(45)).toBe(1490);
    const ffm = resolveFfm({ ffmKg: "45,0", pesoKg: "65,0", pgc: "30,0" });
    expect(ffm).toMatchObject({ ffmKg: 45, origin: "exame" });
  });

  it("deriva a MLG do peso e do PGC quando não há valor no exame", () => {
    const ffm = resolveFfm({ ffmKg: "", pesoKg: "65,0", pgc: "30,0" });
    expect(ffm?.origin).toBe("derivada");
    expect(ffm?.ffmKg).toBe(45.5);
  });

  it("não calcula sem fator revisto", () => {
    const result = computeEnergyPlan({
      objetivo: "recomposicao",
      ffm: resolveFfm({ ffmKg: "45", pesoKg: "", pgc: "" }),
      input: { activityFactor: "1,5" },
    });
    expect(result.plan).toBeNull();
    expect(result.pendencias.join(" ")).toContain("fator de atividade");
  });

  it("aplica manutenção na hipertrofia e exige 15–25% na recomposição", () => {
    const hiper = computeEnergyPlan({
      objetivo: "hipertrofia",
      ffm: resolveFfm({ ffmKg: "45", pesoKg: "", pgc: "" }),
      input: { activityFactor: "1,5", factorReviewed: true, adjustmentPercent: "10" },
    });
    expect(hiper.plan?.adjustmentPercent).toBe(0);
    expect(hiper.plan?.targetKcal).toBe(hiper.plan?.maintenanceKcal);
    expect(hiper.pendencias.join(" ")).toContain("manutenção");

    const fora = computeEnergyPlan({
      objetivo: "recomposicao",
      ffm: resolveFfm({ ffmKg: "45", pesoKg: "", pgc: "" }),
      input: { activityFactor: "1,5", factorReviewed: true, adjustmentPercent: "5" },
    });
    expect(fora.plan).toBeNull();

    const emagrecimento = computeEnergyPlan({
      objetivo: "emagrecimento",
      ffm: resolveFfm({ ffmKg: "45", pesoKg: "", pgc: "" }),
      input: { activityFactor: "1,5", factorReviewed: true },
    });
    expect(emagrecimento.plan).toBeNull();
  });

  it("a meta escrita pelo profissional substitui o cálculo", () => {
    const { plan } = computeEnergyPlan({
      objetivo: "emagrecimento",
      ffm: resolveFfm({ ffmKg: "45", pesoKg: "", pgc: "" }),
      input: {
        activityFactor: "1,5",
        factorReviewed: true,
        adjustmentPercent: "-15",
        professionalTarget: "1800",
      },
    });
    expect(plan?.source).toBe("profissional");
    expect(plan?.targetKcal).toBe(1800);
  });
});

describe("contexto enviado à IA", () => {
  it("não inclui nome, telefone nem e-mail nos campos estruturados", () => {
    const context = buildProtocolContext({
      objetivo: "recomposicao",
      locale: "pt-BR",
      instrucoes: "Instruções fictícias.",
      mealCount: 4,
      energy: null,
      anamnese: anamnese(),
      bio: bio(),
    });
    const json = JSON.stringify(context);
    expect(json).not.toContain("Paciente Fictício");
    expect(json).not.toContain("900000000");
    expect(json).not.toContain("ficticio@example.com");
    expect(json).toContain("Amendoim");
    expect(json).toContain("massaLivreGorduraKg");
  });
});

describe("geração do protocolo", () => {
  it("produz um protocolo completo sem pendências bloqueantes", async () => {
    const result = await gerarProtocolo(journey(), request, {
      config,
      generate: async () => output(4),
    });
    expect(result.error).toBeNull();
    const protocolo = result.data!.protocolo;
    expect(isGeneratedProtocol(protocolo)).toBe(true);
    expect(protocolCompletenessIssues(protocolo)).toEqual([]);
    expect(result.data!.energy?.targetKcal).toBe(Math.round(1490 * 1.5 * 0.8));
    expect(protocolo.sections.map((s) => s.kind)).toEqual([
      "objective",
      "guidelines",
      "meals",
      "substitutions",
    ]);
  });

  it("sem OPENAI_API_KEY não gera e não recorre a outro fornecedor", async () => {
    let chamou = false;
    const result = await gerarProtocolo(journey(), request, {
      config: () => {
        throw new Error("sem chave");
      },
      generate: async () => {
        chamou = true;
        return output();
      },
    });
    expect(chamou).toBe(false);
    expect(result.data).toBeNull();
    expect(result.error).toContain("OPENAI_API_KEY");
  });

  it("bloqueia aprovação quando faltam substituições ou quantidades", async () => {
    const incompleto = output(2);
    incompleto.refeicoes[0].substituicoes.carboidrato = ["Só uma"];
    incompleto.refeicoes[1].alimentos[0].quantidade = "";
    const result = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 2 },
      { config, generate: async () => incompleto },
    );
    const issues = protocolCompletenessIssues(result.data!.protocolo);
    expect(issues.join(" ")).toContain("3 substituições de carboidrato");
    expect(issues.join(" ")).toContain("sem quantidade");
  });

  it("assinala divergência no número de refeições pedido", async () => {
    const result = await gerarProtocolo(journey(), request, {
      config,
      generate: async () => output(3),
    });
    expect(protocolCompletenessIssues(result.data!.protocolo).join(" ")).toContain(
      "Foram pedidas 4 refeições",
    );
  });

  it("duas consultas diferentes não partilham dados", async () => {
    const outra = {
      anamnese: { ...anamnese(), header: { ...anamnese().header, paciente: "Outro Fictício" } },
      bio: { ...bio(), massaLivreGorduraKg: "60,0" },
      protocolo: null,
    };
    const a = await gerarProtocolo(journey(), request, { config, generate: async () => output() });
    const b = await gerarProtocolo(outra, request, { config, generate: async () => output() });
    expect(a.data!.energy?.ffmKg).toBe(45);
    expect(b.data!.energy?.ffmKg).toBe(60);
  });
});

describe("documento", () => {
  const build = (locale: "pt-BR" | "es" | "en") =>
    renderProtocolHtml({
      patientName: "Paciente Fictício",
      objetivo: "recomposicao",
      anamnese: anamnese(),
      bio: bio(),
      protocolo: protocolSchema.parse(
        protocoloGerado({
          objetivo: "recomposicao",
          locale,
          instrucoes: "",
          mealCount: 4,
          energy: null,
          output: output(4),
        }),
      ),
      draft: true,
      version: 3,
    });

  it("numera refeições sem horários nos três idiomas e mantém horários clínicos", () => {
    for (const [locale, label] of [
      ["pt-BR", "Refeição 1"],
      ["es", "Comida 1"],
      ["en", "Meal 1"],
    ] as const) {
      const html = build(locale);
      expect(html).toContain(label);
      // Horário da medicação e duração de preparo permanecem.
      expect(html).toContain("08:00");
      expect(html).toContain("2 horas");
    }
  });

  it("não exporta pendências nem o método de cálculo para o documento", () => {
    const protocolo = protocolSchema.parse(
      protocoloGerado({
        objetivo: "recomposicao",
        locale: "pt-BR",
        instrucoes: "",
        mealCount: 4,
        energy: {
          method: "cunningham",
          ffmKg: 45,
          ffmOrigin: "exame",
          ffmFormula: "Massa livre de gordura do exame",
          bmrKcal: 1490,
          activityFactor: 1.5,
          factorReviewed: true,
          maintenanceKcal: 2235,
          adjustmentPercent: -20,
          targetKcal: 1788,
          source: "calculado",
        },
        output: { ...output(4), pendencias: ["Pendência interna fictícia"] },
      }),
    );
    const html = renderProtocolHtml({
      patientName: "Paciente Fictício",
      objetivo: "recomposicao",
      anamnese: anamnese(),
      bio: bio(),
      protocolo,
      draft: true,
      version: 1,
    });
    expect(html).not.toContain("Pendência interna fictícia");
    expect(html).not.toContain("cunningham");
    expect(html).toContain("1788 kcal/dia");
  });

  it("documentos legados sem gerador não são avaliados pela nova completude", () => {
    const legado = protocolSchema.parse({
      templateVersion: "modelo-protocolo-v1",
      objetivo: "hipertrofia",
      sections: [{ id: "s", title: "Orientações", blocks: [{ type: "paragraph", text: "Texto" }] }],
    });
    expect(isGeneratedProtocol(legado)).toBe(false);
  });
});
