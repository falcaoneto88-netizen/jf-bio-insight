import type { Consultation } from "./types";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();

/** Busca apenas os registros já carregados, sem mudar identidade ou ordem. */
export function filterConsultations(items: Consultation[], query: string): Consultation[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((item) => {
    const searchable = normalize(
      [
        item.patient_name,
        item.invite_email,
        item.consultation_date,
        item.consultation_date.split("-").reverse().join("/"),
      ].join(" "),
    );
    return terms.every((term) => searchable.includes(term));
  });
}
