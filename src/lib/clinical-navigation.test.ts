import { describe, expect, it } from "vitest";

import {
  consultationPrimaryAction,
  consultationReportState,
  journeyCompletedSteps,
  journeyInitialStep,
  journeyNaturalStep,
} from "./clinical-navigation";
import { fixtureJourney } from "./journey/__fixtures__/jornada-sintetica";

const analysis = (overrides: Record<string, unknown> = {}) => ({
  id: "analise-ficticia",
  version: 4,
  approvedVersion: null,
  sourceCurrent: true,
  confirmations: { anamnese: true, bio: true, revisao: true },
  protocolo: fixtureJourney.protocolo,
  ...overrides,
});

const readyInput = {
  analysisPending: false,
  analysisError: false,
  hasReceivedAnamnesis: true,
  selectedAnamnesisApplied: true,
  hasClinicalData: true,
  hasBodyComposition: true,
};

describe("próxima ação da consulta", () => {
  it("mantém carregamento e erro separados de ausência de análise", () => {
    expect(
      consultationPrimaryAction({ ...readyInput, analysisPending: true, analysis: null }).kind,
    ).toBe("analysis-loading");
    expect(
      consultationPrimaryAction({ ...readyInput, analysisError: true, analysis: null }).kind,
    ).toBe("analysis-error");
  });

  it("permite iniciar análise sem bio quando já há dados clínicos", () => {
    expect(
      consultationPrimaryAction({
        ...readyInput,
        analysis: null,
        hasBodyComposition: false,
      }).kind,
    ).toBe("start-analysis");
  });

  it("prioriza a revisão da fonte desatualizada", () => {
    expect(
      consultationPrimaryAction({
        ...readyInput,
        analysis: analysis({ sourceCurrent: false, approvedVersion: 4 }),
      }).kind,
    ).toBe("refresh-analysis");
  });

  it("não apresenta aprovação de versão antiga como atual", () => {
    expect(
      consultationPrimaryAction({
        ...readyInput,
        analysis: analysis({ version: 5, approvedVersion: 4 }),
      }).kind,
    ).toBe("continue-analysis");
  });

  it("destaca respostas recebidas ainda não aplicadas", () => {
    expect(
      consultationPrimaryAction({
        ...readyInput,
        analysis: null,
        selectedAnamnesisApplied: false,
      }).kind,
    ).toBe("review-received");
  });
});

describe("progresso persistido da jornada", () => {
  it("mantém etapas confirmadas concluídas ao voltar visualmente", () => {
    const journey = {
      ...fixtureJourney,
      version: 7,
      approvedVersion: null,
      sourceCurrent: true,
      confirmations: { anamnese: true, bio: true, revisao: true },
    };
    const completed = journeyCompletedSteps(journey);
    expect([...completed]).toEqual([1, 2, 3, 4]);
    expect(journeyNaturalStep(journey)).toBe(5);
  });

  it("não marca aprovação antiga ou fonte desatualizada como concluída", () => {
    const oldApproval = { ...fixtureJourney, version: 8, approvedVersion: 7 };
    const staleSource = {
      ...fixtureJourney,
      version: 8,
      approvedVersion: 8,
      sourceCurrent: false,
    };
    expect(journeyCompletedSteps(oldApproval).has(5)).toBe(false);
    expect(journeyCompletedSteps(staleSource).has(5)).toBe(false);
    expect(journeyNaturalStep(staleSource)).toBe(5);
  });

  it("marca a aprovação atual sem declarar a etapa HTML concluída", () => {
    const approved = {
      ...fixtureJourney,
      version: 8,
      approvedVersion: 8,
      sourceCurrent: true,
    };
    const completed = journeyCompletedSteps(approved);
    expect(completed.has(5)).toBe(true);
    expect(completed.has(6)).toBe(false);
    expect(journeyNaturalStep(approved)).toBe(6);
  });
});

describe("abertura direta na etapa do documento", () => {
  const draft = {
    ...fixtureJourney,
    version: 7,
    approvedVersion: null,
    sourceCurrent: true,
    confirmations: { anamnese: true, bio: true, revisao: true },
  };

  it("rascunho com protocolo persistido abre na etapa 6 sem concluir a aprovação", () => {
    expect(journeyInitialStep(draft, 6)).toBe(6);
    const completed = journeyCompletedSteps(draft);
    expect(completed.has(5)).toBe(false);
    expect(completed.has(6)).toBe(false);
    // Natural continua na aprovação: sem link, a jornada abre na etapa 5.
    expect(journeyInitialStep(draft, null)).toBe(5);
  });

  it("sem protocolo persistido, o pedido da etapa 6 não passa do ponto natural", () => {
    const semProtocolo = { ...draft, protocolo: null };
    expect(journeyInitialStep(semProtocolo, 6)).toBe(4);
  });

  it("versão obsoleta (aprovação antiga) abre como rascunho, nunca como final", () => {
    const obsoleta = { ...draft, version: 8, approvedVersion: 7 };
    expect(journeyInitialStep(obsoleta, 6)).toBe(6);
    expect(obsoleta.approvedVersion === obsoleta.version).toBe(false);
    expect(journeyCompletedSteps(obsoleta).has(5)).toBe(false);
  });

  it("pedido de etapa intermediária continua limitado ao ponto natural", () => {
    expect(journeyInitialStep(draft, 3)).toBe(3);
    const inicio = {
      ...draft,
      protocolo: null,
      confirmations: { anamnese: false, bio: false, revisao: false },
    };
    expect(journeyInitialStep(inicio, 5)).toBe(1);
  });
});

describe("estado do relatório atual", () => {
  const input = { analysisPending: false, analysisError: false };
  it("reconhece protocolo aprovado sem depender de PDFs históricos", () => {
    expect(consultationReportState({ ...input, analysis: analysis({ approvedVersion: 4 }) })).toBe(
      "approved",
    );
  });
  it("distingue rascunho, ausência de protocolo e ausência de análise", () => {
    expect(consultationReportState({ ...input, analysis: analysis() })).toBe("draft");
    expect(consultationReportState({ ...input, analysis: analysis({ protocolo: null }) })).toBe(
      "missing",
    );
    expect(consultationReportState({ ...input, analysis: null })).toBe("missing");
  });
  it("não anuncia impressão para aprovação antiga ou fonte desatualizada", () => {
    expect(consultationReportState({ ...input, analysis: analysis({ approvedVersion: 3 }) })).toBe(
      "draft",
    );
    expect(
      consultationReportState({
        ...input,
        analysis: analysis({ approvedVersion: 4, sourceCurrent: false }),
      }),
    ).toBe("stale");
  });
  it("não confunde carregamento e erro com protocolo ausente", () => {
    expect(consultationReportState({ ...input, analysisPending: true })).toBe("loading");
    expect(
      consultationReportState({
        ...input,
        analysisError: true,
        analysis: analysis({ approvedVersion: 4 }),
      }),
    ).toBe("error");
  });
});
