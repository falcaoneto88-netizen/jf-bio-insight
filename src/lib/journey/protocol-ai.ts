/**
 * Geração do protocolo completo — partes puras (partilhadas pela UI e pelo MCP).
 * O contexto enviado ao modelo não inclui nome, telefone, e-mail nem IDs de CRM
 * nos campos estruturados. Textos livres seguem como foram escritos pelo
 * profissional/paciente e podem conter identificadores: não são anonimizados.
 */
import { z } from "zod";

import { computeEvolution } from "./evolution";
import { energyTargetLine, type EnergyPlan } from "./energy";
import { documentLabels } from "./document-locale";
import {
  ANAMNESE_SECTIONS,
  ANAMNESE_FIELD_LABELS,
  CURRENT_PROTOCOL_TEMPLATE_VERSION,
  type Anamnese,
  type Bio,
  type Objetivo,
  type ProtocolLocale,
  type ProtocolSection,
  type Protocolo,
} from "./types";

export const PROTOCOL_GENERATOR_VERSION = "protocolo-openai-2026-09-16-v1";

const line = z.string().trim().max(1200);

export const protocolAiOutputSchema = z.strictObject({
  objetivoResumo: z.string().trim().max(3000),
  orientacoesGerais: z.array(line).max(24),
  orientacoesAtividade: z.array(line).max(12),
  refeicoes: z
    .array(
      z.strictObject({
        liquida: z.boolean(),
        alimentos: z
          .array(
            z.strictObject({
              nome: z.string().trim().max(300),
              quantidade: z.string().trim().max(120),
            }),
          )
          .max(20),
        preparo: z.string().trim().max(1500),
        substituicoes: z.strictObject({
          proteina: z.array(line).max(3),
          carboidrato: z.array(line).max(3),
          gordura: z.array(line).max(3),
        }),
      }),
    )
    .max(12),
  substituicoesGerais: z
    .array(
      z.strictObject({
        categoria: z.string().trim().max(120),
        opcoes: z.array(line).max(14),
      }),
    )
    .max(10),
  prescricoes: z
    .array(
      z.strictObject({
        substancia: z.string().trim().max(200),
        dose: z.string().trim().max(200),
        via: z.string().trim().max(120),
        frequencia: z.string().trim().max(200),
        observacoes: z.string().trim().max(600),
      }),
    )
    .max(20),
  pendencias: z.array(z.string().trim().max(600)).max(24),
});
export type ProtocolAiOutput = z.infer<typeof protocolAiOutputSchema>;

/* --------------------------- contexto enviado --------------------------- */

const IDENTIFYING = new Set(["paciente", "telefone", "email", "nome"]);

function anamneseGrupos(anamnese: Anamnese): Record<string, Record<string, string>> {
  const groups: Record<string, Record<string, string>> = {};
  for (const section of ANAMNESE_SECTIONS) {
    if (section.key === "medicacoesEmUso") continue;
    const raw = anamnese[section.key] as Record<string, string>;
    const filled = Object.entries(raw).filter(([, value]) => value.trim());
    if (filled.length)
      groups[section.label] = Object.fromEntries(
        filled.map(([key, value]) => [ANAMNESE_FIELD_LABELS[key] ?? key, value]),
      );
  }
  return groups;
}

export function buildProtocolContext(args: {
  objetivo: Objetivo;
  locale: ProtocolLocale;
  instrucoes: string;
  mealCount: number | null;
  energy: EnergyPlan | null;
  calorieTarget?: string;
  anamnese: Anamnese;
  bio: Bio;
}) {
  const { anamnese, bio } = args;
  const evolution = computeEvolution(bio);
  const medicacoes = anamnese.medicacoesEmUso
    .filter((m) => [m.nome, m.dose, m.frequencia, m.horario, m.motivo].some((v) => v.trim()))
    .map((m) => ({
      substancia: m.nome,
      dose: m.dose,
      frequencia: m.frequencia,
      horario: m.horario,
      motivo: m.motivo,
    }));
  const context = {
    objetivo: args.objetivo,
    idioma: args.locale,
    numeroDeRefeicoes: args.mealCount,
    metaCalorica: energyTargetLine(args.energy) || args.calorieTarget || "",
    instrucoesDoProfissional: args.instrucoes.trim(),
    anamnese: anamneseGrupos(anamnese),
    medicacoesEmUso: medicacoes,
    alergiasERestricoes: {
      medicamentos: anamnese.alergias.medicamentos,
      alimentares: anamnese.alergias.alimentares,
    },
    bioimpedancia: bio.semExame
      ? null
      : {
          sexo: bio.sexo,
          idadeAnos: bio.idadeAnos,
          alturaM: bio.alturaM,
          dataDoExame: bio.dataHoraExame,
          taxaMetabolicaBasalKcal: bio.taxaMetabolicaBasalKcal,
          nivelGorduraVisceral: bio.nivelGorduraVisceral,
          massaLivreGorduraKg: bio.massaLivreGorduraKg ?? "",
          massaGorduraKg: bio.massaGorduraKg ?? "",
          historico: bio.historico,
        },
    evolucao: evolution.hasTrend ? evolution.summaryLines : [],
  };
  // Defesa adicional: nenhum campo estruturado identificador vai no payload.
  const stripped = JSON.parse(
    JSON.stringify(context, (key, value) => (IDENTIFYING.has(key) ? undefined : value)),
  ) as typeof context;
  return stripped;
}

/* --------------------------- montagem do documento --------------------------- */

const exactly3 = (items: string[]): string[] => items.map((i) => i.trim()).filter(Boolean);

export function buildProtocolSections(
  output: ProtocolAiOutput,
  args: { locale: ProtocolLocale; energy: EnergyPlan | null; calorieTarget?: string },
): { sections: ProtocolSection[]; pendencias: string[] } {
  const t = documentLabels(args.locale);
  const sections: ProtocolSection[] = [];
  const pendencias = [...output.pendencias];

  const metaLinha = energyTargetLine(args.energy) || args.calorieTarget?.trim() || "";
  const objetivoBlocos = [
    ...(output.objetivoResumo.trim()
      ? [{ type: "paragraph" as const, text: output.objetivoResumo.trim() }]
      : []),
    ...(metaLinha ? [{ type: "list" as const, items: [`${t.calories}: ${metaLinha}`] }] : []),
  ];
  if (objetivoBlocos.length)
    sections.push({ id: "objetivo", title: t.objective, kind: "objective", blocks: objetivoBlocos });

  const orientacoes = [...output.orientacoesGerais, ...output.orientacoesAtividade]
    .map((i) => i.trim())
    .filter(Boolean);
  if (orientacoes.length)
    sections.push({
      id: "orientacoes",
      title: t.guidelines,
      kind: "guidelines",
      blocks: [{ type: "list", items: orientacoes }],
    });

  if (output.refeicoes.length) {
    sections.push({
      id: "plano-alimentar",
      title: t.meals,
      kind: "meals",
      blocks: output.refeicoes.map((meal) => ({
        type: "meal" as const,
        liquid: meal.liquida,
        foods: meal.alimentos
          .filter((f) => f.nome.trim())
          .map((f) => ({ name: f.nome.trim(), quantity: f.quantidade.trim() })),
        preparation: meal.preparo.trim(),
        substitutions: {
          protein: exactly3(meal.substituicoes.proteina),
          carbohydrate: exactly3(meal.substituicoes.carboidrato),
          fat: exactly3(meal.substituicoes.gordura),
        },
      })),
    });
  }

  const gerais = output.substituicoesGerais.filter(
    (g) => g.categoria.trim() && g.opcoes.some((o) => o.trim()),
  );
  if (gerais.length)
    sections.push({
      id: "substituicoes",
      title: t.substitutions,
      kind: "substitutions",
      blocks: [
        {
          type: "table",
          columns: [t.food, t.value],
          rows: gerais.map((g) => [g.categoria.trim(), g.opcoes.filter(Boolean).join("; ")]),
        },
      ],
    });

  const prescricoes = output.prescricoes.filter((p) => p.substancia.trim());
  if (prescricoes.length)
    sections.push({
      id: "prescricoes",
      title: t.prescription,
      kind: "prescription",
      blocks: [
        {
          type: "table",
          columns: [t.name, t.dose, t.unit, t.frequency, t.reason],
          rows: prescricoes.map((p) => [
            p.substancia.trim(),
            p.dose.trim(),
            p.via.trim(),
            p.frequencia.trim(),
            p.observacoes.trim(),
          ]),
        },
      ],
    });
    pendencias.push(
      ...prescricoes.map(
        (p) =>
          `Confirme individualmente antes de emitir: ${p.substancia.trim()} ${p.dose.trim()}`.trim(),
      ),
    );

  return { sections, pendencias };
}

export function protocoloGerado(args: {
  objetivo: Objetivo;
  locale: ProtocolLocale;
  instrucoes: string;
  mealCount: number | null;
  energy: EnergyPlan | null;
  energyInput?: Protocolo["energyInput"];
  calorieTarget?: string;
  output: ProtocolAiOutput;
  extraPendencias?: string[];
}): Protocolo {
  const { sections, pendencias } = buildProtocolSections(args.output, {
    locale: args.locale,
    energy: args.energy,
    calorieTarget: args.calorieTarget,
  });
  return {
    templateVersion: CURRENT_PROTOCOL_TEMPLATE_VERSION,
    objetivo: args.objetivo,
    instrucoes: args.instrucoes,
    locale: args.locale,
    ...(args.calorieTarget ? { calorieTarget: args.calorieTarget } : {}),
    sections,
    pendencias: [...(args.extraPendencias ?? []), ...pendencias].slice(0, 60),
    generator: PROTOCOL_GENERATOR_VERSION,
    ...(args.mealCount ? { mealCount: args.mealCount } : {}),
    ...(args.energy ? { energy: args.energy } : {}),
    ...(args.energyInput ? { energyInput: args.energyInput } : {}),
  };
}
