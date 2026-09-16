/** Todos os dados são FICTÍCIOS. Nenhuma chamada real de IA é feita nestes testes. */
import { describe, expect, it } from "vitest";

import {
  computeEnergyPlan,
  cunninghamBmr,
  energyInternalSummary,
  energyTargetLine,
  measuresForExam,
  parseCalorieTarget,
  resolveEnergyForBio,
  resolveFfmDetailed,
} from "./energy";
import { buildProtocolContext, protocoloGerado, type ProtocolAiOutput } from "./protocol-ai";
import { gerarProtocolo } from "./protocol-generation.server";
import {
  isGeneratedProtocol,
  preserveGeneratorMarker,
  protocolEssentialIssues,
  protocolOpenWarnings,
} from "./protocol-quality";
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
    {
      nome: "Substância fictícia",
      dose: "10 mg",
      frequencia: "1x/dia",
      horario: "08:00",
      motivo: "Relato",
    },
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
      { nome: `Proteína fictícia ${n}`, quantidade: "120 g", categoria: "proteina" as const },
      { nome: `Carboidrato fictício ${n}`, quantidade: "80 g", categoria: "carboidrato" as const },
      { nome: "Azeite", quantidade: "10 ml", categoria: "gordura" as const },
    ],
    preparo: "Cozinhar por 2 horas em fogo baixo",
    substituicoes: {
      proteina: ["Frango 120 g", "Peixe 130 g", "Ovos 3 unidades"],
      carboidrato: ["Arroz 80 g", "Batata 200 g", "Aveia 60 g"],
      gordura: ["Azeite 10 ml", "Abacate 50 g", "Castanhas 20 g"],
    },
  };
}

const output = (meals = 4): ProtocolAiOutput => ({
  objetivoResumo: "Resumo fictício do objetivo.",
  orientacoesGerais: ["Beber água ao longo do dia."],
  orientacoesAtividade: ["Manter a atividade já relatada."],
  refeicoes: Array.from({ length: meals }, (_, i) => meal(i + 1)),
  substituicoesGerais: [{ categoria: "Proteínas", opcoes: ["Frango 120 g", "Peixe 130 g"] }],
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
    const { ffm } = resolveFfmDetailed({ ffmExameKg: "45,0", pesoKg: "65,0", pgc: "30,0" });
    expect(ffm).toMatchObject({ ffmKg: 45, origin: "exame" });
  });

  it("deriva a MLG do peso e do PGC quando não há valor no exame", () => {
    const { ffm } = resolveFfmDetailed({ pesoKg: "65,0", pgc: "30,0" });
    expect(ffm?.origin).toBe("derivada");
    expect(ffm?.ffmKg).toBe(45.5);
  });

  it("MLG informada inválida não é substituída em silêncio pela derivação", () => {
    const { ffm, issues } = resolveFfmDetailed({
      ffmManualKg: "quarenta",
      pesoKg: "65,0",
      pgc: "30,0",
    });
    expect(ffm).toBeNull();
    expect(issues.join(" ")).toContain("não é um valor válido");
  });

  it("MLG maior do que o peso é conflito", () => {
    const { ffm, issues } = resolveFfmDetailed({ ffmExameKg: "80", pesoKg: "65,0" });
    expect(ffm).toBeNull();
    expect(issues.join(" ")).toContain("Conflito");
  });

  it("não calcula sem fator revisto e limita o fator", () => {
    const semRevisao = computeEnergyPlan({
      objetivo: "recomposicao",
      ffm: { ffmKg: 45, origin: "exame", formula: "Exame" },
      input: { activityFactor: "1,5" },
    });
    expect(semRevisao.plan).toBeNull();
    expect(semRevisao.pendencias.join(" ")).toContain("fator");

    const foraDeLimite = computeEnergyPlan({
      objetivo: "recomposicao",
      ffm: { ffmKg: 45, origin: "exame", formula: "Exame" },
      input: { activityFactor: "9", factorReviewed: true, adjustmentPercent: "-20" },
    });
    expect(foraDeLimite.plan).toBeNull();
  });

  it("aplica manutenção na hipertrofia e exige 15–25% na recomposição", () => {
    const hiper = computeEnergyPlan({
      objetivo: "hipertrofia",
      ffm: { ffmKg: 45, origin: "exame", formula: "Exame" },
      input: { activityFactor: "1,5", factorReviewed: true, adjustmentPercent: "10" },
    });
    expect(hiper.plan?.method).toBe("cunningham");
    if (hiper.plan?.method === "cunningham") {
      expect(hiper.plan.adjustmentPercent).toBe(0);
      expect(hiper.plan.targetKcal).toBe(hiper.plan.maintenanceKcal);
    }

    const fora = computeEnergyPlan({
      objetivo: "recomposicao",
      ffm: { ffmKg: 45, origin: "exame", formula: "Exame" },
      input: { activityFactor: "1,5", factorReviewed: true, adjustmentPercent: "5" },
    });
    expect(fora.plan).toBeNull();

    const emagrecimento = computeEnergyPlan({
      objetivo: "emagrecimento",
      ffm: { ffmKg: 45, origin: "exame", formula: "Exame" },
      input: { activityFactor: "1,5", factorReviewed: true },
    });
    expect(emagrecimento.plan).toBeNull();
  });

  it("nunca produz meta negativa nem ajuste absurdo", () => {
    const absurdo = computeEnergyPlan({
      objetivo: "emagrecimento",
      ffm: { ffmKg: 45, origin: "exame", formula: "Exame" },
      input: { activityFactor: "1,5", factorReviewed: true, adjustmentPercent: "-200" },
    });
    expect(absurdo.plan).toBeNull();
    expect(absurdo.pendencias.join(" ").length).toBeGreaterThan(0);
  });

  it("a meta escrita pelo profissional vale por si, sem MLG nem fator", () => {
    const { plan } = computeEnergyPlan({
      objetivo: "emagrecimento",
      ffm: null,
      input: {},
      professionalTarget: "1800 kcal/dia",
    });
    expect(plan?.method).toBe("profissional");
    expect(plan?.targetKcal).toBe(1800);
    expect(energyTargetLine(plan)).toContain("1800");
    expect(energyInternalSummary(plan).join(" ")).toContain("profissional");
    expect((plan as unknown as { ffmKg?: number }).ffmKg).toBeUndefined();
  });

  it("recusa metas inválidas em vez de as ignorar", () => {
    expect(parseCalorieTarget("0")).toBeNull();
    expect(parseCalorieTarget("-500")).toBeNull();
    expect(parseCalorieTarget("mais ou menos")).toBeNull();
    expect(parseCalorieTarget("1800")).toBe(1800);
    const { plan, pendencias } = computeEnergyPlan({
      objetivo: "hipertrofia",
      ffm: { ffmKg: 45, origin: "exame", formula: "Exame" },
      input: { activityFactor: "1,5", factorReviewed: true, professionalTarget: "0" },
    });
    expect(plan).toBeNull();
    expect(pendencias.join(" ")).toContain("meta calórica");
  });

  it("a meta do campo da interface é a mesma meta profissional (não é ignorada)", () => {
    const medidas: Bio = { ...bio(), massaLivreGorduraKg: "60,0" };
    const { plan } = resolveEnergyForBio({
      bio: medidas,
      objetivo: "hipertrofia",
      energyInput: { activityFactor: "1,5", factorReviewed: true },
      calorieTarget: "1800",
    });
    expect(plan?.targetKcal).toBe(1800);
  });
});

describe("medidas do histórico", () => {
  it("usa peso e PGC da MESMA data, não a posição na lista", () => {
    const b: Bio = {
      ...emptyBio,
      dataHoraExame: "16/09/2026",
      historico: [
        { data: "16/09/2026", peso: "80,0", massaMuscularEsqueletica: "", pgc: "20,0" },
        { data: "16/06/2026", peso: "60,0", massaMuscularEsqueletica: "", pgc: "30,0" },
      ],
    };
    const medidas = measuresForExam(b);
    expect(medidas.pesoKg).toBe("80,0");
    expect(medidas.pgc).toBe("20,0");
    const { plan } = resolveEnergyForBio({
      bio: b,
      objetivo: "hipertrofia",
      energyInput: { activityFactor: "1,0", factorReviewed: true },
    });
    expect(plan?.method).toBe("cunningham");
    if (plan?.method === "cunningham") expect(plan.ffmKg).toBe(64);
  });

  it("não empresta PGC de outra data", () => {
    const b: Bio = {
      ...emptyBio,
      dataHoraExame: "16/09/2026",
      historico: [
        { data: "16/09/2026", peso: "80,0", massaMuscularEsqueletica: "", pgc: "" },
        { data: "16/06/2026", peso: "60,0", massaMuscularEsqueletica: "", pgc: "30,0" },
      ],
    };
    expect(measuresForExam(b).pgc).toBe("");
  });

  it("não usa restos escondidos quando não houve exame", () => {
    const b: Bio = {
      ...emptyBio,
      semExame: true,
      historico: [{ data: "16/09/2026", peso: "80,0", massaMuscularEsqueletica: "", pgc: "20,0" }],
    };
    expect(measuresForExam(b)).toMatchObject({ pesoKg: "", pgc: "" });
  });

  it("valores em conflito na mesma data bloqueiam", () => {
    const b: Bio = {
      ...emptyBio,
      dataHoraExame: "16/09/2026",
      historico: [
        { data: "16/09/2026", peso: "80,0", massaMuscularEsqueletica: "", pgc: "20,0" },
        { data: "16/09/2026", peso: "70,0", massaMuscularEsqueletica: "", pgc: "20,0" },
      ],
    };
    expect(measuresForExam(b).issues.length).toBeGreaterThan(0);
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
  it("produz um protocolo completo sem pendências essenciais", async () => {
    const result = await gerarProtocolo(journey(), request, {
      config,
      generate: async () => output(4),
    });
    expect(result.error).toBeNull();
    const protocolo = result.data!.protocolo;
    expect(isGeneratedProtocol(protocolo)).toBe(true);
    expect(protocolEssentialIssues(protocolo)).toEqual([]);
    expect(result.data!.energy?.targetKcal).toBe(Math.round(1490 * 1.5 * 0.8));
  });

  it("sem OPENAI_API_KEY não gera, não gasta quota e não recorre a outro fornecedor", async () => {
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

  it("sem meta válida ou sem número de refeições não chama a IA", async () => {
    let chamou = false;
    const spy = async () => {
      chamou = true;
      return output();
    };
    const semMeta = await gerarProtocolo(
      journey(),
      { ...request, energyInput: { activityFactor: "1,5" } },
      { config, generate: spy },
    );
    expect(semMeta.data).toBeNull();
    const semRefeicoes = await gerarProtocolo(
      journey(),
      { ...request, mealCount: undefined },
      { config, generate: spy },
    );
    expect(semRefeicoes.error).toContain("refeições");
    expect(chamou).toBe(false);
  });

  it("bloqueia aprovação quando faltam substituições, quantidades ou porções vagas", async () => {
    const incompleto = output(2);
    incompleto.refeicoes[0]!.substituicoes.carboidrato = ["Só uma"];
    incompleto.refeicoes[1]!.alimentos[0]!.quantidade = "1 qualquer";
    const result = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 2 },
      { config, generate: async () => incompleto },
    );
    const issues = protocolEssentialIssues(result.data!.protocolo);
    expect(issues.join(" ")).toContain("substituições de carboidrato");
    expect(issues.join(" ")).toContain("porção válida");
  });

  it("substituições sem porção não passam, em qualquer idioma", async () => {
    const vago = output(1);
    vago.refeicoes[0]!.substituicoes.proteina = ["A", "B", "C"];
    const result = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 1, locale: "en" as const },
      { config, generate: async () => vago },
    );
    expect(protocolEssentialIssues(result.data!.protocolo).join(" ")).toContain("porção");
  });

  it("a gordura é exigida pela categoria do alimento, não por palavras", async () => {
    const semGordura = output(1);
    semGordura.refeicoes[0]!.alimentos = semGordura.refeicoes[0]!.alimentos.filter(
      (a) => a.categoria !== "gordura",
    );
    semGordura.refeicoes[0]!.substituicoes.gordura = [];
    const ok = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 1 },
      { config, generate: async () => semGordura },
    );
    expect(protocolEssentialIssues(ok.data!.protocolo).join(" ")).not.toContain("gordura");

    const comGordura = output(1);
    comGordura.refeicoes[0]!.substituicoes.gordura = ["Azeite 10 ml"];
    const falta = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 1 },
      { config, generate: async () => comGordura },
    );
    expect(protocolEssentialIssues(falta.data!.protocolo).join(" ")).toContain("gordura");
  });

  it("refeição líquida só quando indicada pelo profissional", async () => {
    const liquida = output(1);
    liquida.refeicoes[0]!.liquida = true;
    const semIndicacao = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 1 },
      { config, generate: async () => liquida },
    );
    expect(protocolEssentialIssues(semIndicacao.data!.protocolo).join(" ")).toContain("líquida");

    const indicada = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 1, liquidMealNumbers: [1] },
      { config, generate: async () => liquida },
    );
    expect(protocolEssentialIssues(indicada.data!.protocolo).join(" ")).not.toContain("líquida");
  });

  it("prescrições vêm do profissional e exigem confirmação individual", async () => {
    const semConfirmar = await gerarProtocolo(
      journey(),
      {
        ...request,
        prescriptions: [
          {
            substancia: "Substância fictícia",
            dose: "10 mg",
            via: "oral",
            frequencia: "1x/dia",
            observacoes: "",
            confirmada: false,
          },
        ],
      },
      { config, generate: async () => output(4) },
    );
    expect(protocolEssentialIssues(semConfirmar.data!.protocolo).join(" ")).toContain(
      "por confirmar",
    );

    const confirmada = await gerarProtocolo(
      journey(),
      {
        ...request,
        prescriptions: [
          {
            substancia: "Substância fictícia",
            dose: "10 mg",
            via: "oral",
            frequencia: "1x/dia",
            observacoes: "",
            confirmada: true,
          },
        ],
      },
      { config, generate: async () => output(4) },
    );
    expect(protocolEssentialIssues(confirmada.data!.protocolo)).toEqual([]);
    // A IA não inventa medicação: a secção vem das entradas confirmadas.
    expect(JSON.stringify(confirmada.data!.protocolo.sections)).toContain("Substância fictícia");
  });

  it("um rascunho incompleto pode ser gerado de novo", async () => {
    const incompleto = output(1);
    incompleto.refeicoes[0]!.substituicoes.proteina = [];
    const primeiro = await gerarProtocolo(
      journey(),
      { ...request, mealCount: 1 },
      { config, generate: async () => incompleto },
    );
    expect(protocolEssentialIssues(primeiro.data!.protocolo).length).toBeGreaterThan(0);
    const segundo = await gerarProtocolo(
      { anamnese: anamnese(), bio: bio(), protocolo: primeiro.data!.protocolo },
      request,
      { config, generate: async () => output(4) },
    );
    expect(segundo.error).toBeNull();
    expect(protocolEssentialIssues(segundo.data!.protocolo)).toEqual([]);
  });

  it("duas consultas diferentes não partilham dados", async () => {
    const outra = {
      anamnese: { ...anamnese(), header: { ...anamnese().header, paciente: "Outro Fictício" } },
      bio: { ...bio(), massaLivreGorduraKg: "60,0" },
      protocolo: null,
    };
    const a = await gerarProtocolo(journey(), request, { config, generate: async () => output() });
    const b = await gerarProtocolo(outra, request, { config, generate: async () => output() });
    const ffm = (plan: unknown) => (plan as { ffmKg?: number }).ffmKg;
    expect(ffm(a.data!.energy)).toBe(45);
    expect(ffm(b.data!.energy)).toBe(60);
  });
});

describe("pendências e marcador do gerador", () => {
  it("avisos podem ser marcados como revistos, pendências essenciais não", async () => {
    const comAviso = output(4);
    comAviso.pendencias = ["Aviso fictício para revisão"];
    const result = await gerarProtocolo(journey(), request, {
      config,
      generate: async () => comAviso,
    });
    const protocolo = result.data!.protocolo;
    expect(protocolOpenWarnings(protocolo)).toContain("Aviso fictício para revisão");
    const revisto = { ...protocolo, pendenciasResolvidas: ["Aviso fictício para revisão"] };
    expect(protocolOpenWarnings(revisto)).toEqual([]);

    const semRefeicoes = { ...protocolo, sections: [], pendenciasResolvidas: [] };
    expect(protocolEssentialIssues(semRefeicoes).length).toBeGreaterThan(0);
  });

  it("o marcador do gerador não pode ser removido numa gravação", async () => {
    const result = await gerarProtocolo(journey(), request, {
      config,
      generate: async () => output(4),
    });
    const atual = result.data!.protocolo;
    const semMarcador = { ...atual, generator: undefined };
    const gravado = preserveGeneratorMarker(atual, semMarcador);
    expect(isGeneratedProtocol(gravado)).toBe(true);
  });

  it("documentos legados sem gerador não são avaliados pela nova completude", () => {
    const legado = protocolSchema.parse({
      templateVersion: "modelo-protocolo-v1",
      objetivo: "hipertrofia",
      sections: [{ id: "s", title: "Orientações", blocks: [{ type: "paragraph", text: "Texto" }] }],
    });
    expect(isGeneratedProtocol(legado)).toBe(false);
    expect(preserveGeneratorMarker(legado, legado).generator).toBeUndefined();
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
});
