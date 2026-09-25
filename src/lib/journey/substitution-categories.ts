/**
 * Categorias exigidas na TABELA GERAL de substituições (lista geral de
 * alimentos do documento). Não confundir com as substituições POR REFEIÇÃO,
 * que continuam a exigir exatamente 3 opções distintas COM porção.
 *
 * Esta lista geral não é conclusão clínica: é apenas o conjunto de alimentos
 * que o profissional liberou, e respeita as restrições alimentares do paciente.
 */
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
  if (/carboidrat|\bcarbo\b|amido|cereal|cereais/.test(raw)) return "carboidratos";
  if (/gordura|lipid|oleagin/.test(raw)) return "gorduras";
  if (/\bfruta/.test(raw)) return "frutas";
  return "outra";
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
