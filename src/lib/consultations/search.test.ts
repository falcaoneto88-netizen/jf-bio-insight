import { describe, expect, it } from "vitest";
import { filterConsultations } from "./search";
import type { Consultation } from "./types";
const items: Consultation[] = [
  {
    id: "consulta-a",
    patient_id: "paciente-a",
    patient_name: "Paciente Fictícia Ágata",
    consultation_date: "2026-10-10",
    invite_email: "teste-a@example.invalid",
    created_at: "",
    invite_expires_at: "",
  },
  {
    id: "consulta-b",
    patient_id: "paciente-b",
    patient_name: "Paciente Fictício Bruno",
    consultation_date: "2026-10-09",
    invite_email: "",
    created_at: "",
    invite_expires_at: "",
  },
];
describe("busca local de consultas", () => {
  it("encontra acentos, termos combinados e data brasileira mantendo o ID exato", () => {
    expect(filterConsultations(items, "AGATA 10/10/2026").map((c) => c.id)).toEqual(["consulta-a"]);
    expect(filterConsultations(items, "teste-a@example.invalid")[0]).toBe(items[0]);
  });
  it("não altera ordem, identidade nem registros ao limpar a busca", () => {
    expect(filterConsultations(items, " ")).toBe(items);
    expect(filterConsultations(items, "paciente")).toEqual(items);
    expect(items[0].patient_id).toBe("paciente-a");
  });
  it("termos ausentes deixam resultado vazio, sem sugerir novo cadastro por identidade", () => {
    expect(filterConsultations(items, "não existe")).toEqual([]);
    expect(filterConsultations(items, "agata 09/10")).toEqual([]);
    expect(filterConsultations([], "bruno")).toEqual([]);
  });
});
