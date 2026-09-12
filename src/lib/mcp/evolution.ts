export type EvolutionRow = {
  id: string;
  patient_name: string | null;
  exam_date: string | null;
  generated_at: string;
  body_classification: string | null;
  body_composition: Record<string, unknown> | null;
};

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function nameKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt");
}

export function metricNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*(?:kg|%|kcal)?$/i);
  const number = match ? Number(match[1].replace(",", ".")) : NaN;
  return Number.isFinite(number) ? number : null;
}

function examTimestamp(value: string | null): number | null {
  if (!value) return null;
  // Compare legacy timestamps without a timezone consistently as wall-clock UTC.
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/,
  );
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== match[1]) return null;
  if (match[2] && (Number(match[2].slice(0, 2)) > 23 || Number(match[2].slice(3)) > 59))
    return null;
  const timestamp = Date.parse(match[2] ? value + (match[3] ? "" : "Z") : `${value}T00:00:00Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function metricsFor(row: EvolutionRow) {
  const bc = row.body_composition ?? {};
  return {
    weight: metricNumber(bc.weight),
    bodyFatPercentage: metricNumber(bc.bodyFatPercentage),
    skeletalMuscleMass: metricNumber(bc.skeletalMuscleMass),
    visceralFatLevel: metricNumber(bc.visceralFat),
  };
}

export function buildEvolution(rows: EvolutionRow[], patientName: string, limit: number) {
  const identity = nameKey(patientName);
  if (/\.{3}|…/.test(identity))
    throw new Error(
      "O nome está abreviado. Corrija a identificação do paciente antes de comparar exames.",
    );
  if (rows.some((row) => nameKey(row.patient_name ?? "") !== identity)) {
    throw new Error(
      "A pesquisa encontrou nomes diferentes ou incompletos. Use o nome completo e exato de list_reports.",
    );
  }
  let excludedInvalidDates = 0;
  let duplicatesRemoved = 0;
  const exams = new Map<number, { row: EvolutionRow; metrics: ReturnType<typeof metricsFor> }>();
  for (const row of rows) {
    const stamp = examTimestamp(row.exam_date);
    if (stamp === null) {
      excludedInvalidDates++;
      continue;
    }
    const metrics = metricsFor(row);
    const previous = exams.get(stamp);
    if (previous) {
      if (JSON.stringify(previous.metrics) !== JSON.stringify(metrics)) {
        throw new Error(
          "Há relatórios com medições diferentes para a mesma data de exame. Reveja os registos antes de calcular a evolução.",
        );
      }
      duplicatesRemoved++;
      if (
        row.generated_at < previous.row.generated_at ||
        (row.generated_at === previous.row.generated_at && row.id < previous.row.id)
      )
        continue;
    }
    exams.set(stamp, { row, metrics });
  }
  const sorted = [...exams.entries()].sort(([a], [b]) => a - b);
  const points = sorted.slice(-limit).map(([, { row, metrics }]) => ({
    id: row.id,
    patientName: row.patient_name?.trim() ?? "",
    examDate: row.exam_date,
    generatedAt: row.generated_at,
    classification: row.body_classification,
    ...metrics,
  }));
  const first = points[0] ?? null;
  const last = points.at(-1) ?? null;
  const comparable = points.length >= 2;
  const delta = (a: number | null, b: number | null) =>
    a !== null && b !== null ? Number((b - a).toFixed(2)) : null;
  const change =
    comparable && first && last
      ? {
          weight: delta(first.weight, last.weight),
          bodyFatPercentage: delta(first.bodyFatPercentage, last.bodyFatPercentage),
          skeletalMuscleMass: delta(first.skeletalMuscleMass, last.skeletalMuscleMass),
          visceralFatLevel: delta(first.visceralFatLevel, last.visceralFatLevel),
        }
      : null;
  return {
    reports: points.length,
    sourceReports: rows.length,
    uniqueExams: exams.size,
    duplicatesRemoved,
    excludedInvalidDates,
    truncated: exams.size > limit,
    comparable,
    first,
    last,
    change,
    points,
    identityWarning:
      "Identificação por nome completo; homónimos não podem ser distinguidos sem um cadastro único de pacientes.",
    ...(!comparable
      ? {
          notice:
            "São necessários pelo menos dois exames com datas distintas para calcular a evolução.",
        }
      : {}),
  };
}
