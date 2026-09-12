import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({
  entryPoints: ["src/lib/anamnesis/form.ts"],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
});
const form = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
const valid = () => ({
  ...form.emptyAnamnesis(),
  patientName: "Paciente Teste",
  age: "38",
  consultationDate: "2026-09-12",
  wakeTime: "07:00",
  sleepTime: "23:00",
  hasChildren: "Não",
  hasConditions: "Não",
  takesMedication: "Não",
  hasDrugAllergies: "Não sei",
  hasFoodAllergies: "Não",
  trains: "Não",
  waterLiters: "2,5",
  drinksAlcohol: "Não",
  smokes: "Não",
  sleepQuality: "Bom",
  takesSupplements: "Não",
  mainComplaint: "Preenchimento fictício",
  treatmentGoal: "Teste do formulário",
});
test("all original sections are represented, plus final confirmation in the page", () => {
  assert.equal(form.anamnesisSections.length, 7);
  assert.equal(
    new Set(form.anamnesisFields.map((field) => field.id)).size,
    form.anamnesisFields.length,
  );
});
test("empty form requests explicit responses, never infers clinical negatives", () => {
  const result = form.anamnesisSchema.safeParse(form.emptyAnamnesis());
  assert.equal(result.success, false);
  assert.ok(result.error.issues.some((issue) => issue.path[0] === "hasConditions"));
});
test("valid negative answers and unknown allergies can be reviewed", () => {
  const parsed = form.anamnesisSchema.parse(valid());
  assert.equal(parsed.hasDrugAllergies, "Não sei");
  assert.equal(parsed.waterLiters, "2,5");
  assert.equal("medications" in parsed, false);
});
for (const [controller, dependent, detail] of [
  ["hasChildren", "childrenCount", "2"],
  ["hasConditions", "conditions", "Exemplo fictício"],
  ["takesMedication", "medications", "Exemplo fictício"],
  ["hasDrugAllergies", "drugAllergies", "Exemplo fictício"],
  ["hasFoodAllergies", "foodAllergies", "Exemplo fictício"],
  ["trains", "trainingFrequency", "3"],
  ["drinksAlcohol", "alcoholFrequency", "Ocasionalmente"],
  ["smokes", "cigarettesPerDay", "2"],
  ["takesSupplements", "supplements", "Exemplo fictício"],
]) {
  test(`${controller}: detail required only when relevant and cleared when hidden`, () => {
    const answers = { ...valid(), [controller]: "Sim" };
    const parsed = form.anamnesisSchema.safeParse(answers);
    assert.equal(parsed.success, false);
    assert.ok(parsed.error.issues.some((issue) => issue.path[0] === dependent));
    const changed = form.updateAnswer({ ...answers, [dependent]: detail }, controller, "Não");
    assert.equal(changed[dependent], "");
    assert.equal(form.anamnesisSchema.safeParse(changed).success, true);
  });
}
test("numbers, times, dates and enum values are validated", () => {
  for (const [id, value] of [
    ["age", "121"],
    ["age", "2.5"],
    ["age", "1e2"],
    ["age", "-1"],
    ["waterLiters", "2,55"],
    ["waterLiters", "16"],
    ["consultationDate", "2026-02-30"],
    ["wakeTime", "25:00"],
    ["sleepQuality", "anything"],
    ["patientName", "   "],
  ]) {
    assert.equal(
      form.anamnesisSchema.safeParse({ ...valid(), [id]: value }).success,
      false,
      `${id}: ${value}`,
    );
  }
});
test("long free text is rejected and unknown properties are stripped", () => {
  assert.equal(
    form.anamnesisSchema.safeParse({ ...valid(), mainComplaint: "a".repeat(2001) }).success,
    false,
  );
  assert.equal(
    "workflowId" in form.anamnesisSchema.parse({ ...valid(), workflowId: "untrusted" }),
    false,
  );
});
test("hidden previous details cannot leak into the confirmed snapshot", () => {
  const parsed = form.anamnesisSchema.parse({ ...valid(), medications: "discarded" });
  assert.equal("medications" in parsed, false);
});
test("confirmation requires a full name and explicit acceptance", () => {
  assert.equal(
    form.confirmationSchema.safeParse({ name: "Paciente Teste", accepted: false }).success,
    false,
  );
  assert.equal(form.confirmationSchema.safeParse({ name: "   ", accepted: true }).success, false);
  assert.equal(
    form.confirmationSchema.safeParse({ name: "Paciente Teste", accepted: "true" }).success,
    false,
  );
  assert.equal(
    form.confirmationSchema.safeParse({ name: "Paciente Teste", accepted: true }).success,
    true,
  );
});
test("missing optional information stays not informed, not no", () => {
  assert.equal(form.formatAnswer({ id: "previousSurgeries" }, ""), "Não informado");
});
