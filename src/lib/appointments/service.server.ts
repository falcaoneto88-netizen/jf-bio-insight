import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { INTAKE_LOCATION_ID } from "@/lib/intake-invitations/schema";
import {
  AppointmentsError,
  MAX_EVENTS,
  MAX_NAME_LOOKUPS,
  assertRange,
  buildRows,
  eventsPayloadSchema,
  selectConfirmedEvents,
  totals,
  localParts,
  todayIso,
  plusDaysIso,
  sameInstant,
  utcWindow,
  type AppointmentRow,
  type DraftRow,
  type InvitationRow,
  type Range,
  type SubmissionRow,
} from "./core";

const GHL_BASE = "https://services.leadconnectorhq.com";
const TIMEOUT_MS = 15000;
const MAX_BYTES = 600_000;

/** Somente leitura, GET, origem fixa, sem seguir redirects com a credencial. */
async function ghlGet(
  path: string,
  query: Record<string, string>,
  key: string,
  fetcher: typeof fetch,
): Promise<unknown> {
  const url = new URL(`${GHL_BASE}/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  let response: Response;
  try {
    response = await fetcher(url.toString(), {
      method: "GET",
      // workerd aceita apenas "follow" ou "manual"; 3xx é rejeitado abaixo.
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${key}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
    });
  } catch {
    throw new AppointmentsError("ghl_unavailable", "Não foi possível consultar a agenda no GHL.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    // Nunca registamos corpo, headers, credenciais ou dados de pacientes.
    console.error("[agendamentos] leitura GHL falhou", { status: response.status });
    throw new AppointmentsError(
      response.status === 401 || response.status === 403 ? "ghl_credentials" : "ghl_unavailable",
      response.status === 401 || response.status === 403
        ? "Confira a credencial e as permissões de agenda e contatos no GHL."
        : "A agenda do GHL está indisponível no momento.",
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new AppointmentsError("ghl_invalid", "O GHL devolveu uma resposta vazia.");
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new AppointmentsError(
          "too_large",
          "O período devolveu dados demais. Escolha um intervalo menor.",
        );
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AppointmentsError) throw error;
    throw new AppointmentsError("ghl_invalid", "O GHL devolveu uma resposta inválida.");
  } finally {
    reader.releaseLock();
  }
}

function requireEnv(env: Record<string, string | undefined>) {
  const key = env["GHL_API_KEY"]?.trim();
  const calendarId = env["BIOREPORT_GHL_PROCEDURE_CALENDAR_ID"]?.trim();
  if (!key)
    throw new AppointmentsError(
      "not_configured",
      "A leitura da agenda não está configurada. Avise a equipe técnica.",
    );
  if (!calendarId || !/^[A-Za-z0-9_-]{10,100}$/.test(calendarId))
    throw new AppointmentsError(
      "calendar_not_configured",
      "A clínica precisa definir o calendário do procedimento antes de continuar.",
    );
  return { key, calendarId, locationId: INTAKE_LOCATION_ID };
}

async function clinicTimezone(locationId: string, key: string, fetcher: typeof fetch) {
  const parsed = z
    .object({ location: z.object({ id: z.string(), timezone: z.string().min(1) }) })
    .safeParse(await ghlGet(`locations/${encodeURIComponent(locationId)}`, {}, key, fetcher));
  if (!parsed.success || parsed.data.location.id !== locationId)
    throw new AppointmentsError("invalid_timezone", "Confira o fuso horário da clínica no GHL.");
  localParts(new Date().toISOString(), parsed.data.location.timezone);
  return parsed.data.location.timezone;
}

/** Nomes vindos do GHL, com concorrência e volume limitados. Falha individual não derruba a lista. */
async function contactNames(
  ids: string[],
  locationId: string,
  key: string,
  fetcher: typeof fetch,
  deadline: AbortSignal,
) {
  const names = new Map<string, string>();
  const pending = ids.slice(0, MAX_NAME_LOOKUPS);
  const worker = async () => {
    for (;;) {
      if (deadline.aborted) return;
      const id = pending.shift();
      if (!id) return;
      try {
        const parsed = z
          .object({
            contact: z.object({
              id: z.string(),
              locationId: z.string(),
              name: z.string().nullish(),
              firstName: z.string().nullish(),
              lastName: z.string().nullish(),
            }),
          })
          .safeParse(await ghlGet(`contacts/${encodeURIComponent(id)}`, {}, key, fetcher));
        if (!parsed.success) continue;
        const c = parsed.data.contact;
        if (c.id !== id || c.locationId !== locationId) continue;
        const name = ([c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "")
          .trim()
          .replace(/\s+/g, " ");
        if (name) names.set(id, name);
      } catch {
        // nome indisponível para este contato; o agendamento continua listado
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return { names, truncated: names.size < ids.length };
}

/** Uma resposta limitada ou sem contagem não é prova de ausência de anamnese. */
function incomplete(result: { error: unknown; count: number | null; data: unknown[] | null }) {
  return (
    !!result.error || result.count === null || !result.data || result.count !== result.data.length
  );
}

export type AppointmentsResult = {
  rows: AppointmentRow[];
  timezone: string;
  fetchedAt: string;
  range: Range;
  totals: ReturnType<typeof totals>;
  warnings: string[];
  progressUnavailable: boolean;
};

export async function listConfirmedAppointments(
  db: SupabaseClient,
  range: Range,
  options: { fetcher?: typeof fetch; env?: Record<string, string | undefined>; now?: number } = {},
): Promise<AppointmentsResult> {
  const fetcher = options.fetcher ?? fetch;
  const env = options.env ?? (process.env as Record<string, string | undefined>);
  assertRange(range);
  const { key, calendarId, locationId } = requireEnv(env);

  const timezone = await clinicTimezone(locationId, key, fetcher);
  const window = utcWindow(range);
  const payload = eventsPayloadSchema.safeParse(
    await ghlGet(
      "calendars/events",
      {
        locationId,
        calendarId,
        startTime: String(window.startTime),
        endTime: String(window.endTime),
      },
      key,
      fetcher,
    ),
  );
  if (!payload.success)
    throw new AppointmentsError("ghl_invalid", "O GHL devolveu uma lista de agenda inválida.");

  const selection = selectConfirmedEvents(payload.data.events, {
    calendarId,
    locationId,
    timezone,
    range,
  });
  if (selection.events.length > MAX_EVENTS)
    throw new AppointmentsError(
      "too_many",
      `O período tem mais de ${MAX_EVENTS} agendamentos confirmados. Escolha um intervalo menor.`,
    );

  const warnings: string[] = [];
  if (selection.invalid > 0)
    warnings.push(
      `${selection.invalid} agendamento(s) vieram incompletos do GHL e não foram listados.`,
    );

  const appointmentIds = selection.events.map((e) => e.id);
  let invitations: InvitationRow[] = [];
  let submissions: SubmissionRow[] = [];
  let drafts: DraftRow[] = [];
  const consultationNames = new Map<string, string>();
  let progressUnavailable = false;

  if (appointmentIds.length > 0) {
    // Nunca select *: token_hash jamais sai do banco.
    const invitationQuery = await db
      .from("intake_invitations")
      .select(
        "id,location_id,appointment_id,contact_id,appointment_start,consultation_id,expires_at,revoked_at,submitted_at,submission_id",
      )
      .eq("location_id", locationId)
      .in("appointment_id", appointmentIds)
      .limit(1000);
    if (invitationQuery.error) {
      progressUnavailable = true;
      warnings.push("Não foi possível ler os convites. O estado da anamnese ficou indisponível.");
    } else {
      invitations = (invitationQuery.data ?? []) as InvitationRow[];
      const consultationIds = [...new Set(invitations.map((i) => i.consultation_id))];
      if (consultationIds.length > 0) {
        const [consultationQuery, submissionQuery, draftQuery] = await Promise.all([
          db.from("consultations").select("id,patient_name").in("id", consultationIds).limit(1000),
          db
            .from("anamnesis_submissions")
            .select("id,consultation_id,invitation_id,confirmed_at")
            .in("consultation_id", consultationIds)
            .limit(2000),
          db
            .from("consultation_drafts")
            .select("consultation_id,anamnesis_id")
            .in("consultation_id", consultationIds)
            .limit(1000),
        ]);
        if (consultationQuery.error || submissionQuery.error || draftQuery.error) {
          progressUnavailable = true;
          warnings.push(
            "Não foi possível ler o progresso da anamnese no banco. Tente atualizar em instantes.",
          );
        } else {
          for (const c of consultationQuery.data ?? [])
            consultationNames.set(c.id as string, String(c.patient_name ?? ""));
          submissions = (submissionQuery.data ?? []) as SubmissionRow[];
          drafts = (draftQuery.data ?? []) as DraftRow[];
        }
      }
    }
  }

  const missingName = [
    ...new Set(
      selection.events
        .filter((e) => {
          const invitation = invitations.find(
            (i) => i.appointment_id === e.id && i.contact_id === e.contactId,
          );
          return !invitation || !consultationNames.get(invitation.consultation_id);
        })
        .map((e) => e.contactId),
    ),
  ];
  const lookup =
    missingName.length > 0
      ? await contactNames(missingName, key, fetcher)
      : { names: new Map<string, string>(), truncated: false };
  if (lookup.truncated)
    warnings.push("Alguns nomes não foram consultados por limite de leituras. Reduza o período.");

  const rows = buildRows({
    events: selection.events,
    invitations,
    submissions,
    drafts,
    consultationNames,
    contactNames: lookup.names,
    locationId,
    progressUnavailable,
    ...(options.now === undefined ? {} : { now: options.now }),
  });

  return {
    rows,
    timezone,
    fetchedAt: new Date(options.now ?? Date.now()).toISOString(),
    range,
    totals: totals(rows),
    warnings,
    progressUnavailable,
  };
}
