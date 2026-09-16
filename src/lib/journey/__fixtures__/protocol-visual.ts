/** Exemplos exclusivamente fictícios para revisão do layout. Não são recomendações clínicas. */
import { anamneseSchema, bioSchema, protocolSchema } from "../types";
import type { RenderHtmlInput } from "../html";

export function shortProtocolFixture(): RenderHtmlInput {
  return {
    patientName: "Paciente Fictícia Aurora",
    objetivo: "recomposicao",
    draft: true,
    version: 2,
    generatedAt: "16/09/2026",
    anamnese: anamneseSchema.parse({
      header: {
        paciente: "Paciente Fictícia Aurora",
        dataConsulta: "16/09/2026",
        nascimentoOuIdade: "38 anos",
      },
      identificacao: { estadoCivil: "A confirmar" },
      rotinaProfissional: { profissao: "Profissão fictícia", tipoHorario: "09:00 às 17:30" },
      sono: { acorda: "06:20", dorme: "22:40", qualidade: "Relato fictício de teste" },
      historicoClinico: {},
      alergias: { medicamentos: "A confirmar" },
      medicacoesEmUso: [
        {
          nome: "Medicamento fictício A",
          dose: "Dose fictícia",
          frequencia: "Conforme registro de teste",
          horario: "07:35",
          motivo: "Teste de apresentação",
        },
      ],
      cirurgias: {},
      emocional: {},
      habitos: {},
      alimentacao: { agua: "Volume a confirmar" },
      queixaObjetivos: {},
      observacoesClinicas: {},
    }),
    bio: bioSchema.parse({
      paciente: "Paciente Fictícia Aurora",
      sexo: "Feminino",
      idadeAnos: "38",
      alturaM: "1,71",
      dataHoraExame: "16/09/2026 09:10",
      taxaMetabolicaBasalKcal: "1523",
      historico: [
        { data: "16/09/2026", peso: "68,7", massaMuscularEsqueletica: "26,8", pgc: "29,1" },
      ],
    }),
    protocolo: protocolSchema.parse({
      templateVersion: "modelo-protocolo-v2",
      locale: "pt-BR",
      objetivo: "recomposicao",
      sections: [
        {
          id: "orientacoes",
          title: "Orientações gerais e rotina",
          kind: "guidelines",
          blocks: [
            {
              type: "patientNote",
              text: "DADOS FICTÍCIOS — apenas demonstração de layout. Sem validade clínica.",
            },
          ],
        },
        {
          id: "refeicoes",
          title: "Plano alimentar",
          kind: "meals",
          blocks: [
            {
              type: "meal",
              liquid: false,
              foods: [
                { name: "Alimento demonstrativo A", quantity: "Porção registrada no teste" },
                { name: "Alimento demonstrativo B", quantity: "Quantidade a confirmar" },
              ],
              preparation: "Preparo demonstrativo: misturar por 5 minutos.",
              substitutions: {
                protein: ["Alternativa proteica fictícia A — porção de teste"],
                carbohydrate: ["Alternativa de carboidrato fictícia B — porção de teste"],
                fat: [],
              },
            },
            {
              type: "meal",
              liquid: true,
              foods: [{ name: "Preparação líquida fictícia", quantity: "Volume de teste" }],
              preparation: "",
              substitutions: { protein: [], carbohydrate: [], fat: [] },
            },
          ],
        },
        {
          id: "suplementos",
          title: "Prescrição e suplementação",
          kind: "prescription",
          blocks: [
            {
              type: "table",
              columns: ["Substância", "Dose", "Horário"],
              rows: [["Suplemento fictício A", "Dose não clínica de teste", "21:25"]],
            },
          ],
        },
      ],
    }),
  };
}

export function longProtocolFixture(): RenderHtmlInput {
  const base = shortProtocolFixture();
  const plan = protocolSchema.parse({
    templateVersion: "modelo-protocolo-v2",
    locale: "es",
    objetivo: "hipertrofia",
    calorieTarget: "Meta ficticia: 2.173 kcal/día",
    sections: [
      {
        id: "routine",
        title: "Orientaciones y rutina",
        kind: "guidelines",
        blocks: [
          {
            type: "patientNote",
            text: "DATOS FICTICIOS — demostración de formato, sin validez clínica.",
          },
          {
            type: "paragraph",
            text: "Observación ficticia para comprobar que los párrafos extensos se dividen de forma legible entre páginas. ".repeat(
              18,
            ),
          },
        ],
      },
      {
        id: "plan",
        title: "Plan alimentario",
        kind: "meals",
        blocks: Array.from({ length: 7 }, (_, i) => ({
          type: "meal",
          liquid: i === 5,
          foods: [
            { name: `Alimento ficticio ${i + 1}A`, quantity: "Porción de prueba" },
            { name: `Alimento ficticio ${i + 1}B`, quantity: "Cantidad pendiente de confirmar" },
          ],
          preparation: `Preparación ilustrativa ${i + 1}, registrada exclusivamente para validar el documento.`,
          substitutions: {
            protein: [
              "Alternativa ficticia P — cantidad de prueba",
              "Segunda alternativa P — cantidad de prueba",
            ],
            carbohydrate: ["Alternativa ficticia C — cantidad de prueba"],
            fat: ["Alternativa ficticia G — cantidad de prueba"],
          },
        })),
      },
      {
        id: "general",
        title: "Tabla general de sustituciones",
        kind: "substitutions",
        blocks: [
          {
            type: "table",
            columns: ["Grupo", "Opción registrada", "Cantidad"],
            rows: Array.from({ length: 44 }, (_, i) => [
              `Grupo ficticio ${i + 1}`,
              `Opción ilustrativa ${i + 1}, sin equivalencia nutricional.`,
              "Cantidad de prueba",
            ]),
          },
        ],
      },
      {
        id: "prescription",
        title: "Prescripción y suplementación",
        kind: "prescription",
        blocks: [
          {
            type: "table",
            columns: ["Sustancia", "Dosis", "Horario"],
            rows: [["Suplemento ficticio B", "Dosis de prueba, sin validez clínica", "20:45"]],
          },
        ],
      },
      {
        id: "other",
        title: "Seguimiento individual",
        kind: "other",
        blocks: [
          {
            type: "paragraph",
            text: "Seguimiento ficticio que debe permanecer al final del documento.",
          },
        ],
      },
    ],
  });
  return {
    ...base,
    patientName: "Paciente Ficticio Bento",
    objetivo: "hipertrofia",
    version: 4,
    anamnese: anamneseSchema.parse({
      ...base.anamnese,
      header: {
        paciente: "Paciente Ficticio Bento",
        dataConsulta: "16/09/2026",
        nascimentoOuIdade: "52 años",
      },
      identificacao: { estadoCivil: "Pendiente de confirmar" },
      rotinaProfissional: { profissao: "Profesión ficticia", tipoHorario: "08:30 a 17:15" },
      sono: { acorda: "06:25", dorme: "22:55" },
      alergias: { medicamentos: "Pendiente de confirmar" },
      medicacoesEmUso: [
        { nome: "Medicamento ficticio B", dose: "Dosis de prueba", horario: "06:45" },
      ],
      alimentacao: { agua: "Volumen pendiente de confirmar" },
      observacoesClinicas: {
        adicionais:
          "Observación ficticia extensa para verificar el ajuste del contenido y la división de los cards entre páginas, sin pérdidas de texto. ".repeat(
            27,
          ),
      },
    }),
    bio: bioSchema.parse({
      paciente: "Paciente Ficticio Bento",
      sexo: "Masculino",
      idadeAnos: "52",
      alturaM: "1,83",
      dataHoraExame: "16/09/2026 11:10",
      taxaMetabolicaBasalKcal: "1876",
      nivelGorduraVisceral: "8",
      historico: [
        { data: "01/06/2026", peso: "86,4", massaMuscularEsqueletica: "34,2", pgc: "27,6" },
        { data: "16/09/2026", peso: "85,1", massaMuscularEsqueletica: "34,7", pgc: "26,0" },
      ],
    }),
    protocolo: plan,
  };
}
