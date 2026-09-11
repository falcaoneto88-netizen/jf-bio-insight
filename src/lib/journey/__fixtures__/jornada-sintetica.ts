/**
 * Fixture SINTÉTICO — nenhum dado real de paciente.
 * Usado por testes e pelo script de exportação de HTML (scripts/export-jornada-html.ts).
 */
import { anamneseSchema, bioSchema, protocolSchema, type Bio, type Journey } from "../types";

export const fixtureBio: Bio = bioSchema.parse({
  paciente: "Paciente Sintético Um",
  alturaM: "1,78",
  idadeAnos: "41",
  sexo: "Masculino",
  dataHoraExame: "12/05/2026 09:30",
  taxaMetabolicaBasalKcal: "1365",
  nivelGorduraVisceral: "9",
  historico: Array.from({ length: 24 }, (_, i) => {
    const mes = String((i % 12) + 1).padStart(2, "0");
    const ano = 2024 + Math.floor(i / 12);
    return {
      data: `05/${mes}/${ano}`,
      peso: `${(92 - i * 0.4).toFixed(1).replace(".", ",")}`,
      massaMuscularEsqueletica: `${(37 + i * 0.1).toFixed(1).replace(".", ",")}`,
      pgc: `${(34 - i * 0.3).toFixed(1).replace(".", ",")}`,
    };
  }),
  fontes: ["Fixture sintético"],
  duvidas: [],
});

export const fixtureAnamnese = anamneseSchema.parse({
  header: {
    paciente: "Paciente Sintético Um",
    dataConsulta: "12/05/2026",
    nascimentoOuIdade: "41 anos",
  },
  identificacao: { estadoCivil: "Casado", filhos: "2 (8 e 12 anos)" },
  rotinaProfissional: {},
  sono: { acorda: "06:30", dorme: "23:30", qualidade: "Regular", disposicao: "6" },
  historicoClinico: { doencas: "Hipertensão controlada", medicacoesAnteriores: "Uso anterior de losartana" },
  alergias: {},
  medicacoesEmUso: [{ nome: "Vitamina D", dose: "2000 UI", frequencia: "diária", horario: "manhã", motivo: "reposição" }],
  cirurgias: {},
  emocional: { ansiedade: "5" },
  habitos: { treino: "Sim", modalidade: "Musculação", frequencia: "4x/semana" },
  alimentacao: { refeicoes: "4", agua: "2,5 L" },
  queixaObjetivos: { queixa: "Perda de massa muscular", objetivo: "Recomposição corporal" },
  observacoesClinicas: {},
});

export const fixtureProtocolo = protocolSchema.parse({
  objetivo: "recomposicao",
  instrucoes: "Instruções sintéticas do profissional.",
  sections: [
    {
      id: "s1",
      title: "Estratégia geral",
      blocks: [
        { type: "paragraph", text: "Texto sintético longo ".repeat(40) },
        { type: "list", items: ["Item sintético A", "Item sintético B", "Item sintético C"] },
      ],
    },
    {
      id: "s2",
      title: "Plano alimentar",
      blocks: [
        {
          type: "table",
          columns: ["Refeição", "Horário", "Composição"],
          rows: Array.from({ length: 20 }, (_, i) => [
            `Refeição ${i + 1}`,
            `${String(6 + (i % 14)).padStart(2, "0")}:00`,
            "Composição sintética descrita pelo profissional.",
          ]),
        },
        { type: "patientNote", text: "Observação sintética ao paciente." },
      ],
    },
  ],
  pendencias: ["Pendência interna sintética — nunca aparece no documento."],
});

export const fixtureJourney: Journey = {
  id: "00000000-0000-4000-8000-000000000001",
  patientName: "Paciente Sintético Um",
  status: "protocolo",
  version: 3,
  anamnese: fixtureAnamnese,
  bio: fixtureBio,
  protocolo: fixtureProtocolo,
  internalNotes: ["Nota interna sintética."],
  confirmations: { anamnese: true, bio: true, revisao: true },
  contentHash: "hash-sintetico",
  approvedVersion: null,
  approvedAt: null,
  approvedHash: null,
  createdAt: "2026-05-12T09:30:00.000Z",
  updatedAt: "2026-05-12T09:30:00.000Z",
};
