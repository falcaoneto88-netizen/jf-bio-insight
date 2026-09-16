/** Único renderer da prévia e exportação. HTML autossuficiente, sem scripts ou rede. */
import { computeEvolution, evolutionTableRows } from "./evolution";
import { decimalComma, integerValue, signedDelta, todayBr } from "./format";
import { DOCUMENT_TEMPLATE_VERSION, LOGO_DATA_URI, LOGO_SHA256 } from "./brand";
import {
  anamnesisFieldLabel,
  anamnesisSectionLabel,
  documentDate,
  documentLabels,
} from "./document-locale";
import {
  cleanMealBlock,
  hideMealTimes,
  presentMeals,
  sectionKind,
  isExplicitMealBlock,
} from "./meal-presentation";
import {
  ANAMNESE_SECTIONS,
  type Anamnese,
  type Bio,
  type ProtocolBlock,
  type ProtocolLocale,
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
  return text
    .split(/\n{2,}/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => `<p>${escapeHtml(c).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}
function tableCell(value: string, bold = false): string {
  const safe = escapeHtml(value).replace(/\n/g, "<br />");
  return bold ? `<td><strong>${safe}</strong></td>` : `<td>${safe}</td>`;
}
/** Fragmenta células muito extensas em linhas de continuação, sem truncar conteúdo. */
function cellChunks(value: string, limit: number): string[] {
  const parts: string[] = [];
  let remaining = value;
  while (remaining.length > limit) {
    const space = remaining.lastIndexOf(" ", limit);
    const end = space > limit / 2 ? space + 1 : limit;
    parts.push(remaining.slice(0, end));
    remaining = remaining.slice(end);
  }
  parts.push(remaining);
  return parts;
}
function table(columns: string[], rows: string[][], className = "block"): string {
  const kept = columns.map((label, index) => ({ label, index })).filter((c) => c.label.trim());
  const filled = rows.filter((row) => kept.some((c) => String(row[c.index] ?? "").trim()));
  if (!kept.length || !filled.length) return "";
  const printableRows = filled.flatMap((row) => {
    const chunks = kept.map((c) =>
      cellChunks(row[c.index] ?? "", Math.max(160, Math.floor(1200 / kept.length))),
    );
    return Array.from({ length: Math.max(...chunks.map((c) => c.length)) }, (_, i) =>
      chunks.map((c) => c[i] ?? ""),
    );
  });
  return `<table class="${className}"><thead><tr>${kept.map((c) => `<th scope="col">${escapeHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${printableRows.map((row) => `<tr>${row.map((cell, i) => tableCell(cell, i === 0)).join("")}</tr>`).join("")}</tbody></table>`;
}
function renderBlock(block: ProtocolBlock, locale: ProtocolLocale): string {
  switch (block.type) {
    case "paragraph":
      return block.text.trim() ? `<div class="block">${paragraphs(block.text)}</div>` : "";
    case "patientNote":
      return block.text.trim()
        ? `<aside class="patient-note block">${paragraphs(block.text)}</aside>`
        : "";
    case "list": {
      const items = block.items.map((i) => i.trim()).filter(Boolean);
      return items.length
        ? `<ul class="block">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`
        : "";
    }
    case "table":
      return table(block.columns, block.rows);
    case "meal": {
      const t = documentLabels(locale);
      const clean = cleanMealBlock(block) as Extract<ProtocolBlock, { type: "meal" }>;
      const foods = clean.foods.filter((f) => f.name.trim() || f.quantity.trim());
      const stacked = Object.values(clean.substitutions).some(
        (items) => items.join(" ").length > 450,
      );
      const substitutions = (["protein", "carbohydrate", "fat"] as const)
        .map((key) => {
          const items = clean.substitutions[key].filter((i) => i.trim());
          return items.length
            ? `<div class="substitution-group"><h4>${t[key]}</h4><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul></div>`
            : "";
        })
        .filter(Boolean)
        .join("");
      return [
        foods.length
          ? `<h4 class="meal-label">${t.planned}</h4><ul class="planned-foods">${foods.map((f) => `<li><strong>${escapeHtml(f.name)}</strong>${f.name && f.quantity ? " — " : ""}${escapeHtml(f.quantity)}</li>`).join("")}</ul>`
          : "",
        clean.preparation.trim()
          ? `<div class="preparation"><h4 class="meal-label">${t.preparation}</h4>${paragraphs(clean.preparation)}</div>`
          : "",
        substitutions
          ? `<div class="substitutions${stacked ? " stacked" : ""}">${substitutions}</div>`
          : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }
}

export function renderProtocolSections(protocolo: Protocolo): string {
  const locale = protocolo.locale ?? "pt-BR";
  const t = documentLabels(locale);
  const order = {
    objective: 0,
    guidelines: 1,
    meals: 2,
    substitutions: 3,
    prescription: 4,
    other: 5,
  };
  let mealNumber = 0;
  const sections = protocolo.sections
    .map((section, index) => ({ section, index, kind: sectionKind(section) }))
    .flatMap((entry) => {
      if (entry.kind === "meals") return [entry];
      const isMeal = (block: ProtocolBlock) =>
        block.type === "meal" ||
        ((entry.kind === "other" || entry.kind === "guidelines") && isExplicitMealBlock(block));
      const meals = entry.section.blocks.filter(isMeal);
      if (!meals.length) return [entry];
      return [
        {
          ...entry,
          section: {
            ...entry.section,
            blocks: entry.section.blocks.filter((block) => !isMeal(block)),
          },
        },
        {
          ...entry,
          kind: "meals" as const,
          section: { ...entry.section, title: t.meals, blocks: meals },
        },
      ];
    })
    .sort((a, b) => order[a.kind] - order[b.kind] || a.index - b.index);
  return sections
    .map(({ section, kind }) => {
      if (kind === "meals") {
        const firstMeal = mealNumber === 0;
        const cards = presentMeals(section)
          .map((meal) => {
            const body = meal.blocks
              .map((b) => renderBlock(b, locale))
              .filter(Boolean)
              .join("\n");
            if (!body) return "";
            mealNumber += 1;
            return `<article class="meal-card${body.replace(/<[^>]+>/g, "").length > 1300 ? " lengthy" : ""}"><h3>${t.meal} ${mealNumber}${meal.liquid ? ` · ${t.liquid}` : ""}</h3>${body}</article>`;
          })
          .filter(Boolean)
          .join("\n");
        return cards
          ? `<section class="meal-section">${firstMeal ? `<h2>${t.meals}</h2>` : ""}${cards}</section>`
          : "";
      }
      const body = section.blocks
        .map((b) => renderBlock(b, locale))
        .filter(Boolean)
        .join("\n");
      if (!body) return "";
      // Títulos profissionais livres são preservados; categorias explícitas usam o idioma selecionado.
      const title = section.kind && kind !== "other" ? t[kind] : section.title;
      return `<section class="protocol-section"><h2>${escapeHtml(title)}</h2><div class="content-card">${body}</div></section>`;
    })
    .filter(Boolean)
    .join("\n");
}
export function protocoloTemConteudoRenderizavel(protocolo: Protocolo): boolean {
  return renderProtocolSections(protocolo).trim().length > 0;
}
function definitionList(entries: [string, string][]): string {
  const filled = entries.filter(([, v]) => String(v ?? "").trim());
  return filled.length
    ? `<dl class="fields">${filled.map(([k, v]) => `<div class="field"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v).replace(/\n/g, "<br />")}</dd></div>`).join("")}</dl>`
    : "";
}
function renderAnamnese(anamnese: Anamnese, locale: ProtocolLocale): string {
  const t = documentLabels(locale);
  const cards: { html: string; wide: boolean }[] = [];
  ANAMNESE_SECTIONS.forEach((section, index) => {
    let body: string;
    if (section.key === "medicacoesEmUso") {
      body = table(
        [t.name, t.dose, t.frequency, t.time, t.reason],
        anamnese.medicacoesEmUso.map((m) => [m.nome, m.dose, m.frequencia, m.horario, m.motivo]),
      );
    } else {
      const raw = anamnese[section.key] as Record<string, string>;
      body = definitionList(
        Object.entries(raw).map(([key, value]) => [
          anamnesisFieldLabel(key, locale),
          section.key === "alimentacao" && (key === "refeicoes" || key === "padrao")
            ? hideMealTimes(value)
            : value,
        ]),
      );
    }
    if (!body) return;
    const wide = section.key === "medicacoesEmUso" || body.replace(/<[^>]+>/g, "").length > 700;
    cards.push({
      wide,
      html: `<article class="anamnesis-card${wide ? " full-width" : ""}"><h3>${section.n}. ${escapeHtml(anamnesisSectionLabel(index, locale))}</h3>${body}</article>`,
    });
  });
  const contact = definitionList([
    [t.birthAge, documentDate(anamnese.header.nascimentoOuIdade, locale)],
    [t.phone, anamnese.header.telefone],
    [t.email, anamnese.header.email],
  ]);
  if (contact)
    cards.unshift({
      wide: contact.length > 900,
      html: `<article class="anamnesis-card"><h3>${t.patient}</h3>${contact}</article>`,
    });
  const rows: string[] = [];
  let pair: string[] = [];
  const flush = () => {
    if (pair.length) rows.push(`<div class="anamnesis-pair">${pair.join("")}</div>`);
    pair = [];
  };
  for (const card of cards) {
    if (card.wide) {
      flush();
      rows.push(card.html);
    } else {
      pair.push(card.html);
      if (pair.length === 2) flush();
    }
  }
  flush();
  return rows.length ? `<div class="anamnesis-cards">${rows.join("\n")}</div>` : "";
}
function renderBio(bio: Bio, locale: ProtocolLocale): string {
  const t = documentLabels(locale);
  const fields = [
    [t.exam, documentDate(bio.dataHoraExame, locale), ""],
    [t.height, decimalComma(bio.alturaM), "m"],
    [t.fatFreeMass, decimalComma(bio.massaLivreGorduraKg ?? ""), "kg"],
    [t.fatMass, decimalComma(bio.massaGorduraKg ?? ""), "kg"],
    [t.bmr, integerValue(bio.taxaMetabolicaBasalKcal), "kcal"],
    [t.visceral, integerValue(bio.nivelGorduraVisceral), ""],
  ].filter((row) => row[1].trim());
  const rows = evolutionTableRows(computeEvolution(bio)).map((row) => [
    documentDate(row[0], locale),
    ...row.slice(1),
  ]);
  return (
    table([t.indicator, t.value, t.unit], fields) +
    table([t.date, `${t.weight} (kg)`, `${t.muscle} (kg)`, `${t.bodyFat} (%)`], rows)
  );
}
function renderEvolution(bio: Bio, locale: ProtocolLocale): string {
  const evolution = computeEvolution(bio);
  if (!evolution.hasTrend || !evolution.first || !evolution.last) return "";
  const t = documentLabels(locale);
  const lines = [
    `${t.period}: ${documentDate(evolution.first.data, locale)} — ${documentDate(evolution.last.data, locale)}.`,
  ];
  for (const [label, value, unit] of [
    [t.weight, evolution.deltaPesoKg, "kg"],
    [t.muscle, evolution.deltaMassaMuscularKg, "kg"],
    [t.bodyFat, evolution.deltaPgcPP, "p.p."],
  ] as const) {
    if (value != null) lines.push(`${label}: ${signedDelta(value, 1)} ${unit}.`);
  }
  return `<aside class="patient-note"><h3>${t.evolution}</h3>${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join("")}</aside>`;
}

const CSS = `
@page {
  size: A4; margin: 17mm 16mm 19mm; background: #faf9f5;
  @bottom-center { font: 8pt Arial, sans-serif; color: #69645e; border-top: 0.5pt solid #c5a880; width: 100%; padding-top: 3mm; }
}
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #faf9f5; color: #2b2b2b; font: 10pt/1.5 Arial, Helvetica, sans-serif; orphans: 3; widows: 3; }
.page-shell { max-width: 210mm; margin: 0 auto; padding: 12mm 16mm; }
.brand-mark { text-align: center; padding: 0 0 7mm; border-bottom: 1px solid #c5a880; margin: 0 0 7mm; }
.brand-mark img { display: inline-block; width: 122mm; max-width: 100%; height: auto; }
.doc-header { background: #fff; border: 1px solid #e4dfd5; border-top: 3px solid #c5a880; border-radius: 7px; padding: 6mm; margin-bottom: 7mm; break-inside: avoid; }
h1 { margin: 0 0 4mm; color: #111; font-size: 19pt; line-height: 1.25; text-transform: uppercase; letter-spacing: 0.02em; }
h2 { color: #111; font-size: 12pt; text-transform: uppercase; letter-spacing: 0.04em; border-left: 3px solid #c5a880; padding-left: 3mm; margin: 7mm 0 3.5mm; }
h3 { margin: 0 0 3mm; color: #111; font-size: 10pt; line-height: 1.4; }
h4 { margin: 0 0 2mm; font-size: 9.5pt; }
h1, h2, h3, h4 { break-after: avoid; page-break-after: avoid; }
p { margin: 0 0 2.5mm; } p:last-child { margin-bottom: 0; }
ul { padding-left: 5mm; margin: 0 0 3mm; } li { margin-bottom: 1.3mm; }
section { margin-bottom: 5mm; }
.meta { color: #69645e; font-size: 8.5pt; }
.doc-header .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 5mm; }
.draft-banner { border: 1px solid #c5a880; background: #f3ecdd; color: #6b552a; padding: 2.5mm 3mm; margin-bottom: 5mm; text-align: center; font-size: 9pt; letter-spacing: 0.08em; }
.anamnesis-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3mm; align-items: start; }
.anamnesis-card, .content-card, .meal-card { background: #fff; border: 1px solid #e4dfd5; border-radius: 6px; padding: 4mm; min-width: 0; }
.anamnesis-pair { margin-bottom: 3mm; break-inside: avoid; } .anamnesis-card { break-inside: auto; } .full-width { margin-bottom: 3mm; }
.anamnesis-card h3 { font-size: 9.5pt; }
.fields { margin: 0; } .field { margin-bottom: 1.5mm; overflow-wrap: anywhere; }
.field dt { display: inline; color: #111; font-weight: 700; } .field dt::after { content: ": "; } .field dd { display: inline; margin: 0; }
.meal-card { margin: 0 0 4mm; break-inside: avoid; } .meal-card.lengthy { break-inside: auto; }
.meal-card > h3 { border-bottom: 1px solid #e4dfd5; padding-bottom: 2.5mm; font-size: 11pt; }
.meal-label { color: #111; } .preparation { margin: 3mm 0; }
.substitutions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 2.5mm; margin-top: 3mm; }
.substitution-group { border: 1px solid #e4dfd5; border-radius: 4px; min-width: 0; }
.substitution-group h4 { background: #111; color: #fff; padding: 2mm 3mm; }
.substitutions.stacked { display: block; break-inside: auto; } .substitutions.stacked > .substitution-group { display: block; width: auto; margin-bottom: 3mm; }
.substitution-group ul { margin: 0; padding: 1.5mm 3mm 2mm 6mm; }
.block { margin: 0 0 3mm; }
table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 9pt; background: #fff; }
thead { display: table-header-group; } tr { break-inside: avoid; page-break-inside: avoid; }
th { background: #111; color: #fff; font-weight: 700; text-align: left; padding: 2mm 2.5mm; border: 1px solid #111; }
td { border: 1px solid #e4dfd5; padding: 2mm 2.5mm; vertical-align: top; }
h2, h3, h4, td, th, p, li, dd { overflow-wrap: anywhere; word-wrap: break-word; }
tbody tr:nth-child(even) td { background: #f5f3ee; }
.patient-note { background: #f5eee1; border-left: 3px solid #c5a880; padding: 3.5mm 4mm; margin: 3mm 0; }
.doc-footer { margin-top: 8mm; text-align: center; break-inside: avoid; color: #69645e; font-size: 8pt; }
.doc-footer .brand-mark { margin-bottom: 3mm; padding-bottom: 4mm; }
.doc-footer .brand-mark img { width: 100mm; }
@media print {
  .page-shell { max-width: none; padding: 0; }
  .content-card { break-inside: auto; }
  .anamnesis-pair, .substitutions { display: table; table-layout: fixed; width: 100%; border-spacing: 3mm 0; }
  .anamnesis-pair > .anamnesis-card, .substitution-group { display: table-cell; width: 50%; vertical-align: top; }
  .substitution-group { width: auto; } .substitutions { break-inside: avoid; }
}
@media screen and (max-width: 640px) { .page-shell { padding: 5mm; } .anamnesis-pair, .substitutions, .doc-header .fields { grid-template-columns: 1fr; } h1 { font-size: 16pt; } }
`;

export type RenderHtmlInput = {
  patientName: string;
  objetivo: Protocolo["objetivo"];
  anamnese: Anamnese;
  bio: Bio;
  protocolo: Protocolo;
  draft: boolean;
  generatedAt?: string;
  version?: number;
};
export function renderProtocolHtml(input: RenderHtmlInput): string {
  const locale = input.protocolo.locale ?? "pt-BR";
  const t = documentLabels(locale);
  const patient = input.patientName.trim() || input.anamnese.header.paciente.trim();
  const age =
    (!input.bio.semExame ? input.bio.idadeAnos : "") ||
    (/^\d{1,3}\s*(?:anos?|años?|years?)?$/i.test(input.anamnese.header.nascimentoOuIdade.trim())
      ? input.anamnese.header.nascimentoOuIdade
      : "");
  const date = documentDate(
    input.anamnese.header.dataConsulta || input.generatedAt || todayBr(),
    locale,
  );
  const generatedAt = documentDate(input.generatedAt || todayBr(), locale);
  const anamnesis = renderAnamnese(input.anamnese, locale);
  const bio = input.bio.semExame ? "" : renderBio(input.bio, locale);
  const goal = input.objetivo
    ? { hipertrofia: t.hypertrophy, recomposicao: t.recomposition, emagrecimento: t.weightLoss }[
        input.objetivo
      ]
    : "";
  const goalFields = definitionList([
    [t.objective, goal],
    [t.calories, input.protocolo.calorieTarget ?? ""],
  ]);
  const brand = `<div class="brand-mark"><img src="${LOGO_DATA_URI}" width="1535" height="270" alt="Dr. João Falcão — Estética Avançada" /></div>`;
  const pageCss = `@page { @bottom-center { content: "${t.page} " counter(page) " ${t.of} " counter(pages); } }`;
  return `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="bioreport-template" content="${DOCUMENT_TEMPLATE_VERSION}" /><meta name="bioreport-logo-sha256" content="${LOGO_SHA256}" />
<title>${escapeHtml(`${t.title} — ${patient || t.patient}`)}</title><style>${CSS}\n${pageCss}</style></head>
<body><main class="page-shell">
${input.draft ? `<div class="draft-banner">${t.draft}</div>` : ""}
${brand}
<header class="doc-header"><h1>${t.title}</h1>${definitionList([
    [t.patient, patient],
    [t.date, date],
    [t.sex, input.bio.semExame ? "" : input.bio.sexo],
    [t.age, age],
  ])}</header>
${anamnesis ? `<section><h2>${t.anamnesis}</h2>${anamnesis}</section>` : ""}
${bio ? `<section><h2>${t.bio}</h2>${bio}${renderEvolution(input.bio, locale)}</section>` : ""}
${goalFields ? `<section><h2>${t.objective}</h2><aside class="patient-note">${goalFields}</aside></section>` : ""}
${renderProtocolSections(input.protocolo)}
<footer class="doc-footer">${brand}<p>${t.footer}</p><p class="meta">${escapeHtml(generatedAt)}${input.version ? ` · ${t.version} ${input.version}` : ""}</p></footer>
</main></body></html>\n`;
}
