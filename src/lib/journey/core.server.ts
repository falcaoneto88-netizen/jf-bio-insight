/**
 * Núcleo partilhado da jornada clínica (UI + MCP).
 * Todas as escritas passam por aqui, com expectedVersion e hash de conteúdo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { computeEvolution } from "./evolution";
import { renderProtocolHtml } from "./html";
import { sameIdentity, todayBr } from "./format";
import {
  anamneseSchema,
  bioSchema,
  confirmationsSchema,
  emptyAnamnese,
  emptyBio,
  emptyProtocolo,
  protocolSchema,
  OBJETIVOS,
  type Anamnese,
  type Bio,
  type Confirmations,
  type Journey,
  type JourneySummary,
  type Protocolo,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sb = SupabaseClient<any, any, any>;

const TABLE = "jornadas_clinicas";

export class JourneyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/* ------------------------------ helpers ------------------------------ */

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  }
  return value;
}

export async function contentHash(parts: {
  patientName: string;
  anamnese: Anamnese;
  bio: Bio;
  protocolo: Protocolo | null;
}): Promise<string> {
  const json = JSON.stringify(canonical(parts));
  const bytes = new TextEncoder().encode(json);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function rowToJourney(row: Record<string, unknown>): Journey {
  const anamnese = anamneseSchema.safeParse(row["anamnese"] ?? {});
  const bio = bioSchema.safeParse(row["bio"] ?? {});
  const protocolo = row["protocolo"] ? protocolSchema.safeParse(row["protocolo"]) : null;
  const confirmations = confirmationsSchema.safeParse(row["confirmations"] ?? {});
  return {
    id: String(row["id"]),
    patientName: String(row["patient_name"] ?? ""),
    status: String(row["status"] ?? "anamnese"),
    version: Number(row["version"] ?? 1),
    anamnese: anamnese.success ? anamnese.data : emptyAnamnese,
    bio: bio.success ? bio.data : emptyBio,
    protocolo: protocolo?.success ? protocolo.data : null,
    internalNotes: Array.isArray(row["internal_notes"])
      ? (row["internal_notes"] as unknown[]).map((n) => String(n))
      : [],
    confirmations: confirmations.success
      ? confirmations.data
      : { anamnese: false, bio: false, revisao: false },
    contentHash: String(row["content_hash"] ?? ""),
    approvedVersion: row["approved_version"] == null ? null : Number(row["approved_version"]),
    approvedAt: row["approved_at"] == null ? null : String(row["approved_at"]),
    approvedHash: row["approved_hash"] == null ? null : String(row["approved_hash"]),
    createdAt: String(row["created_at"] ?? ""),
    updatedAt: String(row["updated_at"] ?? ""),
  };
}

/* ------------------------------ leituras ----------------------------- */

export async function listJourneys(sb: Sb, ownerId: string, limit = 50): Promise<JourneySummary[]> {
  const { data, error } = await sb
    .from(TABLE)
    .select("id, patient_name, status, version, approved_version, updated_at")
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new JourneyError("DB", error.message);
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row["id"]),
    patientName: String(row["patient_name"] ?? ""),
    status: String(row["status"] ?? ""),
    version: Number(row["version"] ?? 1),
    approvedVersion: row["approved_version"] == null ? null : Number(row["approved_version"]),
    updatedAt: String(row["updated_at"] ?? ""),
  }));
}

export async function getJourney(sb: Sb, ownerId: string, id: string): Promise<Journey> {
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) throw new JourneyError("DB", error.message);
  if (!data) throw new JourneyError("NOT_FOUND", "Jornada não encontrada.");
  return rowToJourney(data as Record<string, unknown>);
}

/* ------------------------------ escritas ----------------------------- */

/**
 * Cliente privilegiado para escrita. O cliente do utilizador não tem (nem deve ter)
 * permissões de escrita nestas tabelas: cada chamada aqui já validou auth + admin + dono.
 */
async function writer(): Promise<Sb> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Sb;
}

export async function createJourney(sb: Sb, ownerId: string, patientName: string): Promise<Journey> {
  const name = patientName.trim();
  if (!name) throw new JourneyError("VALIDATION", "Indique o nome do paciente.");
  const anamnese: Anamnese = { ...emptyAnamnese, header: { ...emptyAnamnese.header, paciente: name, dataConsulta: todayBr() } };
  const hash = await contentHash({ patientName: name, anamnese, bio: emptyBio, protocolo: null });
  const db = await writer();
  const { data, error } = await db
    .from(TABLE)
    .insert({
      owner_id: ownerId,
      patient_name: name,
      status: "anamnese",
      version: 1,
      anamnese,
      bio: emptyBio,
      confirmations: { anamnese: false, bio: false, revisao: false },
      content_hash: hash,
    })
    .select("*")
    .single();
  if (error) throw new JourneyError("DB", error.message);
  return rowToJourney(data as Record<string, unknown>);
}

export type JourneyPatch = {
  patientName?: string;
  anamnese?: Anamnese;
  bio?: Bio;
  protocolo?: Protocolo | null;
  internalNotes?: string[];
  confirmations?: Partial<Confirmations>;
  status?: string;
};

/**
 * Atualização atómica: só grava se a versão em base for a esperada.
 * Alterações de conteúdo invalidam confirmações dependentes e a aprovação.
 */
export async function patchJourney(
  sb: Sb,
  ownerId: string,
  id: string,
  expectedVersion: number,
  patch: JourneyPatch,
): Promise<Journey> {
  const current = await getJourney(sb, ownerId, id);
  if (current.version !== expectedVersion) {
    throw new JourneyError(
      "VERSAO_DESATUALIZADA",
      "Esta jornada foi alterada noutro separador. Recarregue para ver a versão atual.",
    );
  }

  const changedAnamnese = patch.anamnese !== undefined;
  const changedBio = patch.bio !== undefined;
  const changedProtocolo = patch.protocolo !== undefined;
  const changedName = patch.patientName !== undefined && patch.patientName.trim() !== current.patientName;
  const contentChanged = changedAnamnese || changedBio || changedProtocolo || changedName;

  const patientName = (patch.patientName ?? current.patientName).trim();
  const anamnese = patch.anamnese ?? current.anamnese;
  const bio = patch.bio ?? current.bio;
  const protocolo = patch.protocolo !== undefined ? patch.protocolo : current.protocolo;

  const confirmations: Confirmations = {
    ...current.confirmations,
    ...(patch.confirmations ?? {}),
  };
  if (changedAnamnese && patch.confirmations?.anamnese === undefined) confirmations.anamnese = false;
  if (changedBio && patch.confirmations?.bio === undefined) confirmations.bio = false;
  if ((changedAnamnese || changedBio || changedName) && patch.confirmations?.revisao === undefined) {
    confirmations.revisao = false;
  }

  const hash = await contentHash({ patientName, anamnese, bio, protocolo });

  const update: Record<string, unknown> = {
    patient_name: patientName,
    anamnese,
    bio,
    protocolo,
    confirmations,
    content_hash: hash,
    version: expectedVersion + 1,
  };
  if (patch.internalNotes !== undefined) update["internal_notes"] = patch.internalNotes;
  if (patch.status !== undefined) update["status"] = patch.status;
  if (contentChanged) {
    // Qualquer edição posterior invalida a aprovação em vigor.
    update["approved_version"] = null;
    update["approved_at"] = null;
    update["approved_by"] = null;
    update["approved_hash"] = null;
    if (current.status === "aprovado") update["status"] = patch.status ?? "protocolo";
  }

  const db = await writer();
  const { data, error } = await db
    .from(TABLE)
    .update(update)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .eq("version", expectedVersion)
    .select("*")
    .maybeSingle();
  if (error) throw new JourneyError("DB", error.message);
  if (!data) {
    throw new JourneyError(
      "VERSAO_DESATUALIZADA",
      "Esta jornada foi alterada entretanto. Recarregue para ver a versão atual.",
    );
  }
  return rowToJourney(data as Record<string, unknown>);
}

export async function deleteJourney(sb: Sb, ownerId: string, id: string): Promise<void> {
  await getJourney(sb, ownerId, id); // confirma que o registo é mesmo do dono
  const db = await writer();
  const { error } = await db.from(TABLE).delete().eq("id", id).eq("owner_id", ownerId);
  if (error) throw new JourneyError("DB", error.message);
}

/* ----------------------------- validações ---------------------------- */

export type JourneyIssues = {
  blocking: string[];
  warnings: string[];
};

/** Painel interno: lacunas essenciais e conflitos. Nunca sai no HTML. */
export function reviewIssues(journey: Journey): JourneyIssues {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!journey.patientName.trim()) blocking.push("Nome do paciente em falta.");

  const anamneseName = journey.anamnese.header.paciente.trim();
  if (anamneseName && !sameIdentity(journey.patientName, anamneseName)) {
    blocking.push(
      `Identificação incompatível entre a jornada ("${journey.patientName}") e a anamnese ("${anamneseName}").`,
    );
  }
  if (!journey.bio.semExame) {
    const bioName = journey.bio.paciente.trim();
    if (bioName && !sameIdentity(journey.patientName, bioName)) {
      blocking.push(
        `Identificação incompatível entre a jornada ("${journey.patientName}") e o exame ("${bioName}").`,
      );
    }
    if (journey.bio.identityReview) blocking.push("Exame marcado para revisão de identidade (NEEDS_IDENTITY_REVIEW).");
  }

  if (!journey.anamnese.queixaObjetivos.queixa.trim()) warnings.push("Queixa principal não registada.");
  if (!journey.anamnese.queixaObjetivos.objetivo.trim()) warnings.push("Objetivo do paciente não registado.");
  if (!journey.confirmations.anamnese) warnings.push("Anamnese ainda não confirmada.");
  if (!journey.bio.semExame && !journey.confirmations.bio) warnings.push("Bioimpedância ainda não confirmada.");

  if (journey.bio.semExame) {
    warnings.push("Jornada a seguir sem exame de bioimpedância (escolha explícita).");
  } else {
    const evolution = computeEvolution(journey.bio);
    if (!evolution.hasTrend) warnings.push("Menos de duas datas confirmadas: sem tendência de evolução.");
    if (evolution.ignoredDates.length) {
      warnings.push(`Datas ilegíveis no histórico: ${evolution.ignoredDates.join(", ")}.`);
    }
    for (const duvida of journey.bio.duvidas) warnings.push(`Dúvida na extração: ${duvida}`);
  }

  return { blocking, warnings };
}

/* -------------------------------- HTML -------------------------------- */

export function buildHtml(journey: Journey, kind: "draft" | "final"): string {
  const protocolo = journey.protocolo ?? emptyProtocolo;
  if (kind === "final") {
    if (journey.approvedVersion == null || journey.approvedVersion !== journey.version) {
      throw new JourneyError(
        "NAO_APROVADO",
        "O HTML final só fica disponível depois de aprovar a versão atual na aplicação.",
      );
    }
    if (journey.approvedHash !== journey.contentHash) {
      throw new JourneyError("CONTEUDO_ALTERADO", "O conteúdo mudou desde a aprovação. Aprove novamente.");
    }
  }
  return renderProtocolHtml({
    patientName: journey.patientName,
    objetivo: protocolo.objetivo,
    anamnese: journey.anamnese,
    bio: journey.bio,
    protocolo,
    draft: kind === "draft",
    version: journey.version,
  });
}

export function htmlFileName(journey: Journey, kind: "draft" | "final"): string {
  const slug =
    journey.patientName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "paciente";
  return `protocolo-${slug}-v${journey.version}${kind === "draft" ? "-rascunho" : ""}.html`;
}

/** Resumo da bioimpedância partilhado pela interface e pelo MCP (whitelist idêntica). */
export function bioResumoTexto(bio: Bio): string {
  if (bio.semExame) return "";
  return [
    `Paciente: ${bio.paciente}`,
    `Altura (m): ${bio.alturaM}`,
    `Idade: ${bio.idadeAnos}`,
    `Sexo: ${bio.sexo}`,
    `Data do exame: ${bio.dataHoraExame}`,
    `TMB (kcal): ${bio.taxaMetabolicaBasalKcal}`,
    `Gordura visceral: ${bio.nivelGorduraVisceral}`,
    ...(bio.historico ?? []).map(
      (h) =>
        `Histórico ${h.data}: peso ${h.peso} kg | músculo ${h.massaMuscularEsqueletica} kg | PGC ${h.pgc} %`,
    ),
  ]
    .filter((line) => !line.endsWith(": "))
    .join("\n");
}

/* ------------------------------ aprovação ----------------------------- */

/** Só o servidor aprova, e só com a versão + hash exatos que o humano viu. */
export async function approveJourney(
  sb: Sb,
  ownerId: string,
  id: string,
  expectedVersion: number,
  expectedHash: string,
): Promise<Journey> {
  const current = await getJourney(sb, ownerId, id);
  if (current.version !== expectedVersion || current.contentHash !== expectedHash) {
    throw new JourneyError(
      "CONTEUDO_ALTERADO",
      "O conteúdo mudou desde que abriu esta pré-visualização. Reveja e aprove novamente.",
    );
  }
  const issues = reviewIssues(current);
  if (issues.blocking.length) throw new JourneyError("BLOQUEADO", issues.blocking.join(" "));

  // Dependências essenciais: confirmadas no servidor, não apenas avisadas na interface.
  if (!current.confirmations.anamnese) {
    throw new JourneyError("BLOQUEADO", "Confirme a anamnese antes de aprovar.");
  }
  if (!current.bio.semExame && !current.confirmations.bio) {
    throw new JourneyError("BLOQUEADO", "Confirme os dados da bioimpedância antes de aprovar.");
  }
  if (!current.confirmations.revisao) {
    throw new JourneyError("BLOQUEADO", "Confirme a revisão dos dados antes de aprovar.");
  }
  if (!current.protocolo || current.protocolo.sections.length === 0) {
    throw new JourneyError("BLOQUEADO", "Não há protocolo para aprovar.");
  }
  const objetivo = current.protocolo.objetivo;
  const modelo = OBJETIVOS.find((o) => o.value === objetivo);
  if (!modelo || !modelo.available) {
    throw new JourneyError(
      "BLOQUEADO",
      "Escolha um objetivo com modelo disponível antes de aprovar (o modelo de emagrecimento ainda está por definir).",
    );
  }
  const temConteudo = current.protocolo.sections.some((sec) => sec.blocks.length > 0);
  if (!temConteudo) throw new JourneyError("BLOQUEADO", "O protocolo está vazio.");

  const snapshot = {
    patientName: current.patientName,
    anamnese: current.anamnese,
    bio: current.bio,
    protocolo: current.protocolo,
    html: buildHtml({ ...current, approvedVersion: current.version, approvedHash: current.contentHash }, "final"),
  };

  const db = await writer();
  const { error } = await db.rpc("aprovar_jornada", {
    _jornada_id: id,
    _user_id: ownerId,
    _expected_version: expectedVersion,
    _content_hash: expectedHash,
    _snapshot: snapshot,
  });
  if (error) {
    if (error.message.includes("VERSAO_DESATUALIZADA") || error.message.includes("CONTEUDO_ALTERADO")) {
      throw new JourneyError("CONTEUDO_ALTERADO", "A versão mudou entretanto. Reveja e aprove novamente.");
    }
    throw new JourneyError("DB", error.message);
  }
  return getJourney(sb, ownerId, id);
}

/**
 * HTML final = snapshot EXATO aprovado, guardado no momento da aprovação.
 * Nunca é recalculado, para que a data e o conteúdo não mudem entre downloads.
 */
export async function approvedSnapshotHtml(
  sb: Sb,
  ownerId: string,
  journey: Journey,
): Promise<string> {
  if (journey.approvedVersion == null || journey.approvedVersion !== journey.version) {
    throw new JourneyError(
      "NAO_APROVADO",
      "O HTML final só fica disponível depois de aprovar a versão atual na aplicação.",
    );
  }
  if (journey.approvedHash !== journey.contentHash) {
    throw new JourneyError("CONTEUDO_ALTERADO", "O conteúdo mudou desde a aprovação. Aprove novamente.");
  }
  const { data, error } = await sb
    .from("jornada_aprovacoes")
    .select("version, content_hash, approved_by, approved_at, snapshot")
    .eq("jornada_id", journey.id)
    .eq("owner_id", ownerId)
    .eq("version", journey.approvedVersion)
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new JourneyError("DB", error.message);
  if (!data) throw new JourneyError("NAO_APROVADO", "Registo de aprovação não encontrado.");

  const row = data as Record<string, unknown>;
  if (String(row["content_hash"]) !== journey.contentHash) {
    throw new JourneyError("CONTEUDO_ALTERADO", "A aprovação registada não corresponde ao conteúdo atual.");
  }
  if (!row["approved_by"] || !row["approved_at"]) {
    throw new JourneyError("NAO_APROVADO", "Aprovação sem autor ou data registados.");
  }
  const snapshot = row["snapshot"] as Record<string, unknown> | null;
  const html = snapshot && typeof snapshot["html"] === "string" ? (snapshot["html"] as string) : "";
  if (!html) throw new JourneyError("NAO_APROVADO", "Snapshot aprovado sem documento.");
  return html;
}
