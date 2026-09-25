/**
 * Montagem ÚNICA das secções de prescrição (oral e injetável).
 *
 * Usada pela geração (protocol-ai), pela integridade das gravações
 * (protocol-quality) e, por consequência, pelo HTML. Não há lógica duplicada:
 * quem precisar de emitir prescrições chama daqui.
 *
 * Regras invioláveis:
 * - a IA nunca cria, completa nem classifica medicação;
 * - só entradas COMPLETAS e CONFIRMADAS uma a uma são emitidas;
 * - a via nunca é inferida pelo nome da substância.
 */
import { documentLabels } from "./document-locale";
import type { PrescriptionEntry, ProtocolLocale, ProtocolSection } from "./types";

export const PRESCRIPTION_GROUPS = ["oral", "injetavel"] as const;
export type PrescriptionGroup = (typeof PRESCRIPTION_GROUPS)[number];

export const ORAL_SECTION_ID = "prescricoes-oral";
export const INJECTABLE_SECTION_ID = "prescricoes-injetavel";
/** Identificador da tabela única antiga: removido sempre que se reconstrói. */
export const LEGACY_PRESCRIPTION_SECTION_ID = "prescricoes";

/** Campos que descrevem clinicamente a entrada (sem a confirmação). */
export function prescriptionFields(p: PrescriptionEntry): string[] {
  return [
    p.grupo ?? "",
    p.substancia,
    p.dose,
    p.via,
    p.frequencia,
    p.horario ?? "",
    p.observacoes,
  ];
}

/** Uma entrada só entra no documento com grupo, substância, dose, via e frequência. */
export function prescriptionIsComplete(p: PrescriptionEntry): boolean {
  return Boolean(
    p.grupo && p.substancia.trim() && p.dose.trim() && p.via.trim() && p.frequencia.trim(),
  );
}

/** Entrada iniciada: qualquer campo preenchido, mesmo sem nome. */
export function prescriptionStarted(p: PrescriptionEntry): boolean {
  return prescriptionFields(p).some((v) => v.trim());
}

/** Entradas emitidas no documento: completas E confirmadas. */
export function emittedPrescriptions(
  prescriptions: PrescriptionEntry[] | undefined,
): PrescriptionEntry[] {
  return (prescriptions ?? []).filter((p) => p.confirmada && prescriptionIsComplete(p));
}

function group(p: PrescriptionEntry): PrescriptionGroup | null {
  return p.grupo ?? null;
}

function table(entries: PrescriptionEntry[], locale: ProtocolLocale) {
  const t = documentLabels(locale);
  return {
    type: "table" as const,
    columns: [t.name, t.dose, t.route, t.frequency, t.time, t.reason],
    rows: entries.map((p) => [
      p.substancia.trim(),
      p.dose.trim(),
      p.via.trim(),
      p.frequencia.trim(),
      (p.horario ?? "").trim(),
      p.observacoes.trim(),
    ]),
  };
}

/**
 * Secções separadas, com títulos próprios e identificadores distintos.
 * Ausência de entradas num grupo NÃO gera secção: nada é inventado.
 */
export function buildPrescriptionSections(
  prescriptions: PrescriptionEntry[] | undefined,
  locale: ProtocolLocale,
): ProtocolSection[] {
  const t = documentLabels(locale);
  const emitidas = emittedPrescriptions(prescriptions);
  const sections: ProtocolSection[] = [];
  const oral = emitidas.filter((p) => group(p) === "oral");
  const inject = emitidas.filter((p) => group(p) === "injetavel");
  if (oral.length)
    sections.push({
      id: ORAL_SECTION_ID,
      title: t.prescriptionOral,
      kind: "prescription",
      blocks: [table(oral, locale)],
    });
  if (inject.length)
    sections.push({
      id: INJECTABLE_SECTION_ID,
      title: t.prescriptionInjectable,
      kind: "prescription",
      blocks: [table(inject, locale)],
    });
  return sections;
}

/** Remove qualquer secção de prescrição, incluindo a tabela única antiga. */
export function withoutPrescriptionSections(sections: ProtocolSection[]): ProtocolSection[] {
  const ids = new Set<string>([
    ORAL_SECTION_ID,
    INJECTABLE_SECTION_ID,
    LEGACY_PRESCRIPTION_SECTION_ID,
  ]);
  return sections.filter((s) => s.kind !== "prescription" && !ids.has(s.id));
}

/**
 * Pendências das prescrições — painel interno, nunca no documento.
 * Entradas parciais (mesmo sem nome) aparecem, em vez de desaparecerem.
 */
export function prescriptionIssues(prescriptions: PrescriptionEntry[] | undefined): string[] {
  const issues: string[] = [];
  (prescriptions ?? []).forEach((p, index) => {
    if (!prescriptionStarted(p)) return;
    const n = index + 1;
    const nome = p.substancia.trim();
    const etiqueta = nome ? `${nome}` : `entrada ${n}`;
    if (!nome) {
      issues.push(`Prescrição ${n}: sem substância indicada. Complete ou remova a entrada.`);
      return;
    }
    if (!p.grupo)
      issues.push(
        `Prescrição ${etiqueta}: classificação pendente — indique se é oral ou injetável. A via nunca é deduzida pelo nome.`,
      );
    const faltas: string[] = [];
    if (!p.dose.trim()) faltas.push("dose");
    if (!p.via.trim()) faltas.push("via");
    if (!p.frequencia.trim()) faltas.push("frequência");
    if (faltas.length)
      issues.push(`Prescrição ${etiqueta}: falta ${faltas.join(", ")} antes de ser confirmada.`);
    if (!p.confirmada && prescriptionIsComplete(p))
      issues.push(`Prescrição por confirmar individualmente: ${etiqueta} ${p.dose.trim()}`.trim());
    if (!p.confirmada && !prescriptionIsComplete(p) && !faltas.length && p.grupo)
      issues.push(`Prescrição por confirmar individualmente: ${etiqueta}`);
  });
  return issues;
}
