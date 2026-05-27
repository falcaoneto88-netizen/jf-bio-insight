import { create } from "zustand";

export type UploadedFile = {
  name: string;
  size: number;
  type: string;
};

export type BodyCompositionData = {
  patientName: string;
  examDateTime: string;
  sex: "feminino" | "masculino" | "";
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
};

export type YesNo = "sim" | "nao" | "";

export type ClinicalData = {
  mainGoal:
    | "emagrecimento"
    | "recomposicao"
    | "ganho_massa"
    | "manutencao"
    | "alta_performance"
    | "";
  wakeTime: string;
  sleepTime: string;
  trainingTime: string;
  weeklyTrainingFrequency: string;
  trainingType: string;
  menopause: YesNo;
  gallbladderRemoved: YesNo;
  diabetes: YesNo;
  hypertension: YesNo;
  constipation: YesNo;
  bingeEating: YesNo;
  nightHunger: YesNo;
  mealsPerDay: string;
  avoidedFoods: string;
};

export const emptyClinicalData: ClinicalData = {
  mainGoal: "",
  wakeTime: "",
  sleepTime: "",
  trainingTime: "",
  weeklyTrainingFrequency: "",
  trainingType: "",
  menopause: "",
  gallbladderRemoved: "",
  diabetes: "",
  hypertension: "",
  constipation: "",
  bingeEating: "",
  nightHunger: "",
  mealsPerDay: "",
  avoidedFoods: "",
};

type ReportState = {
  file: UploadedFile | null;
  bodyComposition: BodyCompositionData | null;
  clinicalData: ClinicalData | null;
  setFile: (file: UploadedFile | null) => void;
  setBodyComposition: (data: BodyCompositionData) => void;
  setClinicalData: (data: ClinicalData) => void;
  reset: () => void;
};

export const useReportStore = create<ReportState>((set) => ({
  file: null,
  bodyComposition: null,
  clinicalData: null,
  setFile: (file) => set({ file }),
  setBodyComposition: (data) => set({ bodyComposition: data }),
  setClinicalData: (data) => set({ clinicalData: data }),
  reset: () => set({ file: null, bodyComposition: null, clinicalData: null }),
}));
