import {
  anamnesisSchema,
  emptyAnamnesis,
  anamnesisSections,
  formatAnswer,
  isFieldVisible,
} from "@/lib/anamnesis/form";
import {
  emptyClinicalData,
  type BodyCompositionData,
  type ClinicalData,
} from "@/store/report-store";
export function parseSavedAnswers(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Anamnese inválida. Confira o registro antes de importar.");
  const result = anamnesisSchema.safeParse({ ...emptyAnamnesis(), ...value });
  if (!result.success)
    throw new Error(
      "Esta anamnese tem respostas inválidas. Solicite uma nova versão antes de importar.",
    );
  return result.data;
}
const yesNo = (value: string): "sim" | "nao" | "" =>
  value === "Sim" ? "sim" : value === "Não" ? "nao" : "";
export function normalizeClinicalTime(value: string): string {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match || Number(match[1]) > 23) return value;
  return `${match[1].padStart(2, "0")}:${match[2]}`;
}
export function mapAnamnesis(value: unknown, bc: BodyCompositionData | null): ClinicalData {
  const a = parseSavedAnswers(value);
  const detail = (flag: string, text: string) =>
    a[flag] === "Não" ? "Não, segundo o paciente." : (a[text] ?? "");
  return {
    ...emptyClinicalData,
    patientName: a.patientName,
    age: a.age,
    sex: bc?.sex ?? "",
    height: bc?.height ?? "",
    weight: bc?.weight ?? "",
    wakeTime: normalizeClinicalTime(a.wakeTime),
    sleepTime: normalizeClinicalTime(a.sleepTime),
    workSchedule: a.workSchedule,
    currentlyTraining: yesNo(a.trains),
    weeklyTrainingFrequency: a.trainingFrequency ?? "",
    trainingTime: normalizeClinicalTime(a.trainingTime ?? ""),
    trainingType: a.trains === "Sim" ? "outro" : "",
    trainingTypeOther: a.trainingType ?? "",
    previousDiseases: detail("hasConditions", "conditions"),
    medications: detail("takesMedication", "medications"),
    previousSurgeries: a.previousSurgeries,
    allergiesIntolerances: `Medicamentos: ${a.hasDrugAllergies}${a.drugAllergies ? ` — ${a.drugAllergies}` : ""}. Alimentos: ${a.hasFoodAllergies}${a.foodAllergies ? ` — ${a.foodAllergies}` : ""}.`,
    additionalNotes: anamnesisSections
      .flatMap((s) =>
        s.fields
          .filter((f) => isFieldVisible(f, a) && a[f.id])
          .map((f) => `${f.label}: ${formatAnswer(f, a[f.id])}`),
      )
      .join("\n"),
    // Do not infer a structured diagnosis or clinical goal from free text.
  };
}
// The first received anamnesis fills missing fields without erasing clinical review.
// Keep the complete patient answers in notes, including answers that conflict with
// values already entered by the clinician. Identity differences remain visible.
export function mergeReceivedAnamnesis(
  value: unknown,
  bc: BodyCompositionData | null,
  existing: ClinicalData | null,
): ClinicalData {
  const mapped = mapAnamnesis(value, bc);
  if (!existing) return mapped;
  const merged = { ...mapped };
  for (const key of Object.keys(mapped) as (keyof ClinicalData)[]) {
    if (existing[key]?.trim()) Object.assign(merged, { [key]: existing[key] });
  }
  merged.additionalNotes = existing.additionalNotes?.includes(mapped.additionalNotes)
    ? existing.additionalNotes
    : [existing.additionalNotes, mapped.additionalNotes].filter(Boolean).join("\n\n");
  return merged;
}
export function identityWarnings(
  a: { patientName?: string; age?: string },
  bc: BodyCompositionData | null,
): string[] {
  if (!bc) return [];
  const norm = (s?: string) => s?.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
  return [
    norm(a.patientName) && norm(bc.patientName) && norm(a.patientName) !== norm(bc.patientName)
      ? "O nome da anamnese difere do nome no exame. Confira se pertencem ao mesmo paciente."
      : "",
    a.age && bc.age && a.age !== bc.age
      ? "A idade da anamnese difere da idade no exame. Confira as datas e os dados."
      : "",
  ].filter(Boolean);
}
