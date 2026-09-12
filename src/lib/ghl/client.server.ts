import { GhlError } from "./errors";

// Cliente HTTP do GoHighLevel (API v2). Server-only.
// Credenciais: GHL_API_KEY (Private Integration Token) + GHL_LOCATION_ID.

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

export type GhlContact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dateOfBirth?: string | null;
  gender?: string | null;
  tags?: string[];
};

type GhlEnv = { token: string; locationId: string };

function ghlEnv(): GhlEnv {
  const token = process.env["GHL_API_KEY"]?.trim();
  const locationId = process.env["GHL_LOCATION_ID"]?.trim();
  if (!token || !locationId) {
    throw new GhlError("configuration");
  }
  return { token, locationId };
}

async function ghlFetch(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<unknown> {
  const { token } = ghlEnv();
  const url = new URL(`${GHL_BASE}${path}`);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_VERSION,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
  } catch {
    throw new GhlError("transport");
  }
  if (!response.ok) {
    // Never log provider bodies, request paths, contact identifiers or headers.
    console.error("[GHL] Falha HTTP", { status: response.status, method: init.method ?? "GET" });
    await response.body?.cancel().catch(() => undefined);
    throw new GhlError("response", response.status);
  }
  try {
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    throw new GhlError("invalid_response");
  }
}

function pick(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function toContact(raw: unknown): GhlContact | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = pick(r, "id") || pick(r, "contactId");
  if (!id) return null;
  const first = pick(r, "firstName");
  const last = pick(r, "lastName");
  return {
    id,
    name: pick(r, "contactName") || pick(r, "name") || [first, last].filter(Boolean).join(" "),
    email: pick(r, "email"),
    phone: pick(r, "phone"),
    dateOfBirth: pick(r, "dateOfBirth") || null,
    gender: pick(r, "gender") || null,
    tags: Array.isArray(r["tags"])
      ? (r["tags"] as unknown[]).filter((t): t is string => typeof t === "string")
      : [],
  };
}

/** Procura contactos por nome, email ou telefone. */
export async function searchGhlContacts(query: string, limit = 10): Promise<GhlContact[]> {
  const { locationId } = ghlEnv();
  const payload = (await ghlFetch("/contacts/", {
    query: { locationId, query, limit: String(Math.min(Math.max(limit, 1), 50)) },
  })) as { contacts?: unknown[] };
  if (!payload || !Array.isArray(payload.contacts)) throw new GhlError("invalid_response");
  return payload.contacts.map(toContact).filter((c): c is GhlContact => c !== null);
}

/** Cria ou atualiza um contacto (identificado por email ou telefone). */
export async function upsertGhlContact(input: {
  name: string;
  email?: string;
  phone?: string;
  tags?: string[];
}): Promise<GhlContact> {
  const { locationId } = ghlEnv();
  if (!input.email && !input.phone) {
    throw new Error("É necessário email ou telefone para identificar o contacto no GoHighLevel.");
  }
  const payload = (await ghlFetch("/contacts/upsert", {
    method: "POST",
    body: {
      locationId,
      name: input.name,
      ...(input.email ? { email: input.email } : {}),
      ...(input.phone ? { phone: input.phone } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
    },
  })) as { contact?: unknown };
  const contact = toContact(payload?.contact);
  if (!contact) throw new GhlError("invalid_response");
  return contact;
}

/** Regista uma nota no contacto. */
export async function addGhlContactNote(contactId: string, body: string): Promise<void> {
  await ghlFetch(`/contacts/${encodeURIComponent(contactId)}/notes`, {
    method: "POST",
    body: { body },
  });
}
