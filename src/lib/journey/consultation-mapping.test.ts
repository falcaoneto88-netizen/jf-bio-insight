import { describe, expect, it } from "vitest";
import { consultationToJourney } from "./consultation-mapping";
import { computeEvolution } from "./evolution";
import { emptyBodyComposition, emptyClinicalData } from "@/store/report-store";
import { emptyAnamnesis } from "@/lib/anamnesis/form";
import { mapAnamnesis } from "@/lib/consultations/mapping";

const answers = () => ({
  ...emptyAnamnesis(),
  patientName: "Paciente Sintético",
  age: "35",
  consultationDate: "2026-09-15",
  wakeTime: "07:00",
  sleepTime: "23:00",
  hasChildren: "Não",
  hasConditions: "Não",
  takesMedication: "Sim",
  medications: "Medicamento de exemplo, conforme relato",
  hasDrugAllergies: "Não sei",
  hasFoodAllergies: "Não",
  trains: "Sim",
  trainingFrequency: "3",
  trainingType: "Natação",
  trainingTime: "8:00",
  waterLiters: "2,5",
  drinksAlcohol: "Não",
  smokes: "Não",
  sleepQuality: "Bom",
  takesSupplements: "Não",
  mainComplaint: "Queixa sintética",
  treatmentGoal: "Objetivo informado pelo paciente",
  expectations: "Expectativa sintética",
});
const source = () => ({
  patientName: "Paciente Sintético",
  consultationDate: "2026-09-15",
  answers: answers(),
  clinicalData: mapAnamnesis(answers(), null),
  bodyComposition: {
    ...emptyBodyComposition,
    patientName: "Paciente Sintético",
    age: "35",
    height: "175",
    examDateTime: "2026-09-15T10:30",
    weight: "80",
    skeletalMuscleMass: "35",
    bodyFatPercentage: "20",
  },
});

describe("consulta única: transcrição e identidade", () => {
  it("reaproveita respostas, sem interpretar medicamento nem aprovar automaticamente", () => {
    const result = consultationToJourney(source());
    expect(result.anamnese.header.dataConsulta).toBe("15/09/2026");
    expect(result.anamnese.sono.acorda).toBe("07:00");
    expect(result.anamnese.habitos.horario).toBe("08:00");
    expect(result.anamnese.queixaObjetivos.queixa).toBe("Queixa sintética");
    expect(result.anamnese.medicacoesEmUso[0]).toEqual({
      nome: answers().medications,
      dose: "",
      horario: "",
      frequencia: "",
      motivo: "",
    });
    expect(result.anamnese.historicoClinico.outras).toBe("");
    expect(result.anamnese.observacoesClinicas.adicionais).toBe("");
    expect(result.bio.alturaM).toBe("1,75");
    expect(result.protocolo).toBeNull();
  });
  it("preserva a revisão do profissional e sinaliza idade divergente mesmo se a ficha iguala o exame", () => {
    const input = source();
    input.clinicalData.age = "36";
    input.clinicalData.wakeTime = "06:30";
    input.bodyComposition.age = "36";
    const result = consultationToJourney(input);
    expect(result.anamnese.header.nascimentoOuIdade).toBe("36");
    expect(result.anamnese.sono.acorda).toBe("06:30");
    expect(result.bio.identityReview).toBe(true);
    expect(input.answers.age).toBe("35");
  });
  it("ausência de exame não vira exame normal nem decisão de seguir sem exame", () => {
    const result = consultationToJourney({
      ...source(),
      bodyComposition: null,
      clinicalData: null,
      answers: null,
    });
    expect(result.bio.historico).toEqual([]);
    expect(result.bio.semExame).toBe(false);
    expect(result.bio.idadeAnos).toBe("");
    expect(result.anamnese.medicacoesEmUso).toEqual([]);
  });
  it("mantém notas manuais e não descarta dados longos silenciosamente", () => {
    const input = source();
    input.clinicalData.additionalNotes += "\n\nNota do profissional.";
    expect(consultationToJourney(input).anamnese.observacoesClinicas.adicionais).toBe(
      "Nota do profissional.",
    );
    input.clinicalData = { ...emptyClinicalData, additionalNotes: "x".repeat(4001) };
    expect(() => consultationToJourney(input)).toThrow(/Nenhuma informação foi descartada/);
  });
  it("não usa nome parcial para considerar um exame do mesmo paciente", () => {
    const input = source();
    input.bodyComposition.patientName = "Paciente Sintético Dois";
    expect(consultationToJourney(input).bio.identityReview).toBe(true);
  });
});

describe("histórico por data, sem duplicar exame atual", () => {
  it("une métricas por data mesmo com arrays em ordens diferentes", () => {
    const input = source();
    input.bodyComposition.weightHistory = [
      { date: "2026-08-01", value: "82" },
      { date: "2026-09-15", value: "80" },
    ];
    input.bodyComposition.skeletalMuscleHistory = [
      { date: "15/09/2026", value: "35" },
      { date: "01/08/2026", value: "34" },
    ];
    const result = consultationToJourney(input);
    expect(result.bio.historico).toHaveLength(2);
    expect(result.bio.historico[1]).toEqual({
      data: "15/09/2026",
      peso: "80",
      massaMuscularEsqueletica: "35",
      pgc: "20",
    });
    expect(computeEvolution(result.bio).hasTrend).toBe(true);
  });
  it("preserva conflito na mesma data para revisão, sem escolher uma medida", () => {
    const input = source();
    input.bodyComposition.weightHistory = [{ date: "2026-09-15", value: "81" }];
    const bio = consultationToJourney(input).bio;
    expect(computeEvolution(bio).conflicts.length).toBeGreaterThan(0);
    expect(bio.historico.map((row) => row.peso)).toEqual(["81", "80"]);
  });
  it("não substitui datas inválidas por hoje", () => {
    const input = source();
    input.bodyComposition.examDateTime = "31/02/2026";
    expect(
      computeEvolution(consultationToJourney(input).bio).ignoredDatesWithValues.length,
    ).toBeGreaterThan(0);
  });
});
