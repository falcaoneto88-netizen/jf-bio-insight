import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import type { ReportHistoryEntry } from "@/lib/report-history";
import {
  buildDefaultPrescription,
  type PrescriptionData,
} from "@/lib/prescription-data";
import {
  emptyOverride,
  normalizeDietCustomization,
  type CustomFoodItem,
  type DietBlockKey,
  type DietCustomization,
} from "@/lib/diet-customization";
import {
  MAX_EXTRA_MEALS,
  MAX_EXTRA_MEAL_ITEMS,
  MAX_EXTRA_MEAL_NAME,
  newExtraMealId,
  normalizeExtraMeals,
  type ExtraMeal,
} from "@/lib/extra-meals";


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
  | "jejum_intermitente"
  | "alta_performance"
  | "recomposicao"
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
  dietCustomization: DietCustomization;
  extraMeals: ExtraMeal[];
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
  removeDietItem: (blockKey: DietBlockKey, itemId: string) => void;
  addDietItem: (blockKey: DietBlockKey, item: CustomFoodItem) => void;
  resetAllDietCustomization: () => void;
  addExtraMeal: () => void;
  removeExtraMeal: (id: string) => void;
  updateExtraMeal: (
    id: string,
    patch: Partial<Pick<ExtraMeal, "name" | "time">>,
  ) => void;
  addExtraMealItem: (id: string, item: CustomFoodItem) => void;
  removeExtraMealItem: (id: string, itemId: string) => void;
  clearExtraMeals: () => void;
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
      dietCustomization: {},
      extraMeals: [],
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
      removeDietItem: (blockKey, itemId) =>
        set((s) => {
          const current = s.dietCustomization[blockKey] ?? emptyOverride();
          const isCustom = itemId.startsWith("custom_");
          const next = {
            removedIds: isCustom
              ? current.removedIds
              : current.removedIds.includes(itemId)
                ? current.removedIds
                : [...current.removedIds, itemId],
            added: isCustom
              ? current.added.filter((a) => a.id !== itemId)
              : current.added,
          };
          return {
            dietCustomization: { ...s.dietCustomization, [blockKey]: next },
          };
        }),
      addDietItem: (blockKey, item) => {
        const label = item.label.trim();
        if (!label) return;
        const safeItem = { id: item.id, label: label.slice(0, 60) };
        set((s) => {
          const current = s.dietCustomization[blockKey] ?? emptyOverride();
          return {
            dietCustomization: {
              ...s.dietCustomization,
              [blockKey]: {
                removedIds: current.removedIds,
                added: [...current.added, safeItem],
              },
            },
          };
        });
      },
      resetAllDietCustomization: () =>
        set({ dietCustomization: {}, extraMeals: [] }),
      addExtraMeal: () =>
        set((s) => {
          if (s.extraMeals.length >= MAX_EXTRA_MEALS) return s;
          return {
            extraMeals: [
              ...s.extraMeals,
              { id: newExtraMealId(), name: "", time: "", items: [] },
            ],
          };
        }),
      removeExtraMeal: (id) =>
        set((s) => ({ extraMeals: s.extraMeals.filter((m) => m.id !== id) })),
      updateExtraMeal: (id, patch) =>
        set((s) => ({
          extraMeals: s.extraMeals.map((m) => {
            if (m.id !== id) return m;
            const next = { ...m };
            if (patch.name !== undefined) {
              next.name = patch.name.slice(0, MAX_EXTRA_MEAL_NAME);
            }
            if (patch.time !== undefined) {
              next.time = patch.time;
            }
            return next;
          }),
        })),
      addExtraMealItem: (id, item) => {
        const label = item.label.trim();
        if (!label) return;
        set((s) => ({
          extraMeals: s.extraMeals.map((m) => {
            if (m.id !== id) return m;
            if (m.items.length >= MAX_EXTRA_MEAL_ITEMS) return m;
            return {
              ...m,
              items: [
                ...m.items,
                { id: item.id, label: label.slice(0, 60) },
              ],
            };
          }),
        }));
      },
      removeExtraMealItem: (id, itemId) =>
        set((s) => ({
          extraMeals: s.extraMeals.map((m) =>
            m.id === id
              ? { ...m, items: m.items.filter((i) => i.id !== itemId) }
              : m,
          ),
        })),
      clearExtraMeals: () => set({ extraMeals: [] }),
      reset: () =>
        set({
          file: null,
          bodyComposition: null,
          clinicalData: null,
          previousExam: null,
          prescription: null,
          reportOptions: normalizeReportOptions(null),
          dietCustomization: {},
          extraMeals: [],
        }),

    }),
    {
      name: "jf-bioreport-draft",
      storage: createJSONStorage(() => localStorage),
      version: 6,
      migrate: (_persistedState, version) => {
        if (version < 1) {
          return {
            file: null,
            bodyComposition: null,
            clinicalData: null,
            previousExam: null,
            prescription: null,
            reportOptions: normalizeReportOptions(null),
            dietCustomization: {},
            extraMeals: [],
          };
        }
        const s = (_persistedState ?? {}) as Partial<ReportState>;
        // v6: reduzimos os objetivos para 3 (jejum/alta perf./recomposição).
        // Mapeia objetivos antigos para o equivalente mais próximo.
        if (s.clinicalData) {
          const legacyGoal = (s.clinicalData as unknown as { mainGoal?: string }).mainGoal;
          if (legacyGoal === "ganho_massa") {
            s.clinicalData = { ...s.clinicalData, mainGoal: "alta_performance" };
          } else if (
            legacyGoal === "emagrecimento" ||
            legacyGoal === "manutencao"
          ) {
            s.clinicalData = { ...s.clinicalData, mainGoal: "recomposicao" };
          }
        }
        return {
          ...s,
          prescription: s.prescription ?? null,
          reportOptions: normalizeReportOptions(s.reportOptions),
          dietCustomization: normalizeDietCustomization(s.dietCustomization),
          extraMeals: normalizeExtraMeals(s.extraMeals),
        };
      },
      partialize: (state) => ({
        file: state.file,
        bodyComposition: normalizeBodyComposition(state.bodyComposition),
        clinicalData: state.clinicalData,
        previousExam: state.previousExam,
        prescription: state.prescription,
        reportOptions: state.reportOptions,
        dietCustomization: state.dietCustomization,
        extraMeals: state.extraMeals,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          if (state.bodyComposition) {
            state.bodyComposition = normalizeBodyComposition(state.bodyComposition);
          }
          state.reportOptions = normalizeReportOptions(state.reportOptions);
          state.dietCustomization = normalizeDietCustomization(state.dietCustomization);
          state.extraMeals = normalizeExtraMeals(state.extraMeals);
        }

      },
    },
  ),
);
