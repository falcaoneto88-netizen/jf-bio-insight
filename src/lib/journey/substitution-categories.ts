/**
 * Categorias exigidas na TABELA GERAL de substituições (lista geral de
 * alimentos do documento). Não confundir com as substituições POR REFEIÇÃO,
 * que continuam a exigir exatamente 3 opções distintas COM porção.
 *
 * Esta lista geral não é conclusão clínica: é apenas o conjunto de alimentos
 * que o profissional liberou, e respeita as restrições alimentares do paciente.
 */
import { documentLabels } from "./document-locale";
import { sectionKind } from "./meal-presentation";
import type { Protocolo } from "./types";

export const REQUIRED_SUBSTITUTION_CATEGORIES = [
  { key: "proteinas", label: "Proteínas" },
  { key: "carboidratos", label: "Carboidratos" },
  { key: "gorduras", label: "Gorduras boas" },
  { key: "frutas", label: "Frutas" },
] as const;

export type SubstitutionCategoryKey = (typeof REQUIRED_SUBSTITUTION_CATEGORIES)[number]["key"];

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Classifica o rótulo escrito na tabela; categorias extras ficam como "outra". */
export function substitutionCategoryKey(label: string): SubstitutionCategoryKey | "outra" {
  const raw = fold(label);
  if (!raw) return "outra";
  if (/\bprote/.test(raw)) return "proteinas";
  if (/carboidrat|carbohidrat|carbohydrat|\bcarbo\b|amido|cereal|cereais/.test(raw))
    return "carboidratos";
  if (/gordura|grasa|\bfats?\b|lipid|oleagin/.test(raw)) return "gorduras";
  if (/\bfruta|\bfruits?\b/.test(raw)) return "frutas";
  return "outra";
}

const localized = {
  "pt-BR": ["Proteínas", "Carboidratos", "Gorduras boas", "Frutas"],
  es: ["Proteínas", "Carbohidratos", "Grasas saludables", "Frutas"],
  en: ["Proteins", "Carbohydrates", "Healthy fats", "Fruits"],
};

/** Editor direto só reúne tabelas padrão. Tabelas com colunas extras continuam no editor completo. */
export function generalCategoryValue(p: Protocolo, key: SubstitutionCategoryKey): string {
  return p.sections
    .filter((s) => sectionKind(s) === "substitutions")
    .flatMap((s) =>
      s.blocks.flatMap((b) =>
        b.type === "table" && b.columns.length === 2
          ? b.rows.filter((r) => substitutionCategoryKey(r[0] ?? "") === key).map((r) => r[1] ?? "")
          : [],
      ),
    )
    .filter(Boolean)
    .join("; ");
}

/** Só altera a categoria escolhida; preserva refeições, categorias extras, notas e tabelas personalizadas. */
export function updateGeneralCategory(
  p: Protocolo,
  key: SubstitutionCategoryKey,
  value: string,
): Protocolo["sections"] {
  const sections = p.sections.map((s) =>
    sectionKind(s) !== "substitutions"
      ? s
      : {
          ...s,
          blocks: s.blocks.map((b) =>
            b.type !== "table" || b.columns.length !== 2
              ? b
              : {
                  ...b,
                  rows: b.rows.filter((r) => substitutionCategoryKey(r[0] ?? "") !== key),
                },
          ),
        },
  );
  const index = REQUIRED_SUBSTITUTION_CATEGORIES.findIndex((c) => c.key === key);
  const labels = documentLabels(p.locale ?? "pt-BR");
  const row = [localized[p.locale ?? "pt-BR"][index]!, value];
  const block = { type: "table" as const, columns: [labels.category, labels.options], rows: [row] };
  const target = sections.findIndex((s) => sectionKind(s) === "substitutions");
  if (target < 0)
    return [
      ...sections,
      { id: "substituicoes", kind: "substitutions", title: labels.substitutions, blocks: [block] },
    ];
  const section = sections[target]!;
  const table = section.blocks.findIndex((b) => b.type === "table" && b.columns.length === 2);
  sections[target] = {
    ...section,
    blocks:
      table < 0
        ? [...section.blocks, block]
        : section.blocks.map((b, i) =>
            i === table && b.type === "table" ? { ...b, rows: [...b.rows, row] } : b,
          ),
  };
  return sections;
}

/** Categorias obrigatórias em falta na tabela geral (com pelo menos uma opção). */
export function missingSubstitutionCategories(
  rows: { label: string; options: string[] }[],
): { key: SubstitutionCategoryKey; label: string }[] {
  const present = new Set<string>();
  for (const row of rows) {
    if (!row.options.some((o) => o.trim())) continue;
    const key = substitutionCategoryKey(row.label);
    if (key !== "outra") present.add(key);
  }
  return REQUIRED_SUBSTITUTION_CATEGORIES.filter((c) => !present.has(c.key)).map((c) => ({
    key: c.key,
    label: c.label,
  }));
}
