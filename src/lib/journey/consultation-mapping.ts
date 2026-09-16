import { anamneseSchema, bioSchema, emptyAnamnese, emptyBio, type BioHistoryRow } from "./types";
import { dateSortKey, sameIdentity, toBrDate } from "./format";
import { mapAnamnesis, parseSavedAnswers } from "@/lib/consultations/mapping";
import type { BodyCompositionData, ClinicalData } from "@/store/report-store";

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const join = (...values: unknown[]) => values.map(text).filter(Boolean).join(" · ");
const yesNo = (value: unknown) => (value === "sim" ? "Sim" : value === "nao" ? "Não" : "");

/** Transcrição determinística. Não interpreta diagnósticos, doses ou objetivos. */
export function consultationToJourney(source: {
  patientName: string;
  consultationDate: string;
  clinicalData: ClinicalData | null;
  bodyComposition: BodyCompositionData | null;
  answers: unknown | null;
}) {
  const c = source.clinicalData;
  const b = source.bodyComposition;
  const a = source.answers == null ? {} : parseSavedAnswers(source.answers);
  const anamnese = structuredClone(emptyAnamnese);
  const from = (clinical: keyof ClinicalData, answer: string) =>
    text(c?.[clinical]) || text(a[answer]);
  const reported = (flag: string, detail: string) => join(a[flag], a[detail]);
  anamnese.header = {
    paciente: text(c?.patientName) || text(a.patientName) || source.patientName,
    dataConsulta: toBrDate(source.consultationDate),
    nascimentoOuIdade: from("age", "age"),
    telefone: text(c?.phone),
    email: text(c?.email),
  };
  anamnese.identificacao = {
    estadoCivil: text(a.maritalStatus),
    filhos: join(a.hasChildren, a.childrenCount, a.childrenAges),
    outras: join(
      a.livesWith ? `Vive com: ${a.livesWith}` : "",
      c?.sex ? `Sexo na ficha: ${c.sex}` : "",
      c?.height ? `Altura na ficha: ${c.height} cm` : "",
      c?.weight ? `Peso na ficha: ${c.weight} kg` : "",
    ),
  };
  anamnese.rotinaProfissional.profissao = text(a.profession);
  anamnese.rotinaProfissional.tipoHorario = from("workSchedule", "workSchedule");
  anamnese.sono.acorda = from("wakeTime", "wakeTime");
  anamnese.sono.dorme = from("sleepTime", "sleepTime");
  anamnese.sono.qualidade = text(a.sleepQuality);
  anamnese.historicoClinico.doencas =
    text(c?.previousDiseases) || reported("hasConditions", "conditions");
  anamnese.historicoClinico.outras = [
    ["Diabetes", c?.diabetes],
    ["Hipertensão", c?.hypertension],
    ["Vesícula retirada", c?.gallbladderRemoved],
    ["Constipação", c?.constipation],
    ["Menopausa", c?.menopause],
    ["Fome noturna", c?.nightHunger],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${yesNo(value) || value}`)
    .join("\n");
  // A ficha tem alergias em texto único: preservar sem atribuir a uma categoria errada.
  anamnese.alergias.medicamentos = reported("hasDrugAllergies", "drugAllergies");
  anamnese.alergias.alimentares = reported("hasFoodAllergies", "foodAllergies");
  if (c?.allergiesIntolerances)
    anamnese.observacoesClinicas.pontosAtencao = `Alergias/intolerâncias revisadas: ${c.allergiesIntolerances}`;
  const medications = from("medications", "medications");
  if (medications && medications !== "Não, segundo o paciente.")
    anamnese.medicacoesEmUso = [
      { nome: medications, dose: "", frequencia: "", horario: "", motivo: "" },
    ];
  else if (a.takesMedication === "Não")
    anamnese.historicoClinico.medicacoesAnteriores =
      "Paciente informa não usar medicamentos regularmente.";
  anamnese.cirurgias.cirurgias = from("previousSurgeries", "previousSurgeries");
  anamnese.cirurgias.estetica = text(a.previousProcedures);
  anamnese.emocional.compulsao = yesNo(c?.bingeEating);
  anamnese.habitos = {
    tabaco: join(
      a.smokes,
      a.cigarettesPerDay ? `${a.cigarettesPerDay} cigarros/dia` : "",
      a.smokingNotes,
    ),
    alcool: reported("drinksAlcohol", "alcoholFrequency"),
    treino: yesNo(c?.currentlyTraining) || text(a.trains),
    modalidade:
      c?.trainingType === "outro"
        ? text(c.trainingTypeOther)
        : text(c?.trainingType) || text(a.trainingType),
    frequencia: from("weeklyTrainingFrequency", "trainingFrequency"),
    duracao: "",
    horario: from("trainingTime", "trainingTime"),
  };
  anamnese.alimentacao = {
    refeicoes: text(c?.mealsPerDay),
    padrao: c?.avoidedFoods ? `Alimentos evitados: ${c.avoidedFoods}` : "",
    agua: a.waterLiters ? `${a.waterLiters} L/dia` : "",
    suplementos: reported("takesSupplements", "supplements"),
  };
  const goalLabels: Record<string, string> = {
    jejum_intermitente: "Jejum intermitente",
    alta_performance: "Alta performance",
    recomposicao: "Recomposição corporal",
  };
  anamnese.queixaObjetivos = {
    queixa: text(a.mainComplaint),
    objetivo: join(
      a.treatmentGoal,
      c?.mainGoal ? `Objetivo da ficha: ${goalLabels[c.mainGoal] ?? c.mainGoal}` : "",
    ),
    evolucao: "",
    tratamentos: "",
    expectativas: text(a.expectations),
  };
  // O bloco automático de respostas já foi mapeado acima, não é uma segunda nota.
  const originalNotes =
    source.answers == null ? "" : mapAnamnesis(source.answers, b).additionalNotes;
  anamnese.observacoesClinicas.adicionais = originalNotes
    ? text(c?.additionalNotes).replace(originalNotes, "").trim()
    : text(c?.additionalNotes);

  const bio = structuredClone(emptyBio);
  if (b) {
    bio.paciente = text(b.patientName);
    // O campo da ficha usa centímetros; só converte um número sem unidades ambíguas.
    const cm = text(b.height).replace(",", ".");
    if (/^\d+(\.\d+)?$/.test(cm) && Number(cm) >= 30 && Number(cm) <= 300)
      bio.alturaM = String(Number(cm) / 100).replace(".", ",");
    else if (cm)
      bio.duvidas.push("Confira a altura em centímetros na consulta antes de usá-la na análise.");
    bio.idadeAnos = text(b.age);
    bio.sexo = text(b.sex);
    bio.dataHoraExame = toBrDate(text(b.examDateTime));
    bio.taxaMetabolicaBasalKcal = text(b.basalMetabolicRate);
    bio.massaLivreGorduraKg = text(b.fatFreeMass);
    bio.massaGorduraKg = text(b.bodyFatMass);
    bio.nivelGorduraVisceral = text(b.visceralFat);
    const rows: BioHistoryRow[] = [];
    const add = (
      date: string,
      metric: "peso" | "massaMuscularEsqueletica" | "pgc",
      value: string,
    ) => {
      if (!value.trim()) return;
      const key = dateSortKey(date.match(/^(\d{2}\/\d{2}\/\d{4})(?:[ T].*)?$/)?.[1] ?? date);
      const display = key ? toBrDate(key) : date;
      const same = key ? rows.find((row) => dateSortKey(row.data) === key) : undefined;
      if (same && (!same[metric] || same[metric] === value)) {
        same[metric] = value;
        return;
      }
      // Mantém duplicatas conflitantes para a validação bloquear; nunca escolhe um número.
      rows.push({
        data: display,
        peso: "",
        massaMuscularEsqueletica: "",
        pgc: "",
        [metric]: value,
      });
    };
    for (const [history, metric] of [
      [b.weightHistory, "peso"],
      [b.skeletalMuscleHistory, "massaMuscularEsqueletica"],
      [b.bodyFatHistory, "pgc"],
    ] as const) {
      for (const p of history ?? []) add(text(p.date), metric, text(p.value));
    }
    add(text(b.examDateTime), "peso", text(b.weight));
    add(text(b.examDateTime), "massaMuscularEsqueletica", text(b.skeletalMuscleMass));
    add(text(b.examDateTime), "pgc", text(b.bodyFatPercentage));
    bio.historico = rows;
    bio.identityReview =
      !sameIdentity(source.patientName, bio.paciente) ||
      !sameIdentity(anamnese.header.paciente, bio.paciente) ||
      !!(
        anamnese.header.nascimentoOuIdade &&
        bio.idadeAnos &&
        anamnese.header.nascimentoOuIdade !== bio.idadeAnos
      ) ||
      !!(a.age && bio.idadeAnos && a.age !== bio.idadeAnos);
    if (bio.identityReview)
      bio.duvidas.push(
        "Nome ou idade divergem entre cadastro, anamnese e exame. Confira a identidade e as datas antes de confirmar.",
      );
  }
  bio.fontes = [
    "Dados salvos na Consulta do paciente; respostas originais disponíveis no atendimento.",
  ];
  const parsedAnamnese = anamneseSchema.safeParse(anamnese);
  const parsedBio = bioSchema.safeParse(bio);
  if (!parsedAnamnese.success || !parsedBio.success)
    throw new Error(
      "Os dados excedem os limites da análise. Revise notas com mais de 4.000 caracteres ou históricos com mais de 60 linhas na consulta. Nenhuma informação foi descartada.",
    );
  return {
    patientName: source.patientName,
    anamnese: parsedAnamnese.data,
    bio: parsedBio.data,
    protocolo: null,
  };
}
