const STORAGE_KEY = "jf-bioreport-history";

export type ReportHistoryEntry = {
  id: string;
  patientName: string;
  examDate: string;
  generatedAt: string; // ISO
  mainGoal: string;
  bodyClassification: string;
  pdfFileName: string;
};

function safeRead(): ReportHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ReportHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function safeWrite(entries: ReportHistoryEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota errors
  }
}

export function getReportHistory(): ReportHistoryEntry[] {
  return safeRead().sort((a, b) =>
    b.generatedAt.localeCompare(a.generatedAt),
  );
}

export function addReportToHistory(
  entry: Omit<ReportHistoryEntry, "id">,
): ReportHistoryEntry {
  const full: ReportHistoryEntry = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...entry,
  };
  const list = safeRead();
  list.unshift(full);
  safeWrite(list.slice(0, 200));
  return full;
}

export function clearReportHistory() {
  safeWrite([]);
}
