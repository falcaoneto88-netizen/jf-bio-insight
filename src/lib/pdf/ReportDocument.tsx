import {
  Document,
  Page,
  StyleSheet,
  Svg,
  Path,
  Line,
  Circle,
  Rect,
  G,
  Text as SvgText,
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
  type MainGoal,
  type ReportOptions,
  type ReportSectionKey,
} from "@/store/report-store";

// ----- Palette -----
const COLORS = {
  white: "#FFFFFF",
  black: "#0A0A0A",
  ink: "#1A1A1A",
  gold: "#C9A24B",
  goldDeep: "#A8862F",
  goldSoft: "#F4ECD7",
  border: "#E8E5DE",
  borderSoft: "#F1EEE7",
  muted: "#6B6B6B",
  mutedSoft: "#9A9A94",
  bgSoft: "#FAF8F3",
  positive: "#1F7A3A",
  negative: "#B45309",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 68,
    paddingBottom: 60,
    paddingHorizontal: 52,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: COLORS.black,
    backgroundColor: COLORS.white,
    lineHeight: 1.55,
  },
  coverPage: {
    padding: 0,
    fontFamily: "Helvetica",
    fontSize: 11,
    color: COLORS.black,
    backgroundColor: COLORS.white,
  },
  // Header
  header: {
    position: "absolute",
    top: 26,
    left: 52,
    right: 52,
    paddingBottom: 8,
    borderBottomWidth: 0.6,
    borderBottomColor: COLORS.gold,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  brand: { flexDirection: "column" },
  brandName: {
    fontFamily: "Times-Bold",
    fontSize: 13,
    color: COLORS.black,
    letterSpacing: 0.4,
  },
  brandTagline: {
    fontSize: 7.5,
    color: COLORS.muted,
    letterSpacing: 1.4,
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
    left: 52,
    right: 52,
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
    fontSize: 7.5,
    color: COLORS.gold,
    letterSpacing: 3,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  pageTitle: {
    fontFamily: "Times-Bold",
    fontSize: 24,
    color: COLORS.black,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  pageSubtitle: {
    fontSize: 10.5,
    color: COLORS.muted,
    marginBottom: 22,
  },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 7.5,
    color: COLORS.gold,
    letterSpacing: 2.2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  sectionTitle: {
    fontFamily: "Times-Bold",
    fontSize: 14,
    color: COLORS.black,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 10.5,
    color: COLORS.black,
    lineHeight: 1.6,
  },
  paragraphMuted: {
    fontSize: 10,
    color: COLORS.muted,
    lineHeight: 1.55,
  },
  // Data rows
  dataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.border,
  },
  dataKey: { fontSize: 10, color: COLORS.muted },
  dataValue: { fontSize: 10.5, color: COLORS.black, fontFamily: "Helvetica-Bold" },
  // Badges
  badgeRow: { flexDirection: "row", flexWrap: "wrap", marginBottom: 14 },
  badgePrimary: {
    fontSize: 8,
    color: COLORS.goldDeep,
    backgroundColor: COLORS.goldSoft,
    borderWidth: 0.6,
    borderColor: COLORS.gold,
    paddingVertical: 3,
    paddingHorizontal: 9,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
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
    paddingLeft: 12,
    marginBottom: 14,
  },
  analysisLabel: {
    fontSize: 7.5,
    color: COLORS.gold,
    letterSpacing: 1.8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  // Meal
  mealBlock: {
    borderLeftWidth: 1.5,
    borderLeftColor: COLORS.gold,
    paddingLeft: 14,
    marginBottom: 16,
  },
  mealHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
    flexWrap: "wrap",
  },
  mealTitle: {
    fontFamily: "Times-Bold",
    fontSize: 13,
    color: COLORS.black,
    marginRight: 8,
  },
  mealTimeChip: {
    fontSize: 8,
    color: COLORS.goldDeep,
    backgroundColor: COLORS.goldSoft,
    paddingVertical: 2,
    paddingHorizontal: 7,
    letterSpacing: 1.2,
    fontFamily: "Helvetica-Bold",
  },
  mealGroupLabel: {
    fontSize: 7.5,
    color: COLORS.gold,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginTop: 6,
    marginBottom: 3,
  },
  mealItem: {
    fontSize: 10,
    color: COLORS.black,
    marginBottom: 2,
    marginLeft: 2,
  },
  // List item
  listItem: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 10, color: COLORS.gold, fontSize: 10, fontFamily: "Helvetica-Bold" },
  listText: { flex: 1, fontSize: 10, color: COLORS.black, lineHeight: 1.55 },
  // Supplement
  supplementItem: {
    borderLeftWidth: 1.5,
    borderLeftColor: COLORS.gold,
    paddingLeft: 12,
    marginBottom: 12,
  },
  supplementHeader: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap" },
  supplementName: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: COLORS.black,
    marginRight: 4,
  },
  supplementDose: { fontSize: 10, color: COLORS.black },
  supplementBadge: {
    fontSize: 7,
    color: COLORS.goldDeep,
    backgroundColor: COLORS.goldSoft,
    borderWidth: 0.5,
    borderColor: COLORS.gold,
    paddingVertical: 1.5,
    paddingHorizontal: 5,
    letterSpacing: 1,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginLeft: 6,
  },
  supplementNote: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 3,
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
    fontFamily: "Helvetica-Bold",
    color: COLORS.black,
    marginBottom: 4,
  },
  noticeBody: { fontSize: 9.5, color: COLORS.black, lineHeight: 1.55 },
  link: { fontSize: 10, color: COLORS.black, fontFamily: "Helvetica-Bold", textDecoration: "underline" },
  guideline: { marginBottom: 14 },
  guidelineTitle: {
    fontFamily: "Times-Bold",
    fontSize: 12,
    color: COLORS.goldDeep,
    marginBottom: 3,
  },
  guidelineText: { fontSize: 10.5, color: COLORS.black, lineHeight: 1.6 },
  // Rules card
  rulesCard: {
    backgroundColor: COLORS.bgSoft,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    padding: 14,
    marginTop: 8,
  },
  // ----- Cover -----
  coverBandTop: {
    height: 4,
    backgroundColor: COLORS.gold,
  },
  coverBandThin: {
    height: 0.6,
    backgroundColor: COLORS.gold,
    marginTop: 3,
    marginBottom: 0,
  },
  coverInner: {
    paddingHorizontal: 60,
    paddingTop: 80,
    paddingBottom: 60,
    flex: 1,
  },
  coverEyebrow: {
    fontSize: 8,
    color: COLORS.gold,
    letterSpacing: 4,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 24,
  },
  coverTitle: {
    fontFamily: "Times-Bold",
    fontSize: 46,
    lineHeight: 1.05,
    color: COLORS.black,
    letterSpacing: -1,
    marginBottom: 4,
  },
  coverTitleAccent: {
    fontFamily: "Times-Italic",
    fontSize: 32,
    color: COLORS.goldDeep,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  coverPatientBlock: {
    marginTop: 56,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    paddingLeft: 18,
  },
  coverPatientLabel: {
    fontSize: 8,
    color: COLORS.gold,
    letterSpacing: 3,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  coverPatientName: {
    fontFamily: "Times-Bold",
    fontSize: 22,
    color: COLORS.black,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  coverPatientMeta: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 0.4,
  },
  coverBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 20,
  },
  coverSignature: {
    position: "absolute",
    bottom: 60,
    left: 60,
    right: 60,
    paddingTop: 14,
    borderTopWidth: 0.6,
    borderTopColor: COLORS.gold,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  coverSigName: {
    fontFamily: "Times-Bold",
    fontSize: 12,
    color: COLORS.black,
    letterSpacing: 0.4,
  },
  coverSigTag: {
    fontSize: 7.5,
    color: COLORS.muted,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    marginTop: 3,
  },
  coverDate: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    textAlign: "right",
  },
  // ----- KPI cards -----
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -6,
    marginBottom: 18,
  },
  kpiCard: {
    width: "50%",
    paddingHorizontal: 6,
    paddingBottom: 12,
  },
  kpiInner: {
    borderWidth: 0.6,
    borderColor: COLORS.border,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    padding: 12,
    backgroundColor: COLORS.white,
  },
  kpiLabel: {
    fontSize: 7.5,
    color: COLORS.gold,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 6,
  },
  kpiValueRow: { flexDirection: "row", alignItems: "baseline" },
  kpiValue: {
    fontFamily: "Times-Bold",
    fontSize: 22,
    color: COLORS.black,
    letterSpacing: -0.4,
  },
  kpiUnit: {
    fontSize: 10,
    color: COLORS.muted,
    marginLeft: 4,
  },
  kpiDelta: {
    fontSize: 8.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  // Highlight card (diagnóstico)
  highlightCard: {
    backgroundColor: COLORS.goldSoft,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.gold,
    padding: 14,
    marginTop: 8,
    marginBottom: 14,
  },
  highlightLabel: {
    fontSize: 7.5,
    color: COLORS.goldDeep,
    letterSpacing: 2,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
    marginBottom: 5,
  },
  highlightText: {
    fontFamily: "Times-Roman",
    fontSize: 12.5,
    color: COLORS.black,
    lineHeight: 1.5,
  },
  // Composition bars
  compBarRow: { marginBottom: 14 },
  compBarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  compBarLabel: {
    fontSize: 10,
    color: COLORS.black,
    fontFamily: "Helvetica-Bold",
  },
  compBarValue: {
    fontSize: 10,
    color: COLORS.black,
    fontFamily: "Helvetica-Bold",
  },
  compBarLegend: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 3,
  },
  // Evo
  evoRow: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.border,
  },
  evoCellLabel: { flex: 2.2, fontSize: 9.5, color: COLORS.black },
  evoCellNum: { flex: 1, fontSize: 9.5, color: COLORS.black, textAlign: "right" },
  evoCellDelta: { flex: 1.2, fontSize: 9.5, textAlign: "right", fontFamily: "Helvetica-Bold" },
  evoHeaderCellLabel: { flex: 2.2, fontSize: 7.5, color: COLORS.muted, letterSpacing: 1.2, textTransform: "uppercase" },
  evoHeaderCellNum: { flex: 1, fontSize: 7.5, color: COLORS.muted, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "right" },
  evoHeaderCellDelta: { flex: 1.2, fontSize: 7.5, color: COLORS.muted, letterSpacing: 1.2, textTransform: "uppercase", textAlign: "right" },
});

// ----- Helpers -----
const GLYPH_MAP: Array<[RegExp, string]> = [
  [/\u00B2/g, "2"],
  [/\u00B3/g, "3"],
  [/\u2265/g, ">="],
  [/\u2264/g, "<="],
  [/\u2260/g, "!="],
  [/\u2192/g, "->"],
  [/\u2190/g, "<-"],
  [/\u2194/g, "<->"],
  [/\u2013/g, "-"],
  [/\u2014/g, "-"],
  [/\u2022/g, "-"],
  [/[\u201C\u201D]/g, '"'],
  [/[\u2018\u2019]/g, "'"],
  [/\u2026/g, "..."],
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

function parseNum(v: string | undefined | null): number | null {
  if (!v) return null;
  const s = String(v).trim().replace(",", ".").replace(/[^\d.\-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function todayDDMMYYYY(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function formatDDMMYYYY(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const SEX_LABELS: Record<string, string> = {
  feminino: "Feminino",
  masculino: "Masculino",
};

const GOAL_LABELS: Record<MainGoal, string> = {
  jejum_intermitente: "Jejum intermitente",
  alta_performance: "Alta performance",
  recomposicao: "Recomposição corporal",
  "": "",
};

const GOAL_30D: Record<ProfileTag, string> = {
  emagrecimento:
    "Reduzir 2 a 4 kg de gordura corporal preservando massa muscular; aderência >= 90% ao plano alimentar e >= 3 treinos resistidos/semana.",
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

// ---------- Chrome ----------
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
          Relatório gerado pelo método Dr. João Falcão - acompanhamento individualizado.
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

// ---------- KPI card ----------
function KPI({
  label,
  value,
  unit,
  delta,
  deltaColor,
}: {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  deltaColor?: string;
}) {
  return (
    <View style={styles.kpiCard}>
      <View style={styles.kpiInner}>
        <Text style={styles.kpiLabel}>{safe(label)}</Text>
        <View style={styles.kpiValueRow}>
          <Text style={styles.kpiValue}>{safe(value)}</Text>
          {unit && <Text style={styles.kpiUnit}>{safe(unit)}</Text>}
        </View>
        {delta && (
          <Text style={[styles.kpiDelta, { color: deltaColor ?? COLORS.muted }]}>
            {safe(delta)}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------- Composition bar ----------
function CompBar({
  label,
  value,
  unit,
  min,
  max,
  healthyMin,
  healthyMax,
  legend,
}: {
  label: string;
  value: number | null;
  unit: string;
  min: number;
  max: number;
  healthyMin?: number;
  healthyMax?: number;
  legend?: string;
}) {
  const width = 480;
  const height = 14;
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const scale = (n: number) => ((clamp(n) - min) / (max - min)) * width;
  const hasHealthy = healthyMin !== undefined && healthyMax !== undefined;
  const hx1 = hasHealthy ? scale(healthyMin) : 0;
  const hx2 = hasHealthy ? scale(healthyMax) : 0;
  const markerX = value !== null ? scale(value) : null;

  return (
    <View style={styles.compBarRow} wrap={false}>
      <View style={styles.compBarHeader}>
        <Text style={styles.compBarLabel}>{safe(label)}</Text>
        <Text style={styles.compBarValue}>
          {value !== null ? `${String(value).replace(".", ",")} ${unit}` : "—"}
        </Text>
      </View>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Track */}
        <Rect x={0} y={height / 2 - 2} width={width} height={4} fill={COLORS.borderSoft} rx={2} />
        {/* Healthy zone */}
        {hasHealthy && (
          <Rect
            x={hx1}
            y={height / 2 - 2}
            width={Math.max(0, hx2 - hx1)}
            height={4}
            fill={COLORS.goldSoft}
            rx={2}
          />
        )}
        {/* Zone edges */}
        {hasHealthy && (
          <>
            <Line x1={hx1} y1={2} x2={hx1} y2={height - 2} stroke={COLORS.gold} strokeWidth={0.6} strokeDasharray="1,1.5" />
            <Line x1={hx2} y1={2} x2={hx2} y2={height - 2} stroke={COLORS.gold} strokeWidth={0.6} strokeDasharray="1,1.5" />
          </>
        )}
        {/* Marker */}
        {markerX !== null && (
          <>
            <Line x1={markerX} y1={0} x2={markerX} y2={height} stroke={COLORS.black} strokeWidth={1.2} />
            <Circle cx={markerX} cy={height / 2} r={3.5} fill={COLORS.black} />
          </>
        )}
      </Svg>
      {legend && <Text style={styles.compBarLegend}>{safe(legend)}</Text>}
    </View>
  );
}

// ---------- Evolution line chart ----------
type ChartPoint = { date: string; value: number };

function LineChart({
  title,
  unit,
  points,
  color,
}: {
  title: string;
  unit: string;
  points: ChartPoint[];
  color: string;
}) {
  if (points.length < 2) return null;
  const width = 480;
  const height = 90;
  const padL = 36;
  const padR = 10;
  const padT = 10;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const yPad = range * 0.15;
  const yMin = min - yPad;
  const yMax = max + yPad;
  const yRange = yMax - yMin || 1;

  const x = (i: number) =>
    padL + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - yMin) / yRange) * plotH;

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  // Area fill under the line
  const areaD =
    pathD +
    ` L ${x(points.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)}` +
    ` L ${x(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;

  const firstV = points[0].value;
  const lastV = points[points.length - 1].value;
  const delta = lastV - firstV;
  const deltaText = `${delta > 0 ? "+" : ""}${delta.toFixed(1).replace(".", ",")} ${unit}`;
  const deltaColor = delta === 0 ? COLORS.muted : delta > 0 ? COLORS.positive : COLORS.negative;

  return (
    <View style={{ marginBottom: 16 }} wrap={false}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
        <Text style={styles.compBarLabel}>{safe(title)}</Text>
        <Text style={[styles.compBarLabel, { color: deltaColor }]}>{safe(deltaText)}</Text>
      </View>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Grid lines */}
        <Line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke={COLORS.borderSoft} strokeWidth={0.5} />
        <Line
          x1={padL}
          y1={padT + plotH}
          x2={width - padR}
          y2={padT + plotH}
          stroke={COLORS.borderSoft}
          strokeWidth={0.5}
        />
        {/* Y axis labels */}
        <SvgText x={padL - 4} y={padT + 3} textAnchor="end" fill={COLORS.mutedSoft} style={{ fontSize: 7 }}>
          {yMax.toFixed(1).replace(".", ",")}
        </SvgText>
        <SvgText x={padL - 4} y={padT + plotH} textAnchor="end" fill={COLORS.mutedSoft} style={{ fontSize: 7 }}>
          {yMin.toFixed(1).replace(".", ",")}
        </SvgText>
        {/* Area */}
        <Path d={areaD} fill={color} fillOpacity={0.12} />
        {/* Line */}
        <Path d={pathD} stroke={color} strokeWidth={1.4} fill="none" />
        {/* Points */}
        <G>
          {points.map((p, i) => (
            <Circle key={i} cx={x(i)} cy={y(p.value)} r={2.2} fill={color} />
          ))}
        </G>
        {/* X axis labels: first + last */}
        <SvgText x={x(0)} y={height - 6} textAnchor="start" fill={COLORS.mutedSoft} style={{ fontSize: 7 }}>
          {safe(points[0].date || "início")}
        </SvgText>
        <SvgText
          x={x(points.length - 1)}
          y={height - 6}
          textAnchor="end"
          fill={COLORS.mutedSoft}
          style={{ fontSize: 7 }}
        >
          {safe(points[points.length - 1].date || "atual")}
        </SvgText>
      </Svg>
    </View>
  );
}

function buildHistoryPoints(
  history: { date: string; value: string }[] | undefined,
  currentValue: string | undefined,
  currentDate: string | undefined,
): ChartPoint[] {
  const points: ChartPoint[] = [];
  for (const h of history ?? []) {
    const v = parseNum(h.value);
    if (v !== null) points.push({ date: h.date || "", value: v });
  }
  const curV = parseNum(currentValue);
  if (curV !== null) {
    const label = currentDate ? formatDDMMYYYY(currentDate) : "atual";
    points.push({ date: label, value: curV });
  }
  return points;
}

// ---------- Fat range helper (subset from body-classifier for legend) ----------
function fatHealthyRange(
  sex: string,
  age: number | null,
): { min: number; max: number } | null {
  const a = age ?? 30;
  if (sex === "feminino") {
    if (a < 40) return { min: 21, max: 32 };
    if (a < 60) return { min: 23, max: 33 };
    return { min: 24, max: 35 };
  }
  if (sex === "masculino") {
    if (a < 40) return { min: 8, max: 19 };
    if (a < 60) return { min: 11, max: 21 };
    return { min: 13, max: 24 };
  }
  return null;
}

// ---------- Document ----------
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
  const previousLabel =
    previousExam?.bodyComposition?.examDateTime ||
    previousExam?.examDate ||
    previousExam?.generatedAt ||
    "";
  const patientName = bc?.patientName?.trim() || cd?.patientName?.trim() || "Paciente";
  const sex = bc?.sex || cd?.sex || "";
  const age = parseNum(bc?.age) ?? parseNum(cd?.age);
  const goalLabel = cd?.mainGoal ? GOAL_LABELS[cd.mainGoal] : "";

  // Cover always renders. Then the enabled sections. Page numbering starts at Cover=1.
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
  // Cover + Executive summary always precede the sections.
  const totalPages = 2 + enabled.length;
  const pageNumberOf = (key: ReportSectionKey): number => enabled.indexOf(key) + 3;
  const pageLabel = (key: ReportSectionKey): string =>
    `Página ${pageNumberOf(key)} de ${totalPages}`;

  // KPIs from body composition
  const weight = parseNum(bc?.weight);
  const bodyFatPct = parseNum(bc?.bodyFatPercentage);
  const smm = parseNum(bc?.skeletalMuscleMass);
  const bmr = parseNum(bc?.basalMetabolicRate);
  const visceral = parseNum(bc?.visceralFat);

  // Previous for delta
  const prevBc = previousExam?.bodyComposition;
  const prevWeight = parseNum(prevBc?.weight);
  const prevFat = parseNum(prevBc?.bodyFatPercentage);
  const prevSmm = parseNum(prevBc?.skeletalMuscleMass);

  const deltaLine = (
    cur: number | null,
    prev: number | null,
    unit: string,
    desired: "up" | "down",
  ): { text: string; color: string } | undefined => {
    if (cur === null || prev === null) return undefined;
    const d = +(cur - prev).toFixed(1);
    if (d === 0) return { text: `sem variação ${unit}`, color: COLORS.muted };
    const sign = d > 0 ? "+" : "";
    const goodDir = desired === "down" ? d < 0 : d > 0;
    const arrow = d > 0 ? "^" : "v";
    return {
      text: `${arrow} ${sign}${d.toString().replace(".", ",")} ${unit} vs. anterior`,
      color: goodDir ? COLORS.positive : COLORS.negative,
    };
  };

  const wDelta = deltaLine(weight, prevWeight, "kg", cd?.mainGoal === "alta_performance" ? "up" : "down");
  const fatDelta = deltaLine(bodyFatPct, prevFat, "%", "down");
  const smmDelta = deltaLine(smm, prevSmm, "kg", "up");

  // Charts
  const weightPoints = buildHistoryPoints(bc?.weightHistory, bc?.weight, bc?.examDateTime);
  const smmPoints = buildHistoryPoints(bc?.skeletalMuscleHistory, bc?.skeletalMuscleMass, bc?.examDateTime);
  const fatPoints = buildHistoryPoints(bc?.bodyFatHistory, bc?.bodyFatPercentage, bc?.examDateTime);
  const hasAnyChart = weightPoints.length >= 2 || smmPoints.length >= 2 || fatPoints.length >= 2;

  const fatRange = fatHealthyRange(sex, age);

  return (
    <Document
      title={`Relatório clínico — ${patientName}`}
      author="Dr. João Falcão"
      subject="Relatório de composição corporal"
    >
      {/* ============ COVER ============ */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverBandTop} />
        <View style={styles.coverBandThin} />
        <View style={styles.coverInner}>
          <Text style={styles.coverEyebrow}>Relatório Corporal · Confidencial</Text>
          <Text style={styles.coverTitle}>Bioimpedância</Text>
          <Text style={styles.coverTitleAccent}>& Estratégia Clínica</Text>

          <View style={styles.coverPatientBlock}>
            <Text style={styles.coverPatientLabel}>Paciente</Text>
            <Text style={styles.coverPatientName}>{safe(patientName)}</Text>
            <Text style={styles.coverPatientMeta}>
              {safe(
                [
                  sex ? SEX_LABELS[sex] : null,
                  age !== null ? `${age} anos` : null,
                  bc?.height ? `${bc.height} cm` : null,
                  bc?.weight ? `${bc.weight} kg` : null,
                ]
                  .filter(Boolean)
                  .join("  ·  "),
              )}
            </Text>

            <View style={styles.coverBadges}>
              {goalLabel && <Text style={styles.badgePrimary}>{safe(goalLabel)}</Text>}
              {analysis && (
                <Text style={styles.badgePrimary}>
                  {safe(PROFILE_LABELS[analysis.primaryProfile])}
                </Text>
              )}
              {analysis?.secondaryProfiles.map((t) => (
                <Text key={t} style={styles.badgeSecondary}>
                  {safe(PROFILE_LABELS[t])}
                </Text>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.coverSignature} fixed={false}>
          <View>
            <Text style={styles.coverSigName}>Dr. João Falcão</Text>
            <Text style={styles.coverSigTag}>
              Medicina Estética · Emagrecimento · Alta Performance
            </Text>
          </View>
          <Text style={styles.coverDate}>
            {`Emitido em ${todayDDMMYYYY()}\nPágina 1 de ${totalPages}`}
          </Text>
        </View>
      </Page>

      {/* ============ EXECUTIVE SUMMARY ============ */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header} fixed>
          <View style={styles.brand}>
            <Text style={styles.brandName}>Dr. João Falcão</Text>
            <Text style={styles.brandTagline}>
              Medicina Estética · Emagrecimento · Alta Performance
            </Text>
          </View>
          <Text style={styles.headerMeta}>{`Relatório clínico  ·  ${todayDDMMYYYY()}`}</Text>
        </View>
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Relatório gerado pelo método Dr. João Falcão - acompanhamento individualizado.
          </Text>
          <Text style={styles.footerPage}>{`Página 2 de ${totalPages}`}</Text>
        </View>

        <Text style={styles.pageEyebrow}>Sumário</Text>
        <Text style={styles.pageTitle}>Visão Geral</Text>
        <Text style={styles.pageSubtitle}>
          {previousExam
            ? `Métricas atuais e comparativo com o exame de ${formatDDMMYYYY(previousLabel) || "referência"}.`
            : "Métricas principais deste exame de bioimpedância."}
        </Text>

        <View style={styles.kpiGrid}>
          <KPI
            label="Peso"
            value={weight !== null ? String(weight).replace(".", ",") : "—"}
            unit="kg"
            delta={wDelta?.text}
            deltaColor={wDelta?.color}
          />
          <KPI
            label="% Gordura corporal"
            value={bodyFatPct !== null ? String(bodyFatPct).replace(".", ",") : "—"}
            unit="%"
            delta={fatDelta?.text}
            deltaColor={fatDelta?.color}
          />
          <KPI
            label="Massa muscular"
            value={smm !== null ? String(smm).replace(".", ",") : "—"}
            unit="kg"
            delta={smmDelta?.text}
            deltaColor={smmDelta?.color}
          />
          <KPI
            label="Taxa metabólica basal"
            value={bmr !== null ? String(Math.round(bmr)) : "—"}
            unit="kcal"
          />
        </View>

        {analysis && (
          <View style={styles.highlightCard} wrap={false}>
            <Text style={styles.highlightLabel}>Diagnóstico corporal</Text>
            <Text style={styles.highlightText}>{safe(analysis.narrative.diagnosis)}</Text>
          </View>
        )}

        {analysis && (
          <View style={styles.analysisBlock} wrap={false}>
            <Text style={styles.analysisLabel}>Meta dos próximos 30 dias</Text>
            <Text style={styles.paragraph}>{safe(GOAL_30D[analysis.primaryProfile])}</Text>
          </View>
        )}

        {hasAnyChart && (
          <View style={{ marginTop: 4 }}>
            <Text style={styles.sectionLabel}>Evolução</Text>
            <LineChart title="Peso" unit="kg" points={weightPoints} color={COLORS.goldDeep} />
            <LineChart
              title="Massa muscular esquelética"
              unit="kg"
              points={smmPoints}
              color={COLORS.positive}
            />
            <LineChart title="% Gordura corporal" unit="%" points={fatPoints} color={COLORS.negative} />
          </View>
        )}
      </Page>

      {/* ============ PAGE — Bioimpedância ============ */}
      {opts.sections.bioimpedance && (
        <Page size="A4" style={styles.page}>
          <PageChrome pageLabel={pageLabel("bioimpedance")} />
          <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("bioimpedance")}`}</Text>
          <Text style={styles.pageTitle}>Composição Corporal</Text>
          <Text style={styles.pageSubtitle}>
            Dados aferidos pelo exame de bioimpedância e leitura visual dos indicadores-chave.
          </Text>

          {/* Visual bars */}
          {(bodyFatPct !== null || smm !== null || visceral !== null) && (
            <View style={{ marginBottom: 18 }}>
              {bodyFatPct !== null && (
                <CompBar
                  label="% Gordura corporal"
                  value={bodyFatPct}
                  unit="%"
                  min={5}
                  max={45}
                  healthyMin={fatRange?.min}
                  healthyMax={fatRange?.max}
                  legend={
                    fatRange
                      ? `Faixa saudável de referência (${sex === "feminino" ? "mulher" : "homem"}, ${age ?? "?"} anos): ${fatRange.min}% – ${fatRange.max}%.`
                      : undefined
                  }
                />
              )}
              {smm !== null && weight !== null && weight > 0 && (
                <CompBar
                  label="Massa muscular esquelética (relativa)"
                  value={+((smm / weight) * 100).toFixed(1)}
                  unit="%"
                  min={20}
                  max={55}
                  healthyMin={sex === "feminino" ? 33 : 37}
                  healthyMax={sex === "feminino" ? 42 : 48}
                  legend={`Massa muscular absoluta: ${String(smm).replace(".", ",")} kg. Referência mínima: ${sex === "feminino" ? "33%" : "37%"} do peso corporal.`}
                />
              )}
              {visceral !== null && (
                <CompBar
                  label="Gordura visceral"
                  value={visceral}
                  unit="nível"
                  min={1}
                  max={20}
                  healthyMin={1}
                  healthyMax={9}
                  legend="Faixa desejável: 1 a 9. Acima de 10 indica risco cardiometabólico aumentado."
                />
              )}
            </View>
          )}

          {/* Detalhamento numérico */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Detalhamento</Text>
            <DataRow k="Nome do paciente" v={fmt(bc?.patientName || cd?.patientName)} />
            <DataRow k="Sexo" v={SEX_LABELS[sex] || "-"} />
            <DataRow k="Idade" v={fmt(bc?.age || cd?.age, "anos")} />
            <DataRow k="Altura" v={fmt(bc?.height || cd?.height, "cm")} />
            <DataRow k="Peso" v={fmt(bc?.weight || cd?.weight, "kg")} />
            <DataRow k="IMC" v={fmt(bc?.bmi, "kg/m2")} />
            <DataRow k="Massa muscular esquelética" v={fmt(bc?.skeletalMuscleMass, "kg")} />
            <DataRow k="Percentual de gordura corporal" v={fmt(bc?.bodyFatPercentage, "%")} />
            <DataRow k="Massa de gordura corporal" v={fmt(bc?.bodyFatMass, "kg")} />
            <DataRow k="Gordura visceral" v={fmt(bc?.visceralFat)} />
            <DataRow k="Taxa metabólica basal" v={fmt(bc?.basalMetabolicRate, "kcal")} />
            <DataRow k="Relação cintura-quadril" v={fmt(bc?.waistHipRatio)} />
            <DataRow k="Água corporal total" v={fmt(bc?.totalBodyWater, "L")} />
            <DataRow k="Massa livre de gordura" v={fmt(bc?.fatFreeMass, "kg")} />
            <DataRow k="Data e hora do exame" v={fmt(bc?.examDateTime)} />
          </View>

          {evolutionRows.length > 0 && (
            <View style={styles.section} wrap={false}>
              <Text style={styles.sectionLabel}>Evolução desde a última consulta</Text>
              <Text style={[styles.paragraphMuted, { marginBottom: 6 }]}>
                {safe(`Comparativo com o exame anterior (${formatDDMMYYYY(previousLabel) || "data não informada"}).`)}
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
                    ? COLORS.positive
                    : row.alignment === "negative"
                      ? COLORS.negative
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
                    <Text style={[styles.evoCellDelta, { color }]}>{safe(formatDelta(row))}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </Page>
      )}

      {/* ============ PAGE — Análise ============ */}
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
                <Text style={styles.paragraph}>{safe(GOAL_30D[analysis.primaryProfile])}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.paragraphMuted}>
              Dados insuficientes para gerar a análise - preencha sexo, idade, peso, altura e percentual de gordura.
            </Text>
          )}
        </Page>
      )}

      {/* ============ PAGE — Plano Alimentar ============ */}
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
              <View style={styles.mealHeader}>
                <Text style={styles.mealTitle}>{safe(meal.name)}</Text>
                <Text style={styles.mealTimeChip}>{safe(meal.time)}</Text>
              </View>
              {meal.blocks.map((block) => (
                <View key={block.id}>
                  <Text style={styles.mealGroupLabel}>{safe(block.title)}</Text>
                  {block.options.map((opt) => (
                    <Text key={opt.id} style={styles.mealItem}>
                      · {safe(opt.adjustedDisplay)}
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}

          <View style={styles.rulesCard}>
            <Text style={styles.sectionLabel}>Regras gerais</Text>
            {diet.generalRules.map((rule, i) => (
              <View key={i} style={styles.listItem}>
                <Text style={styles.bullet}>·</Text>
                <Text style={styles.listText}>{safe(rule)}</Text>
              </View>
            ))}
            <View style={styles.listItem}>
              <Text style={styles.bullet}>·</Text>
              <Text style={styles.listText}>
                {`Hidratação alvo: ${diet.targets.waterLitersPerDay.toString().replace(".", ",")} L/dia.`}
              </Text>
            </View>
          </View>
        </Page>
      )}

      {/* ============ PAGE — Prescrição ============ */}
      {opts.sections.prescription && (
        <Page size="A4" style={styles.page}>
          <PageChrome pageLabel={pageLabel("prescription")} />
          <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("prescription")}`}</Text>
          <Text style={styles.pageTitle}>Prescrição e Suplementação</Text>
          <Text style={styles.pageSubtitle}>
            Protocolo de suplementação base e orientações de aquisição.
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Suplementos — Obrigatórios</Text>
            {rx.mandatory.map((s) => (
              <View key={s.id} style={styles.supplementItem} wrap={false}>
                <View style={styles.supplementHeader}>
                  <Text style={styles.supplementName}>{safe(s.name)}</Text>
                  <Text style={styles.supplementDose}>— {safe(s.dose)}</Text>
                  <Text style={styles.supplementBadge}>Obrigatório</Text>
                </View>
                {s.note && <Text style={styles.supplementNote}>{safe(s.note)}</Text>}
              </View>
            ))}
          </View>

          <View style={styles.noticeBox} wrap={false}>
            <Text style={styles.noticeTitle}>Atenção à aquisição</Text>
            <Text style={styles.noticeBody}>
              Estes suplementos devem ser adquiridos exclusivamente em lojas especializadas e confiáveis. Sites recomendados:
            </Text>
            {TRUSTED_SHOPS.map((shop) => (
              <Text key={shop.url} style={[styles.link, { marginTop: 4 }]}>
                {safe(shop.label)}  —  {safe(shop.url)}
              </Text>
            ))}
          </View>

          {includeAdvancedProtocol && rx.advanced.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Protocolo avançado</Text>
              <Text style={[styles.paragraphMuted, { marginBottom: 8 }]}>
                Complementar — personalizar conforme exames laboratoriais e acompanhamento clínico.
              </Text>
              {rx.advanced.map((s) => (
                <View key={s.id} style={styles.supplementItem} wrap={false}>
                  <View style={styles.supplementHeader}>
                    <Text style={styles.supplementName}>{safe(s.name)}</Text>
                    <Text style={styles.supplementDose}>— {safe(s.dose)}</Text>
                  </View>
                  {s.note && <Text style={styles.supplementNote}>{safe(s.note)}</Text>}
                </View>
              ))}
            </View>
          )}
        </Page>
      )}

      {/* ============ PAGE — Orientações Finais ============ */}
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

          <View
            style={{
              marginTop: 24,
              paddingTop: 12,
              borderTopWidth: 0.5,
              borderTopColor: COLORS.gold,
            }}
          >
            <Text style={[styles.paragraphMuted, { fontSize: 8, textAlign: "center" }]}>
              Relatório gerado como apoio à conduta clínica. As orientações devem ser revisadas e validadas por profissional habilitado antes da entrega ao paciente.
            </Text>
          </View>
        </Page>
      )}

      {/* ============ PAGE — Notas ao paciente ============ */}
      {hasPatientNotesContent && (
        <Page size="A4" style={styles.page}>
          <PageChrome pageLabel={pageLabel("patientNotes")} />
          <Text style={styles.pageEyebrow}>{`Página ${pageNumberOf("patientNotes")}`}</Text>
          <Text style={styles.pageTitle}>Mensagem ao paciente</Text>
          <Text style={styles.pageSubtitle}>
            Orientações finais e palavras de acompanhamento.
          </Text>

          <View style={styles.analysisBlock}>
            {opts.patientNotes
              .trim()
              .split(/\n+/)
              .map((para, i) => (
                <Text
                  key={i}
                  style={i > 0 ? [styles.paragraph, { marginTop: 8 }] : styles.paragraph}
                >
                  {safe(para)}
                </Text>
              ))}
          </View>
        </Page>
      )}
    </Document>
  );
}
