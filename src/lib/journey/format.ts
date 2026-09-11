/**
 * Formatação clínica: DD/MM/AAAA, vírgula decimal, comparação em pontos percentuais.
 * Sem arredondamento silencioso — os valores fornecidos são preservados tal como estão.
 */

/** Converte um texto numérico ("1.365", "1,64") em número, ou null. */
export function toNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const raw = String(value).trim().replace(/\s/g, "");
  if (!raw) return null;
  const normalized = raw.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Saída sempre com vírgula decimal, mantendo as casas originais. */
export function decimalComma(value: string | null | undefined): string {
  if (value == null) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  return raw.replace(".", ",");
}

/** Formata uma diferença numérica com sinal e vírgula decimal. */
export function signedDelta(delta: number, digits = 1): string {
  const fixed = Math.abs(delta).toFixed(digits).replace(".", ",");
  if (Math.abs(delta) < Number(`0.${"0".repeat(digits - 1)}5`)) return `0,${"0".repeat(digits)}`;
  return `${delta > 0 ? "+" : "−"}${fixed}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** DD/MM/AAAA sem conversão de fuso horário para datas só-data. */
export function toBrDate(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value).trim();
  const br = BR_DATE.exec(raw);
  if (br) return raw;
  const iso = DATE_ONLY.exec(raw);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const isoDateTime = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(raw);
  if (isoDateTime) {
    return `${isoDateTime[3]}/${isoDateTime[2]}/${isoDateTime[1]} ${isoDateTime[4]}:${isoDateTime[5]}`;
  }
  return raw;
}

/** Chave ordenável AAAA-MM-DD a partir de DD/MM/AAAA ou ISO; "" quando ilegível. */
export function dateSortKey(value: string | null | undefined): string {
  if (!value) return "";
  const raw = String(value).trim();
  const br = BR_DATE.exec(raw);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return "";
}

export function todayBr(now: Date = new Date()): string {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${now.getFullYear()}`;
}

/** Normaliza nomes para comparação de identidade (acentos, caixa, espaços). */
export function normalizeName(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identidade compatível = nomes iguais após normalização. Nunca por nome parcial. */
export function sameIdentity(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return true; // sem dado suficiente para bloquear
  return na === nb;
}
