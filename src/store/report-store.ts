import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ReportHistoryEntry } from "@/lib/report-history";
import {
  buildDefaultPrescription,
  type PrescriptionData,
} from "@/lib/prescription-data";

export type UploadedFile = {
  name: string;
  size: number;
  type: string;
};

export type Sex = "feminino" | "masculino" | "";

export type HistoryPoint = { date: string; value: string };

export type BodyCompositionData = {
  patientName: string;
  examDateTime: string;
  sex: Sex;
  age: string;
  height: string;
  weight: string;
  bmi: string;
  skeletalMuscleMass: string;
  bodyFatPercentage: string;
  bodyFatMass: string;
  visceralFat: string;
  basalMetabolicRate: string;
  waistHipRatio: string;
  totalBodyWater: string;
  fatFreeMass: string;
  weightHistory: HistoryPoint[];
  skeletalMuscleHistory: HistoryPoint[];
  bodyFatHistory: HistoryPoint[];
};

export const emptyBodyComposition: BodyCompositionData = {
  patientName: "",
  examDateTime: "",
  sex: "",
  age: "",
  height: "",
  weight: "",
  bmi: "",
  skeletalMuscleMass: "",
  bodyFatPercentage: "",
  bodyFatMass: "",
  visceralFat: "",
  basalMetabolicRate: "",
  waistHipRatio: "",
  totalBodyWater: "",
  fatFreeMass: "",
  weightHistory: [],
  skeletalMuscleHistory: [],
  bodyFatHistory: [],
};

export type YesNo = "sim" | "nao" | "";
export type YesNoNA = "sim" | "nao" | "na" | "";

export type MainGoal =
  | "emagrecimento"
  | "recomposicao"
  | "ganho_massa"
  | "manutencao"
  | "alta_performance"
  | "";

export type TrainingType =
  | "musculacao"
  | "cardio"
  | "funcional"
  | "personal"
  | "outro"
  | "";

export type ClinicalData = {
  // Paciente
  patientName: string;
  sex: Sex;
  age: string;
  height: string;
  weight: string;
  // Objetivo
  mainGoal: MainGoal;
  // Rotina
  wakeTime: string;
  sleepTime: string;
  workSchedule: string;
  // Treino
  currentlyTraining: YesNo;
  weeklyTrainingFrequency: string;
  trainingTime: string;
  trainingType: TrainingType;
  trainingTypeOther: string;
  // Saúde
  previousDiseases: string;
  medications: string;
  previousSurgeries: string;
  allergiesIntolerances: string;
  gallbladderRemoved: YesNo;
  menopause: YesNoNA;
  diabetes: YesNo;
  hypertension: YesNo;
  constipation: YesNo;
  bingeEating: YesNo;
  nightHunger: YesNo;
  // Alimentação
  mealsPerDay: string;
  avoidedFoods: string;
  additionalNotes: string;
};

export const emptyClinicalData: ClinicalData = {
  patientName: "",
  sex: "",
  age: "",
  height: "",
  weight: "",
  mainGoal: "",
  wakeTime: "",
  sleepTime: "",
  workSchedule: "",
  currentlyTraining: "",
  weeklyTrainingFrequency: "",
  trainingTime: "",
  trainingType: "",
  trainingTypeOther: "",
  previousDiseases: "",
  medications: "",
  previousSurgeries: "",
  allergiesIntolerances: "",
  gallbladderRemoved: "",
  menopause: "",
  diabetes: "",
  hypertension: "",
  constipation: "",
  bingeEating: "",
  nightHunger: "",
  mealsPerDay: "",
  avoidedFoods: "",
  additionalNotes: "",
};

export type ReportSectionKey =
  | "bioimpedance"
  | "analysis"
  | "dietPlan"
  | "prescription"
  | "finalGuidelines"
  | "patientNotes";

export type ReportOptions = {
  sections: Record<ReportSectionKey, boolean>;
  clinicalNotes: string; // interno — nunca no PDF
  patientNotes: string; // sai como <Page> se sections.patientNotes && texto
};

export const defaultReportOptions: ReportOptions = {
  sections: {
    bioimpedance: true,
    analysis: true,
    dietPlan: true,
    prescription: true,
    finalGuidelines: true,
    patientNotes: false,
  },
  clinicalNotes: "",
  patientNotes: "",
};

type ReportState = {
  file: UploadedFile | null;
  bodyComposition: BodyCompositionData | null;
  clinicalData: ClinicalData | null;
  previousExam: ReportHistoryEntry | null;
  prescription: PrescriptionData | null;
  reportOptions: ReportOptions;
  setFile: (file: UploadedFile | null) => void;
  setBodyComposition: (data: BodyCompositionData) => void;
  setClinicalData: (data: ClinicalData) => void;
  setPreviousExam: (entry: ReportHistoryEntry | null) => void;
  clearPreviousExam: () => void;
  setPrescription: (data: PrescriptionData) => void;
  resetPrescription: () => void;
  setReportSection: (key: ReportSectionKey, value: boolean) => void;
  setAllReportSections: (value: boolean) => void;
  setClinicalNotes: (value: string) => void;
  setPatientNotes: (value: string) => void;
  resetReportOptions: () => void;
  reset: () => void;
};

function normalizeBodyComposition(
  bc: BodyCompositionData | null | undefined,
): BodyCompositionData | null {
  if (!bc) return null;
  return {
    ...bc,
    weightHistory: Array.isArray(bc.weightHistory) ? bc.weightHistory : [],
    skeletalMuscleHistory: Array.isArray(bc.skeletalMuscleHistory)
      ? bc.skeletalMuscleHistory
      : [],
    bodyFatHistory: Array.isArray(bc.bodyFatHistory) ? bc.bodyFatHistory : [],
  };
}

function normalizeReportOptions(
  o: Partial<ReportOptions> | null | undefined,
): ReportOptions {
  if (!o) return { ...defaultReportOptions, sections: { ...defaultReportOptions.sections } };
  return {
    sections: { ...defaultReportOptions.sections, ...(o.sections ?? {}) },
    clinicalNotes: typeof o.clinicalNotes === "string" ? o.clinicalNotes : "",
    patientNotes: typeof o.patientNotes === "string" ? o.patientNotes : "",
  };
}

export const useReportStore = create<ReportState>()(
  persist(
    (set) => ({
      file: null,
      bodyComposition: null,
      clinicalData: null,
      previousExam: null,
      prescription: null,
      reportOptions: normalizeReportOptions(null),
      setFile: (file) => set({ file }),
      setBodyComposition: (data) => set({ bodyComposition: data }),
      setClinicalData: (data) => set({ clinicalData: data }),
      setPreviousExam: (entry) => set({ previousExam: entry }),
      clearPreviousExam: () => set({ previousExam: null }),
      setPrescription: (data) => set({ prescription: data }),
      resetPrescription: () => set({ prescription: buildDefaultPrescription() }),
      setReportSection: (key, value) =>
        set((s) => ({
          reportOptions: {
            ...s.reportOptions,
            sections: { ...s.reportOptions.sections, [key]: value },
          },
        })),
      setAllReportSections: (value) =>
        set((s) => ({
          reportOptions: {
            ...s.reportOptions,
            sections: (Object.keys(s.reportOptions.sections) as ReportSectionKey[]).reduce(
              (acc, k) => {
                acc[k] = value;
                return acc;
              },
              {} as Record<ReportSectionKey, boolean>,
            ),
          },
        })),
      setClinicalNotes: (value) =>
        set((s) => ({ reportOptions: { ...s.reportOptions, clinicalNotes: value } })),
      setPatientNotes: (value) =>
        set((s) => ({ reportOptions: { ...s.reportOptions, patientNotes: value } })),
      resetReportOptions: () =>
        set({ reportOptions: normalizeReportOptions(null) }),
      reset: () =>
        set({
          file: null,
          bodyComposition: null,
          clinicalData: null,
          previousExam: null,
          prescription: null,
          reportOptions: normalizeReportOptions(null),
        }),
    }),
    {
      name: "jf-bioreport-draft",
      storage: createJSONStorage(() => localStorage),
      version: 3,
      migrate: (_persistedState, version) => {
        if (version < 1) {
          return {
            file: null,
            bodyComposition: null,
            clinicalData: null,
            previousExam: null,
            prescription: null,
            reportOptions: normalizeReportOptions(null),
          };
        }
        const s = (_persistedState ?? {}) as Partial<ReportState>;
        return {
          ...s,
          prescription: s.prescription ?? null,
          reportOptions: normalizeReportOptions(s.reportOptions),
        };
      },
      partialize: (state) => ({
        file: state.file,
        bodyComposition: normalizeBodyComposition(state.bodyComposition),
        clinicalData: state.clinicalData,
        previousExam: state.previousExam,
        prescription: state.prescription,
        reportOptions: state.reportOptions,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.bodyComposition) {
            state.bodyComposition = normalizeBodyComposition(state.bodyComposition);
          }
          state.reportOptions = normalizeReportOptions(state.reportOptions);
        }
      },
    },
  ),
);
