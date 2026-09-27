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
import { buildPrescriptionSections, prescriptionIssues } from "./prescription-sections";
import {
  REQUIRED_SUBSTITUTION_CATEGORIES,
  missingSubstitutionCategories,
} from "./substitution-categories";
import {
  ANAMNESE_SECTIONS,
  ANAMNESE_FIELD_LABELS,
  CURRENT_PROTOCOL_TEMPLATE_VERSION,
  type Anamnese,
  type Bio,
  type Objetivo,
  type PrescriptionEntry,
  type ProtocolLocale,
  type ProtocolSection,
  type Protocolo,
} from "./types";

/**
 * Versão do gerador. A exigência das 4 categorias na tabela geral vale apenas
 * a partir da v2: documentos anteriores não são reinterpretados.
 */
export const PROTOCOL_GENERATOR_VERSION = "protocolo-openai-2026-09-25-v2";
/** Versão anterior, mantida para leitura de documentos já gerados. */
export const PROTOCOL_GENERATOR_VERSION_V1 = "protocolo-openai-2026-09-16-v1";

const line = z.string().trim().max(1200);

/** Formato exigido em cada substituição: quantidade + unidade + alimento. */
const SUBSTITUTION_HINT =
  'Quantidade + unidade + alimento, ex.: "120 g de frango grelhado", "2 fatias de pão integral". Nunca apenas o nome do alimento.';

/** A tabela geral é a lista de alimentos liberados, não uma lista de vegetais. */
const GENERAL_CATEGORY_HINT = `Tabela geral de substituições: obrigatoriamente uma linha para cada categoria ${REQUIRED_SUBSTITUTION_CATEGORIES.map((c) => c.label).join(", ")}, cada uma com opções reais respeitando as restrições alimentares do paciente. Categorias adicionais (ex.: vegetais, temperos) são permitidas, mas nunca substituem as obrigatórias.`;

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
              categoria: z.enum(["proteina", "carboidrato", "gordura", "outro"]),
            }),
          )
          .max(20),
        preparo: z.string().trim().max(1500),
        substituicoes: z.strictObject({
          proteina: z.array(line.describe(SUBSTITUTION_HINT)).max(3).describe(SUBSTITUTION_HINT),
          carboidrato: z.array(line.describe(SUBSTITUTION_HINT)).max(3).describe(SUBSTITUTION_HINT),
          gordura: z.array(line.describe(SUBSTITUTION_HINT)).max(3).describe(SUBSTITUTION_HINT),
        }),
      }),
    )
    .max(12),
  substituicoesGerais: z
    .array(
      z.strictObject({
        categoria: z.string().trim().max(120).describe(GENERAL_CATEGORY_HINT),
        opcoes: z.array(line).max(14),
      }),
    )
    .max(10)
    .describe(GENERAL_CATEGORY_HINT),
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
  liquidMealNumbers?: number[];
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
    refeicoesLiquidasIndicadas: args.liquidMealNumbers ?? [],
    metaCalorica: energyTargetLine(args.energy),
    instrucoesDoProfissional: args.instrucoes.trim(),
    // Idade clínica preservada mesmo sem exame; ausência fica explícita, nunca inventada.
    identificacaoClinica: {
      idadeOuNascimento: anamnese.header.nascimentoOuIdade.trim() || null,
      dataDaConsulta: anamnese.header.dataConsulta.trim() || null,
    },
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
  args: {
    locale: ProtocolLocale;
    energy: EnergyPlan | null;
    /** Só estas refeições podem sair como líquidas — a IA não decide. */
    liquidMealNumbers?: number[];
    /** Prescrições escritas pelo profissional; só as confirmadas são emitidas. */
    prescriptions?: PrescriptionEntry[];
  },
): { sections: ProtocolSection[]; pendencias: string[] } {
  const t = documentLabels(args.locale);
  const sections: ProtocolSection[] = [];
  const pendencias = [...output.pendencias];

  const metaLinha = energyTargetLine(args.energy);
  const liquidas = new Set(args.liquidMealNumbers ?? []);
  const objetivoBlocos = [
    ...(output.objetivoResumo.trim()
      ? [{ type: "paragraph" as const, text: output.objetivoResumo.trim() }]
      : []),
    ...(metaLinha ? [{ type: "list" as const, items: [`${t.calories}: ${metaLinha}`] }] : []),
  ];
  if (objetivoBlocos.length)
    sections.push({
      id: "objetivo",
      title: t.objective,
      kind: "objective",
      blocks: objetivoBlocos,
    });

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

  // A IA não decide refeições líquidas: divergência fica registada para revisão.
  output.refeicoes.forEach((meal, index) => {
    if (meal.liquida && !liquidas.has(index + 1))
      pendencias.push(
        `Refeição ${index + 1}: a IA sugeriu refeição líquida sem indicação do profissional; foi mantida sólida.`,
      );
  });

  if (output.refeicoes.length) {
    sections.push({
      id: "plano-alimentar",
      title: t.meals,
      kind: "meals",
      blocks: output.refeicoes.map((meal, index) => ({
        type: "meal" as const,
        // Líquida apenas quando o profissional indicou aquela refeição.
        liquid: liquidas.has(index + 1),
        foods: meal.alimentos
          .filter((f) => f.nome.trim())
          .map((f) => ({
            name: f.nome.trim(),
            quantity: f.quantidade.trim(),
            category: f.categoria,
          })),
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
  // Lista geral de alimentos liberados: precisa das 4 categorias base. Não é
  // conclusão clínica nem substitui as substituições por refeição.
  for (const missing of missingSubstitutionCategories(
    gerais.map((g) => ({ label: g.categoria, options: g.opcoes })),
  ))
    pendencias.push(
      `Tabela geral de substituições: falta a categoria ${missing.label}. Preencha com as opções liberadas, respeitando as restrições alimentares.`,
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

  // Prescrições: montagem central partilhada com a integridade das gravações.
  // A IA não cria, não completa e não remonta medicação.
  sections.push(...buildPrescriptionSections(args.prescriptions, args.locale));
  pendencias.push(...prescriptionIssues(args.prescriptions));

  return { sections, pendencias };
}

export function protocoloGerado(args: {
  objetivo: Objetivo;
  locale: ProtocolLocale;
  instrucoes: string;
  mealCount: number | null;
  energy: EnergyPlan | null;
  energyInput?: Protocolo["energyInput"];
  liquidMealNumbers?: number[];
  prescriptions?: PrescriptionEntry[];
  output: ProtocolAiOutput;
  extraPendencias?: string[];
}): Protocolo {
  const { sections, pendencias } = buildProtocolSections(args.output, {
    locale: args.locale,
    energy: args.energy,
    ...(args.liquidMealNumbers ? { liquidMealNumbers: args.liquidMealNumbers } : {}),
    ...(args.prescriptions ? { prescriptions: args.prescriptions } : {}),
  });
  return {
    templateVersion: CURRENT_PROTOCOL_TEMPLATE_VERSION,
    objetivo: args.objetivo,
    instrucoes: args.instrucoes,
    locale: args.locale,
    sections,
    pendencias: [...(args.extraPendencias ?? []), ...pendencias].slice(0, 60),
    generator: PROTOCOL_GENERATOR_VERSION,
    ...(args.mealCount ? { mealCount: args.mealCount } : {}),
    ...(args.energy ? { energy: args.energy } : {}),
    ...(args.energy?.method === "profissional"
      ? { calorieTarget: args.energy.professionalTarget }
      : {}),
    ...(args.energyInput ? { energyInput: args.energyInput } : {}),
    ...(args.liquidMealNumbers?.length ? { liquidMealNumbers: args.liquidMealNumbers } : {}),
    ...(args.prescriptions?.length ? { prescriptions: args.prescriptions } : {}),
  };
}
