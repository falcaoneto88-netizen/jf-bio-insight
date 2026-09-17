import { describe, expect, it } from "vitest";

import {
  consultationPrimaryAction,
  journeyCompletedSteps,
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
