/** Adaptação somente de apresentação: não modifica o protocolo persistido. */
import type { ProtocolBlock, ProtocolSection } from "./types";

export const plainKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
type Kind = NonNullable<ProtocolSection["kind"]>;
export function sectionKind(section: ProtocolSection): Kind {
  if (section.kind) return section.kind;
  const title = plainKey(section.title);
  if (/suplement|prescri|medica|supplement|prescription/.test(title)) return "prescription";
  if (/substitu|sustitu/.test(title)) return "substitutions";
  if (/objetiv|meta calor|calori|goal/.test(title)) return "objective";
  if (
    /aliment|refeic|comida|meal|desayuno|almuerzo|cena|merienda|cafe da manha|almoco|jantar|lanche|ceia|breakfast|lunch|dinner|snack|cardapio|dieta|plano nutricional/.test(
      title,
    ) ||
    section.blocks.some((b) => b.type === "meal")
  )
    return "meals";
  if (/orientac|orientacion|rotina|rutina|routine|guidance|guideline|estrategia geral/.test(title))
    return "guidelines";
  return "other";
}

const clock = String.raw`(?:[01]?\d|2[0-3])(?::[0-5]\d(?::[0-5]\d)?(?:\s*[ap]\.?m\.?)?|h(?:[0-5]\d)?\b|\s*horas?\b|\s*[ap]\.?m\.?)`;
const range = new RegExp(
  String.raw`\b(?:entre\s+|das?\s+|from\s+)?${clock}\s*(?:[-–—]|às?|a|até|e|y|to|until)\s*${clock}`,
  "giu",
);
const hourRange =
  /\b(?:entre\s+|das?\s+|from\s+)?(?:[01]?\d|2[0-3])\s*(?:às?|a|até|[-–—]|e|y|to)\s*(?:[01]?\d|2[0-3])(?:h(?:[0-5]\d)?|\s*horas?)\b/giu;
const clockValue = new RegExp(
  String.raw`(?:(?<![\p{L}\p{N}])(?:às?|as|a las|at|entre|das?|por volta das|cerca de las)\s+)?\b${clock}`,
  "giu",
);
export function isTimeColumn(label: string): boolean {
  return /^(?:horarios?|horas?|time|meal time|faixa)(?:\s+(?:da refeicao|sugerido|opcional|of day|de horario))?(?:\s*\([^)]*\))?\s*:?$/.test(
    plainKey(label),
  );
}
export function hideMealTimes(value: string): string {
  // Duração de preparo é dado clínico do plano, não um horário de refeição.
  const durations: string[] = [];
  const durationPattern = /\b(?:por|durante|for)\s+\d{1,2}\s*(?:h(?:\d{2})?|horas?|hours?)\b/giu;
  const protectedValue = value.replace(durationPattern, (duration) => {
    durations.push(duration);
    return `\uE000${durations.length - 1}\uE001`;
  });
  const cleaned = protectedValue
    .replace(hourRange, "")
    .replace(range, "")
    .replace(clockValue, "")
    .replace(/\b(?:horário|horario|hora|time)\s*:\s*(?:(?:[01]?\d|2[0-3])\b)?/giu, "")
    .replace(/\(\s*[-–—:;,]*\s*\)|\[\s*[-–—:;,]*\s*\]/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/^\s*[-–—:;,|]+\s*|\s*[-–—:;,|]+\s*$/gm, "")
    .replace(/\uE000(\d+)\uE001/g, (_, index: string) => durations[Number(index)] ?? "")
    .trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : "";
}

// Clock stripping never runs on prescription, sleep or work sections.
export function cleanMealBlock(block: ProtocolBlock): ProtocolBlock {
  switch (block.type) {
    case "paragraph":
    case "patientNote":
      return { ...block, text: hideMealTimes(block.text) };
    case "list":
      return { ...block, items: block.items.map(hideMealTimes).filter(Boolean) };
    case "table": {
      const kept = block.columns
        .map((label, index) => ({ label, index }))
        .filter((c) => c.label.trim() && !isTimeColumn(c.label));
      return {
        ...block,
        columns: kept.map((c) => hideMealTimes(c.label)),
        rows: block.rows.map((row) => kept.map((c) => hideMealTimes(row[c.index] ?? ""))),
      };
    }
    case "meal":
      return {
        ...block,
        foods: block.foods.map((food) => ({
          name: hideMealTimes(food.name),
          quantity: hideMealTimes(food.quantity),
        })),
        preparation: hideMealTimes(block.preparation),
        substitutions: {
          protein: block.substitutions.protein.map(hideMealTimes),
          carbohydrate: block.substitutions.carbohydrate.map(hideMealTimes),
          fat: block.substitutions.fat.map(hideMealTimes),
        },
      };
  }
}

const mealHeading =
  /^(?:(?:\d+[.)ºª]?\s*)?(?:refei[cç][aã]o(?:\s*\d+)?|comida(?:\s*\d+)?|meal(?:\s*\d+)?|caf[eé]\s+da\s+manh[aã]|pequeno[- ]almo[cç]o|desayuno|breakfast|almo[cç]o|almuerzo|lunch|jantar|cena|dinner|ceia|lanche(?:\s+da\s+(?:manh[aã]|tarde|noite))?|merienda|snack))(?:\s*[-–—:|]?\s*)/i;
function headingContent(text: string): { body: string; liquid: boolean } | null {
  const trimmed = hideMealTimes(text.trim().replace(/^#{1,6}\s*|^\*\*|\*\*$/g, ""));
  const match = mealHeading.exec(trimmed);
  if (!match) return null;
  let body = hideMealTimes(trimmed.slice(match[0].length));
  const liquid = /^\(?l[ií]quid[ao]?\)?(?:\s|[-–—:|]|$)/i.test(body);
  if (liquid) body = body.replace(/^\(?l[ií]quid[ao]?\)?\s*[-–—:|]?\s*/i, "");
  return { body, liquid };
}
export type MealPresentation = { liquid: boolean; blocks: ProtocolBlock[] };

/** Reconhece refeições em seções antigas de título genérico, sem tocar nas outras rotinas. */
export function isExplicitMealBlock(block: ProtocolBlock): boolean {
  if (block.type === "meal") return true;
  if (block.type === "table")
    return block.columns.some((label) =>
      /^(refeicao|comida|meal|refeicoes|meals)$/.test(plainKey(label)),
    );
  const lines =
    block.type === "paragraph" ? block.text.split("\n") : block.type === "list" ? block.items : [];
  const first = lines.find((line) => line.trim());
  return Boolean(first && headingContent(first));
}

/** Reconhece formatos históricos sem inferir alimentos, porções ou equivalências. */
export function presentMeals(section: ProtocolSection): MealPresentation[] {
  const cards: MealPresentation[] = [];
  let current: MealPresentation | undefined;
  const start = (liquid = false) => {
    current = { liquid, blocks: [] };
    cards.push(current);
    return current;
  };
  const append = (block: ProtocolBlock) =>
    (current ?? start(headingContent(section.title)?.liquid ?? false)).blocks.push(
      cleanMealBlock(block),
    );
  for (const block of section.blocks) {
    if (block.type === "meal") {
      start(block.liquid).blocks.push(cleanMealBlock(block));
      continue;
    }
    if (block.type === "table") {
      const mealIndex = block.columns.findIndex((c) =>
        /^(refeicao|comida|meal|refeicoes|meals)$/.test(plainKey(c)),
      );
      if (mealIndex !== -1) {
        const kept = block.columns
          .map((label, index) => ({ label, index }))
          .filter((c) => c.index !== mealIndex && c.label.trim() && !isTimeColumn(c.label));
        for (const row of block.rows) {
          const name = row[mealIndex] ?? "";
          const body = headingContent(name)?.body ?? hideMealTimes(name);
          if (!body && !kept.some((c) => hideMealTimes(row[c.index] ?? ""))) continue;
          const liquidColumn = block.columns.findIndex((c) =>
            /^(tipo|forma|type)$/.test(plainKey(c)),
          );
          const card = start(
            (headingContent(name)?.liquid ?? /^l[ií]quid[ao]?$/i.test(name.trim())) ||
              (liquidColumn >= 0 && /^l[ií]quid[ao]?$/i.test(row[liquidColumn] ?? "")),
          );
          // Preserve any clinical text appended to the old meal label.
          if (body && !/^(\d+|caf[eé].*|almo[cç]o|jantar|ceia)$/i.test(body))
            card.blocks.push({ type: "paragraph", text: body });
          if (kept.length)
            card.blocks.push(
              cleanMealBlock({
                type: "table",
                columns: kept.map((c) => c.label),
                rows: [kept.map((c) => row[c.index] ?? "")],
              }),
            );
        }
        continue;
      }
    }
    if (block.type === "paragraph" || block.type === "list") {
      const lines = block.type === "list" ? block.items : block.text.split("\n");
      if (lines.some((line) => headingContent(line))) {
        for (const line of lines) {
          const heading = headingContent(line);
          if (heading) {
            start(heading.liquid);
            if (heading.body) append({ type: "paragraph", text: heading.body });
          } else if (line.trim())
            append(
              block.type === "list"
                ? { type: "list", items: [line] }
                : { type: "paragraph", text: line },
            );
        }
        continue;
      }
    }
    append(block);
  }
  return cards;
}
