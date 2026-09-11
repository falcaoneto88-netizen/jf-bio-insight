/**
 * Gerador do HTML clínico premium.
 * - Documento autossuficiente: sem scripts, sem URLs externas, sem @import.
 * - Todo o conteúdo é escapado.
 * - Nada de notas internas, pendências, fontes ou dúvidas da extração.
 * - CSS preparado para paginação com WeasyPrint (@page A4, cabeçalho/rodapé,
 *   thead repetível, break-inside controlado).
 */
import { computeEvolution, evolutionTableRows } from "./evolution";
import { decimalComma, integerValue, toBrDate, todayBr } from "./format";
import {
  ANAMNESE_FIELD_LABELS,
  ANAMNESE_SECTIONS,
  OBJETIVOS,
  type Anamnese,
  type Bio,
  type ProtocolBlock,
  type Protocolo,
} from "./types";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphs(text: string): string {
  return String(text)
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => `<p>${escapeHtml(chunk).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/** Nomes de substâncias a negrito na primeira coluna das tabelas. */
function tableCell(value: string, bold: boolean): string {
  const safe = escapeHtml(value).replace(/\n/g, "<br />");
  return bold ? `<td><strong>${safe}</strong></td>` : `<td>${safe}</td>`;
}

function renderBlock(block: ProtocolBlock): string {
  switch (block.type) {
    case "paragraph":
      return block.text.trim() ? `<div class="block">${paragraphs(block.text)}</div>` : "";
    case "list": {
      const items = block.items.map((i) => i.trim()).filter(Boolean);
      if (!items.length) return "";
      return `<ul class="block">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`;
    }
    case "table": {
      // Colunas sem cabeçalho são removidas COM as células correspondentes:
      // o alinhamento é feito pelo índice original, nunca por posição relativa.
      const kept = block.columns
        .map((c, i) => ({ label: c, index: i }))
        .filter((c) => c.label.trim().length > 0);
      const rows = block.rows.filter((r) => kept.some((c) => String(r[c.index] ?? "").trim().length > 0));
      if (!kept.length || !rows.length) return "";
      return `<table class="block">
  <thead><tr>${kept.map((c) => `<th>${escapeHtml(c.label)}</th>`).join("")}</tr></thead>
  <tbody>
${rows
  .map(
    (row) =>
      `    <tr>${kept.map((c, pos) => tableCell(row[c.index] ?? "", pos === 0)).join("")}</tr>`,
  )
  .join("\n")}
  </tbody>
</table>`;
    }

    case "patientNote":
      return block.text.trim()
        ? `<div class="patient-note block">${paragraphs(block.text)}</div>`
        : "";
    default:
      return "";
  }
}

/** Secções do protocolo já renderizadas (vazias são omitidas). */
export function renderProtocolSections(protocolo: Protocolo): string {
  return protocolo.sections
    .map((section) => {
      const body = section.blocks.map(renderBlock).filter(Boolean).join("\n");
      if (!body) return "";
      return `<section>
  <h2>${escapeHtml(section.title)}</h2>
${body}
</section>`;
    })
    .filter(Boolean)
    .join("\n");
}

/** true só quando o protocolo produz conteúdo mesmo visível no documento. */
export function protocoloTemConteudoRenderizavel(protocolo: Protocolo): boolean {
  return renderProtocolSections(protocolo).trim().length > 0;
}

function definitionList(entries: [string, string][]): string {

  const filled = entries.filter(([, v]) => String(v ?? "").trim().length > 0);
  if (!filled.length) return "";
  return `<dl class="fields">${filled
    .map(([k, v]) => `<div class="field"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
    .join("")}</dl>`;
}

function renderAnamnese(anamnese: Anamnese): string {
  const parts: string[] = [];

  const header = definitionList([
    ["Paciente", anamnese.header.paciente],
    ["Data da consulta", toBrDate(anamnese.header.dataConsulta)],
    ["Nascimento / idade", anamnese.header.nascimentoOuIdade],
    ["Telefone", anamnese.header.telefone],
    ["E-mail", anamnese.header.email],
  ]);
  if (header) parts.push(header);

  for (const section of ANAMNESE_SECTIONS) {
    if (section.key === "medicacoesEmUso") {
      const meds = anamnese.medicacoesEmUso.filter((m) =>
        [m.nome, m.dose, m.frequencia, m.horario, m.motivo].some((v) => String(v ?? "").trim()),
      );
      if (!meds.length) continue;
      parts.push(`<h3>${section.n}. ${escapeHtml(section.label)}</h3>
<table class="block">
  <thead><tr><th>Nome</th><th>Dose</th><th>Frequência</th><th>Horário</th><th>Motivo</th></tr></thead>
  <tbody>
${meds
  .map(
    (m) =>
      `    <tr>${tableCell(m.nome, true)}${tableCell(m.dose, false)}${tableCell(
        m.frequencia,
        false,
      )}${tableCell(m.horario, false)}${tableCell(m.motivo, false)}</tr>`,
  )
  .join("\n")}
  </tbody>
</table>`);
      continue;
    }

    const raw = anamnese[section.key as keyof Anamnese] as Record<string, string> | undefined;
    if (!raw) continue;
    const entries = Object.entries(raw).map(
      ([k, v]) => [ANAMNESE_FIELD_LABELS[k] ?? k, String(v ?? "")] as [string, string],
    );
    const list = definitionList(entries);
    if (!list) continue; // secção vazia é omitida SEM renumerar
    parts.push(`<h3>${section.n}. ${escapeHtml(section.label)}</h3>${list}`);
  }

  return parts.join("\n");
}

function renderBio(bio: Bio): string {
  const parts: string[] = [];
  const fields = definitionList([
    ["Paciente", bio.paciente],
    ["Data e hora do exame", toBrDate(bio.dataHoraExame)],
    ["Sexo", bio.sexo],
    ["Idade (anos)", integerValue(bio.idadeAnos)],
    ["Altura (m)", decimalComma(bio.alturaM)],
    ["Taxa metabólica basal (kcal)", integerValue(bio.taxaMetabolicaBasalKcal)],
    ["Nível de gordura visceral", integerValue(bio.nivelGorduraVisceral)],
  ]);
  if (fields) parts.push(fields);

  const evolution = computeEvolution(bio);
  const rows = evolutionTableRows(evolution);
  if (rows.length) {
    parts.push(`<table class="block">
  <thead><tr><th>Data</th><th>Peso (kg)</th><th>Massa muscular esquelética (kg)</th><th>PGC (%)</th></tr></thead>
  <tbody>
${rows
  .map((row) => `    <tr>${row.map((c, i) => tableCell(c, i === 0)).join("")}</tr>`)
  .join("\n")}
  </tbody>
</table>`);
  }
  return parts.join("\n");
}

const CSS = `
@page {
  size: A4;
  margin: 22mm 16mm 20mm 16mm;
  @top-center {
    content: "Dr. João Falcão";
    font-family: Georgia, "Times New Roman", serif;
    font-size: 9pt;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #8a7550;
  }
  @bottom-center {
    content: "Página " counter(page) " de " counter(pages);
    font-size: 8.5pt;
    color: #6c6a66;
  }
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  background: #faf9f5;
  color: #2b2b2b;
  font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  orphans: 3;
  widows: 3;
}
.page-shell { max-width: 190mm; margin: 0 auto; padding: 10mm 8mm 12mm; }
.doc-header { border-bottom: 2px solid #c5a880; padding-bottom: 10px; margin-bottom: 18px; }
.doc-header .brand {
  font-family: Georgia, "Times New Roman", serif;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  font-size: 9pt;
  color: #8a7550;
}
h1 {
  font-family: Georgia, "Times New Roman", serif;
  color: #111111;
  font-size: 19pt;
  margin: 8px 0 2px;
  letter-spacing: 0.01em;
}
h2 {
  font-family: Georgia, "Times New Roman", serif;
  color: #111111;
  font-size: 13.5pt;
  margin: 22px 0 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid #e3ddcd;
  break-after: avoid;
  page-break-after: avoid;
}
h3 {
  font-size: 10.5pt;
  color: #111111;
  margin: 14px 0 5px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  break-after: avoid;
  page-break-after: avoid;
}
p { margin: 0 0 8px; }
ul { margin: 0 0 10px; padding-left: 18px; }
li { margin-bottom: 4px; }
.meta { color: #6c6a66; font-size: 9.5pt; }
.draft-banner {
  border: 1px solid #c5a880;
  background: #f3ecdd;
  color: #6b552a;
  padding: 8px 12px;
  margin-bottom: 16px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 9pt;
  text-align: center;
}
section { margin-bottom: 6px; }
.block { margin: 0 0 10px; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th {
  background: #111111;
  color: #ffffff;
  text-align: left;
  padding: 6px 8px;
  font-weight: 600;
  border: 1px solid #111111;
}
td { padding: 6px 8px; border: 1px solid #e0dcd2; vertical-align: top; word-wrap: break-word; }
tbody tr:nth-child(even) td { background: #f3f1ea; }
.fields { margin: 0 0 10px; padding: 0; }
.field { display: block; padding: 4px 0; border-bottom: 1px dotted #e0dcd2; break-inside: avoid; }
.field dt { display: inline; font-weight: 600; color: #111111; }
.field dt::after { content: ": "; }
.field dd { display: inline; margin: 0; }
.patient-note {
  border-left: 3px solid #c5a880;
  background: #f6efe1;
  padding: 10px 14px;
  break-inside: auto;
}
.doc-footer {
  margin-top: 24px;
  padding-top: 10px;
  border-top: 1px solid #e3ddcd;
  color: #6c6a66;
  font-size: 8.5pt;
}
`;

export type RenderHtmlInput = {
  patientName: string;
  objetivo: Protocolo["objetivo"];
  anamnese: Anamnese;
  bio: Bio;
  protocolo: Protocolo;
  /** true => documento marcado como RASCUNHO (não aprovado). */
  draft: boolean;
  generatedAt?: string; // DD/MM/AAAA
  version?: number;
};

export function renderProtocolHtml(input: RenderHtmlInput): string {
  const objetivoLabel =
    OBJETIVOS.find((o) => o.value === input.objetivo)?.label ?? "Objetivo não definido";
  const date = input.generatedAt ?? todayBr();
  const patient = input.patientName.trim() || input.anamnese.header.paciente.trim();

  const anamneseHtml = renderAnamnese(input.anamnese);
  const bioHtml = input.bio.semExame ? "" : renderBio(input.bio);
  const evolution = computeEvolution(input.bio);
  const evolutionHtml =
    !input.bio.semExame && evolution.hasTrend
      ? `<ul class="block">${evolution.summaryLines
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join("")}</ul>`
      : "";

  const sectionsHtml = renderProtocolSections(input.protocolo);


  const parts = [
    anamneseHtml && `<section><h2>Anamnese</h2>\n${anamneseHtml}</section>`,
    bioHtml && `<section><h2>Bioimpedância</h2>\n${bioHtml}</section>`,
    evolutionHtml && `<section><h2>Evolução</h2>\n${evolutionHtml}</section>`,
    sectionsHtml,
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(`Protocolo clínico personalizado — ${patient || "Paciente"}`)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="page-shell">
${input.draft ? `<div class="draft-banner">Rascunho — não aprovado</div>` : ""}
  <header class="doc-header">
    <div class="brand">Dr. João Falcão</div>
    <h1>Protocolo clínico personalizado</h1>
    <div class="meta">
      ${escapeHtml(objetivoLabel)}${patient ? ` &middot; ${escapeHtml(patient)}` : ""} &middot; ${escapeHtml(date)}${
        input.version ? ` &middot; versão ${escapeHtml(String(input.version))}` : ""
      }
    </div>
  </header>
${parts}
  <footer class="doc-footer">Documento gerado para acompanhamento clínico individual.</footer>
</div>
</body>
</html>
`;
}
