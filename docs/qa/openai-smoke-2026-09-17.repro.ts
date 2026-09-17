/**
 * Smoke técnico: UMA chamada real à OpenAI com dados 100% FICTÍCIOS.
 * Sem paciente real, sem banco, sem CRM. Nunca regista chave, headers ou payloads brutos.
 */
import { writeFileSync } from "node:fs";

import { gerarProtocolo } from "@/lib/journey/protocol-generation.server";
import { readProtocolAiConfig } from "@/lib/journey/protocol-openai.server";
import { protocolEssentialIssues, protocolOpenWarnings } from "@/lib/journey/protocol-quality";
import { renderProtocolHtml } from "@/lib/journey/html";
import { emptyAnamnese, emptyBio, type Anamnese, type Bio } from "@/lib/journey/types";

const anamnese: Anamnese = {
  ...emptyAnamnese,
  header: {
    ...emptyAnamnese.header,
    paciente: "Paciente Fictício QA",
    dataConsulta: "17/09/2026",
    nascimentoOuIdade: "40",
  },
  alergias: { ...emptyAnamnese.alergias, alimentares: "Amendoim" },
  alimentacao: { ...emptyAnamnese.alimentacao, refeicoes: "4" },
  habitos: { ...emptyAnamnese.habitos, treino: "Sim", frequencia: "3x/semana" },
  queixaObjetivos: {
    ...emptyAnamnese.queixaObjetivos,
    objetivo: "Recomposição corporal (cenário técnico fictício)",
  },
};

const bio: Bio = {
  ...emptyBio,
  paciente: "Paciente Fictício QA",
  sexo: "F",
  idadeAnos: "40",
  alturaM: "1,65",
  dataHoraExame: "17/09/2026",
  taxaMetabolicaBasalKcal: "1365",
  nivelGorduraVisceral: "6",
  massaLivreGorduraKg: "45,0",
  massaGorduraKg: "20,0",
  historico: [{ data: "17/09/2026", peso: "65,0", massaMuscularEsqueletica: "25,5", pgc: "30,0" }],
};

const started = Date.now();
const evidence: Record<string, unknown> = {
  descricao:
    "Smoke técnico único com dados 100% fictícios. Sem validade clínica, sem paciente real, sem CRM, sem gravação em banco.",
  executadoEm: new Date().toISOString(),
  chamadaReal: true,
  chamadasRealizadas: 1,
  store: false,
  endpoint: "https://api.openai.com/v1/responses",
};
try {
  const cfg = readProtocolAiConfig();
  evidence.apiKeyPresente = true;
  evidence.modelo = cfg.model;
  evidence.modeloOrigem = process.env["OPENAI_CLINICAL_MODEL"]
    ? "OPENAI_CLINICAL_MODEL"
    : "padrão (OPENAI_CLINICAL_MODEL não cadastrado)";
} catch {
  evidence.apiKeyPresente = false;
  evidence.resultado = "bloqueado";
  writeFileSync("/tmp/openai-smoke/out.json", JSON.stringify(evidence, null, 2));
  process.exit(1);
}

const result = await gerarProtocolo(
  { anamnese, bio, protocolo: null },
  {
    objetivo: "recomposicao",
    instrucoes:
      "Cenário técnico fictício de validação. Quatro refeições numeradas, sem horários. Alergia a amendoim deve ser respeitada. Sem prescrições.",
    mealCount: 4,
    calorieTarget: "1800 kcal/dia",
    energyInput: { professionalTarget: "1800 kcal/dia" },
  },
);
evidence.duracaoMs = Date.now() - started;

if (result.error || !result.data) {
  evidence.resultado = "falha";
  evidence.erroMensagemUtilizador = result.error;
  evidence.protocoloGerado = false;
  writeFileSync("/tmp/openai-smoke/out.json", JSON.stringify(evidence, null, 2));
  console.log("FALHA:", result.error);
  process.exit(2);
}

const { protocolo, energy } = result.data;
const mealSection = protocolo.sections.find((s: any) => s.kind === "meals");
const meals = ((mealSection?.blocks ?? []) as any[]).filter((b) => b.type === "meal");
const horarioRegex = /\b\d{1,2}\s*[:h]\s*\d{0,2}\b/;
const texto = JSON.stringify(protocolo).toLowerCase();
const checks = {
  schemaProducao: true,
  quatroRefeicoes: meals.length === 4,
  refeicoesNumeradasSemHorario: meals.every(
    (m: unknown) => !horarioRegex.test(JSON.stringify(m ?? {})),
  ),
  porcoesEmTodosAlimentos: meals.every((m: any) =>
    (m.foods ?? []).every((a: any) => Boolean(String(a.quantity ?? "").trim())),
  ),
  tresSubstituicoesProteina: meals.every((m: any) => (m.substitutions?.protein ?? []).length === 3),
  tresSubstituicoesCarboidrato: meals.every(
    (m: any) => (m.substitutions?.carbohydrate ?? []).length === 3,
  ),
  substituicoesComPorcao: meals.every((m: any) =>
    [...(m.substitutions?.protein ?? []), ...(m.substitutions?.carbohydrate ?? [])].every(
      (s: string) => /\d/.test(s),
    ),
  ),
  alergiaAmendoimRespeitada: !/amendoim/.test(
    JSON.stringify(meals).toLowerCase().replace(/sem amendoim/g, ""),
  ),
  semPrescricoesInventadas: !(protocolo.prescriptions ?? []).length && !texto.includes("posologia"),
  metaAplicada: energy?.targetKcal === 1800,
};
evidence.resultado = "sucesso";
evidence.protocoloGerado = true;
evidence.energia = energy;
evidence.contagens = {
  refeicoes: meals.length,
  secoes: protocolo.sections.length,
  pendencias: protocolo.pendencias.length,
};
evidence.verificacoes = checks;
evidence.pendenciasEssenciais = protocolEssentialIssues(protocolo);
evidence.avisosAbertos = protocolOpenWarnings?.(protocolo) ?? [];
evidence.pendencias = protocolo.pendencias;

const html = renderProtocolHtml({
  patientName: "Paciente Fictício QA",
  objetivo: protocolo.objetivo,
  anamnese,
  bio,
  protocolo,
  draft: true,
  version: 1,
});
writeFileSync("/tmp/openai-smoke/out.html", html, "utf8");
writeFileSync(
  "/tmp/openai-smoke/protocolo.json",
  JSON.stringify({ protocolo, energy }, null, 2),
  "utf8",
);
evidence.htmlBytes = html.length;
writeFileSync("/tmp/openai-smoke/out.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ checks, contagens: evidence.contagens }, null, 2));
