import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type {
  ClassificationResult,
  ProfileTag,
} from "@/lib/body-classifier";
import { PROFILE_LABELS } from "@/lib/body-classifier";
import type { AdjustedDiet } from "@/lib/diet-adjuster";
import { compareExams, formatDelta, type EvolutionRow } from "@/lib/evolution-analyzer";
import {
  TRUSTED_SHOPS,
  buildDefaultPrescription,
  type PrescriptionData,
} from "@/lib/prescription-data";
import type { ReportHistoryEntry } from "@/lib/report-history";
import {
  defaultReportOptions,
  type BodyCompositionData,
  type ClinicalData,
  type ReportOptions,
  type ReportSectionKey,
} from "@/store/report-store";

// ----- Fonts -----
// Using built-in Helvetica to avoid external font fetch failures during pdf().toBlob().

// ----- Palette -----
const COLORS = {
  white: "#FFFFFF",
  black: "#0A0A0A",
  gold: "#C9A24B",
  goldSoft: "#F4ECD7",
  border: "#E8E5DE",
  muted: "#6B6B6B",
  bgSoft: "#FAF8F3",
};

// ----- Styles -----
const styles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: COLORS.black,
    backgroundColor: COLORS.white,
    lineHeight: 1.5,
  },
  // Header
  header: {
    position: "absolute",
    top: 24,
    left: 48,
    right: 48,
    paddingBottom: 8,
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.gold,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: {
    flexDirection: "column",
  },
  brandName: {
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
    fontSize: 13,
    color: COLORS.black,
    letterSpacing: 0.4,
  },
  brandTagline: {
    fontSize: 7.5,
    color: COLORS.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 2,
  },
  headerMeta: {
    fontSize: 7.5,
    color: COLORS.muted,
    textAlign: "right",
    letterSpacing: 0.6,
  },
  // Footer
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    paddingTop: 8,
    borderTopWidth: 0.6,
    borderTopColor: COLORS.gold,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerText: {
    fontSize: 7.5,
    color: COLORS.muted,
    letterSpacing: 0.4,
    fontStyle: "italic",
  },
  footerPage: {
    fontSize: 7.5,
    color: COLORS.muted,
    letterSpacing: 0.6,
  },
  // Page title
  pageEyebrow: {
    fontSize: 8,
    color: COLORS.gold,
    letterSpacing: 2.4,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 6,
  },
  pageTitle: {
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
    fontSize: 22,
    color: COLORS.black,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: 20,
  },
  // Sections
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 8,
    color: COLORS.gold,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 6,
  },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
    fontSize: 13,
    color: COLORS.black,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 10.5,
    color: COLORS.black,
    lineHeight: 1.55,
  },
  paragraphMuted: {
    fontSize: 10,
    color: COLORS.muted,
    lineHeight: 1.5,
  },
  // Data rows
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.border,
  },
  dataKey: {
    fontSize: 10,
    color: COLORS.muted,
  },
  dataValue: {
    fontSize: 10.5,
    color: COLORS.black,
    fontWeight: 500,
  },
  // Badge
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
  },
  badgePrimary: {
    fontSize: 8,
    color: COLORS.gold,
    backgroundColor: COLORS.goldSoft,
    borderWidth: 0.6,
    borderColor: COLORS.gold,
    paddingVertical: 3,
    paddingHorizontal: 8,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: 700,
    marginRight: 6,
    marginBottom: 4,
  },
  badgeSecondary: {
    fontSize: 8,
    color: COLORS.muted,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    paddingVertical: 3,
    paddingHorizontal: 8,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginRight: 6,
    marginBottom: 4,
  },
  // Analysis blocks
  analysisBlock: {
    borderLeftWidth: 1.5,
    borderLeftColor: COLORS.gold,
    paddingLeft: 10,
    marginBottom: 12,
  },
  analysisLabel: {
    fontSize: 8,
    color: COLORS.gold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontWeight: 700,
    marginBottom: 3,
  },
  // Meal
  mealBlock: {
    borderLeftWidth: 1.5,
    borderLeftColor: COLORS.gold,
    paddingLeft: 12,
    marginBottom: 14,
  },
  mealTitle: {
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
    fontSize: 12,
    color: COLORS.black,
    marginBottom: 6,
  },
  mealTime: {
    color: COLORS.gold,
  },
  mealGroupLabel: {
    fontSize: 8,
    color: COLORS.gold,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    fontWeight: 700,
    marginTop: 4,
    marginBottom: 2,
  },
  mealItem: {
    fontSize: 10,
    color: COLORS.black,
    marginBottom: 1.5,
  },
  // List item
  listItem: {
    flexDirection: "row",
    marginBottom: 4,
  },
  bullet: {
    width: 10,
    color: COLORS.gold,
    fontSize: 10,
  },
  listText: {
    flex: 1,
    fontSize: 10,
    color: COLORS.black,
    lineHeight: 1.5,
  },
  // Supplement card
  supplementItem: {
    borderLeftWidth: 1.5,
    borderLeftColor: COLORS.gold,
    paddingLeft: 10,
    marginBottom: 10,
  },
  supplementHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  supplementName: {
    fontSize: 10.5,
    fontWeight: 700,
    color: COLORS.black,
    marginRight: 4,
  },
  supplementDose: {
    fontSize: 10,
    color: COLORS.black,
  },
  supplementBadge: {
    fontSize: 7,
    color: COLORS.gold,
    backgroundColor: COLORS.goldSoft,
    borderWidth: 0.5,
    borderColor: COLORS.gold,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontWeight: 700,
    marginLeft: 6,
  },
  supplementNote: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 2,
    fontStyle: "italic",
  },
  noticeBox: {
    borderWidth: 0.6,
    borderColor: COLORS.gold,
    backgroundColor: COLORS.goldSoft,
    padding: 12,
    marginTop: 6,
    marginBottom: 6,
  },
  noticeTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: COLORS.black,
    marginBottom: 4,
  },
  noticeBody: {
    fontSize: 9.5,
    color: COLORS.black,
    lineHeight: 1.5,
  },
  link: {
    fontSize: 10,
    color: COLORS.black,
    fontWeight: 500,
    textDecoration: "underline",
  },
  guideline: {
    marginBottom: 12,
  },
  guidelineTitle: {
    fontFamily: "Helvetica-Bold",
    fontWeight: 700,
    fontSize: 12,
    color: COLORS.gold,
    marginBottom: 3,
  },
  guidelineText: {
    fontSize: 10.5,
    color: COLORS.black,
    lineHeight: 1.55,
  },
  // Evolution table
  evoRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.border,
  },
  evoCellLabel: { flex: 2.2, fontSize: 9.5, color: COLORS.black },
  evoCellNum: { flex: 1, fontSize: 9.5, color: COLORS.black, textAlign: "right" },
  evoCellDelta: { flex: 1.2, fontSize: 9.5, textAlign: "right", fontWeight: 700 },
  evoHeaderCellLabel: { flex: 2.2, fontSize: 8, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase" },
  evoHeaderCellNum: { flex: 1, fontSize: 8, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase", textAlign: "right" },
  evoHeaderCellDelta: { flex: 1.2, fontSize: 8, color: COLORS.muted, letterSpacing: 1, textTransform: "uppercase", textAlign: "right" },
});

// ----- Helpers -----
// Helvetica (built-in) ships with WinAnsi encoding. Glyphs outside it render
// as empty boxes (or break silently). Normalize all dynamic text through safe().
const GLYPH_MAP: Array<[RegExp, string]> = [
  [/\u00B2/g, "2"],   // ²
  [/\u00B3/g, "3"],   // ³
  [/\u2265/g, ">="],  // ≥
  [/\u2264/g, "<="],  // ≤
  [/\u2260/g, "!="],  // ≠
  [/\u2192/g, "->"],  // →
  [/\u2190/g, "<-"],  // ←
  [/\u2194/g, "<->"], // ↔
  [/\u2013/g, "-"],   // – en-dash
  [/\u2014/g, "-"],   // — em-dash
  [/\u2022/g, "-"],   // • bullet (safe fallback)
  [/[\u201C\u201D]/g, '"'], // " "
  [/[\u2018\u2019]/g, "'"], // ' '
  [/\u2026/g, "..."], // …
];

function safe(s: string | undefined | null): string {
  if (s === undefined || s === null) return "";
  let out = String(s);
  for (const [re, rep] of GLYPH_MAP) out = out.replace(re, rep);
  return out;
}

function fmt(v: string | undefined | null, suffix?: string): string {
  if (!v || !String(v).trim()) return "-";
  return safe(suffix ? `${v} ${suffix}` : String(v));
}


function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const SEX_LABELS: Record<string, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
};

const GOAL_30D: Record<ProfileTag, string> = {
  emagrecimento: "Reduzir 2 a 4 kg de gordura corporal preservando massa muscular; aderência >= 90% ao plano alimentar e >= 3 treinos resistidos/semana.",
  emagrecimento_metabolico_prioritario:
    "Reduzir 3 a 5 kg, com queda mínima de 1 ponto na gordura visceral; caminhada diária >= 8.000 passos + treino resistido 3x/sem.",
  recomposicao:
    "Ganhar 0,3 a 0,5 kg de massa muscular esquelética e reduzir 1 a 2% de gordura corporal; treino resistido 4x/sem com progressão de carga.",
  ganho_massa:
    "Ganhar 0,5 a 1,0 kg de massa muscular esquelética; superávit calórico moderado e treino 4 a 5x/sem com sobrecarga progressiva.",
  baixa_massa_muscular:
    "Aumentar 0,5 kg de massa muscular esquelética; proteína >= 2 g/kg/dia e treino resistido 4x/sem com foco em hipertrofia.",
  gordura_visceral_elevada:
    "Reduzir 1 a 2 pontos na gordura visceral; eliminar ultraprocessados e álcool, adicionar HIIT 2x/sem.",
  metabolismo_reduzido:
    "Estabilizar TMB com treino de força 3 a 4x/sem e manutenção calórica estratégica; reavaliar composição em 30 dias.",
  perfil_atletico:
    "Manter composição corporal e otimizar performance: periodizar treinos e priorizar sono e recuperação.",
  risco_metabolico_aumentado:
    "Reduzir cintura em 2 a 4 cm; controle de carboidratos refinados, treino resistido + cardio leve diário.",
};


// ----- Layout: header + footer chrome -----
function PageChrome({ pageLabel }: { pageLabel: string }) {
  return (
    <>
      <View style={styles.header} fixed>
        <View style={styles.brand}>
          <Text style={styles.brandName}>Dr. João Falcão</Text>
          <Text style={styles.brandTagline}>
            Medicina Estética · Emagrecimento · Alta Performance
          </Text>
        </View>
        <Text style={styles.headerMeta}>
          {`Relatório clínico  ·  ${todayDDMMYYYY()}`}
        </Text>
      </View>
      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>
          Relatório gerado pelo método Dr. João Falcão - acompanhamento
          individualizado.
        </Text>

        <Text style={styles.footerPage}>{pageLabel}</Text>
      </View>
    </>
  );
}

function DataRow({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataKey}>{k}</Text>
      <Text style={styles.dataValue}>{v}</Text>
    </View>
  );
}

// ----- Document -----
export type ReportInput = {
  bodyComposition: BodyCompositionData | null;
  clinicalData: ClinicalData | null;
  analysis: ClassificationResult | null;
  diet: AdjustedDiet;
  includeAdvancedProtocol: boolean;
  previousExam?: ReportHistoryEntry | null;
  prescription?: PrescriptionData | null;
  options?: ReportOptions;
};

export function ReportDocument({
  bodyComposition,
  clinicalData,
  analysis,
  diet,
  includeAdvancedProtocol,
  previousExam,
  prescription,
  options,
}: ReportInput) {
  const rx: PrescriptionData = prescription ?? buildDefaultPrescription();
  const opts: ReportOptions = options ?? defaultReportOptions;

  const bc = bodyComposition;
  const cd = clinicalData;
  const evolutionRows: EvolutionRow[] = previousExam?.bodyComposition
    ? compareExams(bc, previousExam.bodyComposition, cd?.mainGoal ?? "")
    : [];
  const previousLabel = previousExam?.bodyComposition?.examDateTime
    || previousExam?.examDate
    || previousExam?.generatedAt
    || "";
  const patientName =
    bc?.patientName?.trim() || cd?.patientName?.trim() || "Paciente";

  // Dynamic page numbering: only enabled sections count
  const orderedKeys: ReportSectionKey[] = [
    "bioimpedance",
    "analysis",
    "dietPlan",
    "prescription",
    "finalGuidelines",
    "patientNotes",
  ];
  const hasPatientNotesContent =
    opts.sections.patientNotes && opts.patientNotes.trim() !== "";
  const enabled: ReportSectionKey[] = orderedKeys.filter((k) =>
    k === "patientNotes" ? hasPatientNotesContent : opts.sections[k],
  );
  const totalPages = enabled.length;
  const pageNumberOf = (key: ReportSectionKey): number =>
    enabled.indexOf(key) + 1;
  const pageLabel = (key: ReportSectionKey): string =>
    `Página ${pageNumberOf(key)} de ${totalPages}`;

  return (
    <Document
      title={`Relatório clínico — ${patientName}`}
      author="Dr. João Falcão"
      subject="Relatório de composição corporal"
    >
      {/* PAGE 1 — Bioimpedância */}
      {opts.sections.bioimpedance && (
      <Page size="A4" style={styles.page}>
        <PageChrome pageLabel={pageLabel("bioimpedance")} />
        <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("bioimpedance")}`}</Text>
        <Text style={styles.pageTitle}>Dados da Bioimpedância</Text>
        <Text style={styles.pageSubtitle}>
          Composição corporal aferida no exame de bioimpedância.
        </Text>

        <View style={styles.section}>
          <DataRow k="Nome do paciente" v={fmt(bc?.patientName || cd?.patientName)} />
          <DataRow
            k="Sexo"
            v={SEX_LABELS[bc?.sex || cd?.sex || ""] || "-"}
          />

          <DataRow k="Idade" v={fmt(bc?.age || cd?.age, "anos")} />
          <DataRow k="Altura" v={fmt(bc?.height || cd?.height, "cm")} />
          <DataRow k="Peso" v={fmt(bc?.weight || cd?.weight, "kg")} />
          <DataRow k="IMC" v={fmt(bc?.bmi, "kg/m2")} />
          <DataRow
            k="Massa muscular esquelética"
            v={fmt(bc?.skeletalMuscleMass, "kg")}
          />
          <DataRow
            k="Percentual de gordura corporal"
            v={fmt(bc?.bodyFatPercentage, "%")}
          />
          <DataRow k="Gordura visceral" v={fmt(bc?.visceralFat)} />
          <DataRow
            k="Taxa metabólica basal"
            v={fmt(bc?.basalMetabolicRate, "kcal")}
          />
          <DataRow k="Data e hora do exame" v={fmt(bc?.examDateTime)} />
        </View>

        {evolutionRows.length > 0 && (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionLabel}>Evolução desde a última consulta</Text>
            <Text style={[styles.paragraphMuted, { marginBottom: 6 }]}>
              {safe(`Comparativo com o exame anterior (${previousLabel || "data não informada"}).`)}
            </Text>
            <View style={styles.evoRow}>
              <Text style={styles.evoHeaderCellLabel}>Indicador</Text>
              <Text style={styles.evoHeaderCellNum}>Anterior</Text>
              <Text style={styles.evoHeaderCellNum}>Atual</Text>
              <Text style={styles.evoHeaderCellDelta}>Variação</Text>
            </View>
            {evolutionRows.map((row) => {
              const color =
                row.alignment === "positive"
                  ? "#1f7a3a"
                  : row.alignment === "negative"
                    ? "#b45309"
                    : COLORS.muted;
              return (
                <View key={row.key} style={styles.evoRow}>
                  <Text style={styles.evoCellLabel}>{safe(row.label)}</Text>
                  <Text style={styles.evoCellNum}>
                    {safe(
                      row.previous !== null
                        ? `${String(row.previous).replace(".", ",")}${row.unit ? " " + row.unit : ""}`
                        : "-",
                    )}
                  </Text>
                  <Text style={styles.evoCellNum}>
                    {safe(
                      row.current !== null
                        ? `${String(row.current).replace(".", ",")}${row.unit ? " " + row.unit : ""}`
                        : "-",
                    )}
                  </Text>
                  <Text style={[styles.evoCellDelta, { color }]}>
                    {safe(formatDelta(row))}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </Page>
      )}

      {/* PAGE 2 — Análise Corporal */}
      {opts.sections.analysis && (
      <Page size="A4" style={styles.page}>
        <PageChrome pageLabel={pageLabel("analysis")} />
        <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("analysis")}`}</Text>
        <Text style={styles.pageTitle}>Análise Corporal</Text>
        <Text style={styles.pageSubtitle}>
          Diagnóstico clínico e estratégia recomendada.
        </Text>

        {analysis ? (
          <>
            <View style={styles.badgeRow}>
              <Text style={styles.badgePrimary}>
                {safe(PROFILE_LABELS[analysis.primaryProfile])}
              </Text>
              {analysis.secondaryProfiles.map((t) => (
                <Text key={t} style={styles.badgeSecondary}>
                  {safe(PROFILE_LABELS[t])}
                </Text>
              ))}
            </View>

            <View style={styles.analysisBlock}>
              <Text style={styles.analysisLabel}>Diagnóstico corporal</Text>
              <Text style={styles.paragraph}>{safe(analysis.narrative.diagnosis)}</Text>
            </View>
            <View style={styles.analysisBlock}>
              <Text style={styles.analysisLabel}>Pontos positivos</Text>
              <Text style={styles.paragraph}>{safe(analysis.narrative.strength)}</Text>
            </View>
            <View style={styles.analysisBlock}>
              <Text style={styles.analysisLabel}>Pontos de atenção</Text>
              <Text style={styles.paragraph}>{safe(analysis.narrative.attention)}</Text>
            </View>
            <View style={styles.analysisBlock}>
              <Text style={styles.analysisLabel}>Estratégia recomendada</Text>
              <Text style={styles.paragraph}>{safe(analysis.narrative.strategy)}</Text>
            </View>
            <View style={styles.analysisBlock}>
              <Text style={styles.analysisLabel}>Meta dos próximos 30 dias</Text>
              <Text style={styles.paragraph}>
                {safe(GOAL_30D[analysis.primaryProfile])}
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.paragraphMuted}>
            Dados insuficientes para gerar a análise - preencha sexo, idade,
            peso, altura e percentual de gordura.
          </Text>
        )}

      </Page>
      )}

      {/* PAGE 3 — Plano Alimentar */}
      {opts.sections.dietPlan && (
      <Page size="A4" style={styles.page}>
        <PageChrome pageLabel={pageLabel("dietPlan")} />
        <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("dietPlan")}`}</Text>
        <Text style={styles.pageTitle}>Plano Alimentar</Text>
        <Text style={styles.pageSubtitle}>
          {safe(diet.base.name)} - quantidades ajustadas conforme perfil clínico.
        </Text>

        {diet.meals.map((meal) => (
          <View key={meal.id} style={styles.mealBlock} wrap={false}>
            <Text style={styles.mealTitle}>
              {safe(meal.name)} <Text style={styles.mealTime}>- {safe(meal.time)}</Text>
            </Text>
            {meal.blocks.map((block) => (
              <View key={block.id}>
                <Text style={styles.mealGroupLabel}>{safe(block.title)}</Text>
                {block.options.map((opt) => (
                  <Text key={opt.id} style={styles.mealItem}>
                    - {safe(opt.adjustedDisplay)}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ))}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Regras gerais</Text>
          {diet.generalRules.map((rule, i) => (
            <View key={i} style={styles.listItem}>
              <Text style={styles.bullet}>-</Text>
              <Text style={styles.listText}>{safe(rule)}</Text>
            </View>
          ))}
          <View style={styles.listItem}>
            <Text style={styles.bullet}>-</Text>
            <Text style={styles.listText}>
              {`Hidratação alvo: ${diet.targets.waterLitersPerDay
                .toString()
                .replace(".", ",")} L/dia.`}
            </Text>
          </View>
        </View>
      </Page>
      )}


      {/* PAGE 4 — Prescrição e Suplementação */}
      {opts.sections.prescription && (
      <Page size="A4" style={styles.page}>
        <PageChrome pageLabel={pageLabel("prescription")} />
        <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("prescription")}`}</Text>
        <Text style={styles.pageTitle}>Prescrição e Suplementação</Text>
        <Text style={styles.pageSubtitle}>
          Protocolo de suplementação base e orientações de aquisição.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Suplementos - Obrigatórios</Text>
          {rx.mandatory.map((s) => (
            <View key={s.id} style={styles.supplementItem} wrap={false}>
              <View style={styles.supplementHeader}>
                <Text style={styles.supplementName}>{safe(s.name)}</Text>
                <Text style={styles.supplementDose}>- {safe(s.dose)}</Text>
                <Text style={styles.supplementBadge}>Obrigatório</Text>
              </View>
              {s.note && <Text style={styles.supplementNote}>{safe(s.note)}</Text>}
            </View>
          ))}
        </View>

        <View style={styles.noticeBox} wrap={false}>
          <Text style={styles.noticeTitle}>Atenção à aquisição</Text>
          <Text style={styles.noticeBody}>
            Estes suplementos devem ser adquiridos exclusivamente em lojas
            especializadas e confiáveis. Sites recomendados:
          </Text>
          {TRUSTED_SHOPS.map((shop) => (
            <Text key={shop.url} style={[styles.link, { marginTop: 4 }]}>
              {safe(shop.label)}  -  {safe(shop.url)}
            </Text>
          ))}
        </View>

        {includeAdvancedProtocol && rx.advanced.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Protocolo avançado</Text>
            <Text style={[styles.paragraphMuted, { marginBottom: 8 }]}>
              Complementar - personalizar conforme exames laboratoriais e
              acompanhamento clínico.
            </Text>
            {rx.advanced.map((s) => (
              <View key={s.id} style={styles.supplementItem} wrap={false}>
                <View style={styles.supplementHeader}>
                  <Text style={styles.supplementName}>{safe(s.name)}</Text>
                  <Text style={styles.supplementDose}>- {safe(s.dose)}</Text>
                </View>
                {s.note && <Text style={styles.supplementNote}>{safe(s.note)}</Text>}
              </View>
            ))}
          </View>
        )}
      </Page>
      )}


      {/* PAGE 5 — Orientações Finais */}
      {opts.sections.finalGuidelines && (
      <Page size="A4" style={styles.page}>
        <PageChrome pageLabel={pageLabel("finalGuidelines")} />
        <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("finalGuidelines")}`}</Text>
        <Text style={styles.pageTitle}>Orientações Finais</Text>
        <Text style={styles.pageSubtitle}>
          Pilares de adesão para resultados clínicos sustentáveis.
        </Text>

        {rx.guidelines.map((g) => (
          <View key={g.id} style={styles.guideline} wrap={false}>
            <Text style={styles.guidelineTitle}>{safe(g.title)}</Text>
            <Text style={styles.guidelineText}>{safe(g.text)}</Text>
          </View>
        ))}


        <View style={{ marginTop: 24, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: "#C9A84C" }}>
          <Text style={[styles.paragraphMuted, { fontSize: 8, textAlign: "center" }]}>
            Relatório gerado como apoio à conduta clínica. As orientações devem ser revisadas e validadas por profissional habilitado antes da entrega ao paciente.
          </Text>
        </View>
      </Page>
      )}
    </Document>
  );
}
