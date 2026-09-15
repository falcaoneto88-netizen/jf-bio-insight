import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { anamnesisSchema, confirmationSchema, emptyAnamnesis } from "@/lib/anamnesis/form";
import {
  IntakeError,
  intakeDatabaseError,
  invitationSchema,
  issueRequestSchema,
  tokenSchema,
  ghlId,
  INTAKE_LOCATION_ID,
  INTAKE_WORKFLOW_ID,
  INTAKE_ORIGIN,
} from "./schema";

export function intakeSecret(env: Record<string, string | undefined> = process.env) {
  const secret = env.BIOREPORT_GHL_INTAKE_SECRET?.trim();
  if (!secret || !tokenSchema.safeParse(secret).success)
    throw new IntakeError(
      "not_configured",
      "O recebimento de anamneses ainda não foi configurado pela clínica.",
      503,
    );
  return secret;
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function procedureCalendar(env: Record<string, string | undefined> = process.env) {
  const parsed = ghlId.safeParse(env.BIOREPORT_GHL_PROCEDURE_CALENDAR_ID?.trim());
  if (!parsed.success)
    throw new IntakeError(
      "calendar_not_configured",
      "A clínica precisa definir o calendário do procedimento antes de continuar.",
      503,
    );
  return parsed.data;
}
export function publicIntakeDb(authorization?: string) {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new IntakeError(
      "not_configured",
      "O acesso ao banco está indisponível. Avise a clínica.",
      503,
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(authorization ? { global: { headers: { Authorization: authorization } } } : {}),
  });
}
export async function readBoundedJson(
  response: Response | Request,
  maxBytes = 100000,
): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new IntakeError("invalid_request", "Conteúdo ausente.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new IntakeError("too_large", "Conteúdo excede o limite permitido.", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new IntakeError("invalid_request", "Conteúdo inválido.");
  }
}
export async function assertIntakeAdmin(db: SupabaseClient) {
  const u = await db.auth.getUser();
  if (u.error || !u.data.user)
    throw new IntakeError("unauthorized", "Sua sessão expirou. Entre novamente.", 401);
  const r = await db.rpc("has_role", { _user_id: u.data.user.id, _role: "admin" });
  if (r.error || r.data !== true)
    throw new IntakeError("forbidden", "Acesso restrito a administradores.", 403);
}
export async function configureIntake(db: SupabaseClient, enabled: boolean) {
  await assertIntakeAdmin(db);
  if (enabled) procedureCalendar();
  const r = await db.rpc("configure_intake_automation", {
    _location_id: INTAKE_LOCATION_ID,
    _workflow_id: INTAKE_WORKFLOW_ID,
    _secret_hash: enabled ? digest(intakeSecret()) : "0".repeat(64),
    _enabled: enabled,
  });
  if (r.error) throw intakeDatabaseError(r.error);
  return { enabled };
}
export async function getIntakeSettings(db: SupabaseClient) {
  await assertIntakeAdmin(db);
  const r = await db
    .from("intake_automation")
    .select("enabled,location_id,workflow_id")
    .maybeSingle();
  if (r.error) throw intakeDatabaseError(r.error);
  return {
    enabled: r.data?.enabled === true,
    secretConfigured: tokenSchema.safeParse(process.env.BIOREPORT_GHL_INTAKE_SECRET?.trim())
      .success,
    calendarConfigured: ghlId.safeParse(process.env.BIOREPORT_GHL_PROCEDURE_CALENDAR_ID?.trim())
      .success,
  };
}
async function ghlRead(path: string, key: string, fetcher: typeof fetch) {
  let response: Response;
  try {
    response = await fetcher(`https://services.leadconnectorhq.com/${path}`, {
      method: "GET",
      // workerd supports manual redirects; reject their non-2xx response below.
      // Never follow a redirect with the GHL bearer credential.
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28" },
    });
  } catch {
    throw new IntakeError(
      "ghl_unavailable",
      "Não foi possível consultar o agendamento no GHL.",
      502,
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new IntakeError(
      "ghl_unavailable",
      response.status === 401 || response.status === 403
        ? "Confira a credencial e as permissões de contatos e agenda no GHL."
        : "Contato ou agendamento indisponível no GHL.",
      502,
    );
  }
  return readBoundedJson(response);
}
export function appointmentContext(
  contactRaw: unknown,
  eventRaw: unknown,
  locationRaw: unknown,
  input: z.infer<typeof issueRequestSchema>,
  calendarId: string,
  now = Date.now(),
) {
  const contact = z
    .object({
      contact: z.object({
        id: z.string(),
        locationId: z.string(),
        firstName: z.string().nullish(),
        lastName: z.string().nullish(),
        name: z.string().nullish(),
        email: z.union([z.email().max(254), z.literal("")]).nullish(),
      }),
    })
    .safeParse(contactRaw);
  const appointmentSchema = z.object({
    id: z.string(),
    contactId: z.string(),
    locationId: z.string(),
    startTime: z.iso.datetime({ offset: true }),
    calendarId: z.string(),
    appointmentStatus: z.string(),
  });
  const event = z
    .union([
      z
        .object({ appointment: appointmentSchema, event: z.never().optional() })
        .transform((value) => value.appointment),
      z
        .object({ event: appointmentSchema, appointment: z.never().optional() })
        .transform((value) => value.event),
    ])
    .safeParse(eventRaw);
  const location = z
    .object({ location: z.object({ id: z.string(), timezone: z.string() }) })
    .safeParse(locationRaw);
  if (!contact.success || !event.success || !location.success)
    throw new IntakeError(
      "ghl_invalid",
      "O GHL devolveu dados incompletos. Confira contato, agenda e fuso horário.",
      502,
    );
  const c = contact.data.contact,
    e = event.data,
    l = location.data.location;
  if (
    c.id !== input.contact_id ||
    c.locationId !== input.location_id ||
    e.id !== input.appointment_id ||
    e.contactId !== c.id ||
    e.locationId !== c.locationId ||
    l.id !== c.locationId
  )
    throw new IntakeError(
      "identity_mismatch",
      "Contato, agendamento e clínica não coincidem.",
      409,
    );
  if (e.calendarId !== calendarId)
    throw new IntakeError(
      "calendar_mismatch",
      "O agendamento não pertence ao calendário do procedimento. Confira com a equipe.",
      409,
    );
  if (e.appointmentStatus.toLowerCase() !== "confirmed")
    throw new IntakeError(
      "appointment_not_confirmed",
      "O procedimento precisa estar confirmado no calendário antes de continuar.",
      409,
    );
  const start = new Date(e.startTime).getTime();
  if (start <= now || start > now + 365 * 86400000)
    throw new IntakeError(
      "appointment_out_of_range",
      "Confira a data e a hora: o procedimento deve ser futuro e ocorrer em até um ano.",
      409,
    );
  const name = ([c.firstName, c.lastName].filter(Boolean).join(" ") || c.name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!confirmationSchema.shape.name.safeParse(name).success)
    throw new IntakeError("invalid_name", "Confira o nome completo do contato no GHL.", 409);
  let date: string;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: l.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(e.startTime));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    date = `${p.year}-${p.month}-${p.day}`;
  } catch {
    throw new IntakeError("invalid_timezone", "Confira o fuso horário da clínica no GHL.", 409);
  }
  return {
    name,
    email: c.email ?? "",
    start: new Date(e.startTime).toISOString(),
    date,
    timezone: l.timezone,
    calendarId: e.calendarId,
  };
}
export async function issueInvitation(
  raw: unknown,
  receivedKey: string,
  db: SupabaseClient,
  fetcher: typeof fetch = fetch,
  env: Record<string, string | undefined> = process.env,
) {
  const secret = intakeSecret(env);
  if (
    !tokenSchema.safeParse(receivedKey).success ||
    !timingSafeEqual(Buffer.from(receivedKey), Buffer.from(secret))
  )
    throw new IntakeError("unauthorized", "Integração não autorizada.", 401);
  const parsed = issueRequestSchema.safeParse(raw);
  if (!parsed.success)
    throw new IntakeError(
      "invalid_request",
      "Informe os identificadores da clínica, automação, contato e agendamento.",
    );
  const input = parsed.data,
    key = env.GHL_API_KEY;
  if (!key) throw new IntakeError("not_configured", "A consulta ao GHL não está configurada.", 503);
  const calendarId = procedureCalendar(env);
  const [contact, event, location] = await Promise.all([
    ghlRead(`contacts/${encodeURIComponent(input.contact_id)}`, key, fetcher),
    ghlRead(
      `calendars/events/appointments/${encodeURIComponent(input.appointment_id)}`,
      key,
      fetcher,
    ),
    ghlRead(`locations/${encodeURIComponent(input.location_id)}`, key, fetcher),
  ]);
  const context = appointmentContext(contact, event, location, input, calendarId);
  const token = createHmac("sha256", secret)
    .update(
      JSON.stringify([
        "bioreport-intake-v1",
        input.location_id,
        input.workflow_id,
        input.contact_id,
        input.appointment_id,
        context.start,
      ]),
    )
    .digest("hex");
  const r = await db.rpc("issue_intake_invitation", {
    _secret: secret,
    _location_id: input.location_id,
    _workflow_id: input.workflow_id,
    _contact_id: input.contact_id,
    _appointment_id: input.appointment_id,
    _appointment_start: context.start,
    _consultation_date: context.date,
    _name: context.name,
    _email: context.email,
    _token_hash: digest(token),
  });
  if (r.error) throw intakeDatabaseError(r.error);
  const result = z
    .object({
      status: z.enum(["pending", "submitted"]),
      consultation_id: z.uuid(),
      expires_at: z.iso.datetime({ offset: true }),
    })
    .safeParse(r.data);
  if (!result.success)
    throw new IntakeError(
      "invalid_response",
      "Não foi possível confirmar a criação do convite.",
      503,
    );
  return {
    can_proceed: true,
    consultation_id: result.data.consultation_id,
    appointment_id: input.appointment_id,
    appointment_start: context.start,
    appointment_timezone: context.timezone,
    consultation_date: context.date,
    status: result.data.status,
    can_send: result.data.status === "pending",
    anamnese_url:
      result.data.status === "pending" ? `${INTAKE_ORIGIN}/anamnese#convite=${token}` : null,
    expires_at: result.data.expires_at,
  };
}
export async function patientInvitation(raw: unknown, db: SupabaseClient, secret: string) {
  const input = z
    .discriminatedUnion("action", [
      z.strictObject({ action: z.literal("resolve"), token: tokenSchema }),
      z.strictObject({
        action: z.literal("submit"),
        token: tokenSchema,
        id: z.uuid(),
        // The review step omits hidden answers; restore blanks before validating again.
        answers: z.preprocess(
          (value) =>
            value && typeof value === "object" && !Array.isArray(value)
              ? { ...emptyAnamnesis(), ...value }
              : value,
          anamnesisSchema,
        ),
        name: confirmationSchema.shape.name,
        accepted: z.literal(true),
      }),
    ])
    .safeParse(raw);
  if (!input.success)
    throw new IntakeError(
      "invalid_request",
      "Confira os campos obrigatórios e a confirmação antes de enviar.",
    );
  const a = input.data;
  const r = await db.rpc(
    a.action === "resolve" ? "resolve_intake_invitation" : "submit_intake_invitation",
    a.action === "resolve"
      ? { _secret: secret, _token: a.token }
      : {
          _secret: secret,
          _token: a.token,
          _id: a.id,
          _answers: a.answers,
          _name: a.name,
          _accepted: true,
        },
  );
  if (r.error) throw intakeDatabaseError(r.error);
  const parsed = (
    a.action === "resolve"
      ? invitationSchema
      : z.object({ confirmed_at: z.iso.datetime({ offset: true }) })
  ).safeParse(r.data);
  if (!parsed.success)
    throw new IntakeError(
      "invalid_response",
      "Não foi possível confirmar o recebimento. Tente novamente.",
      503,
    );
  return parsed.data;
}
export function intakeReply(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export async function intakeHttp(request: Request, kind: "issue" | "patient") {
  try {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
      throw new IntakeError("invalid_request", "Envie conteúdo JSON.", 415);
    if (kind === "patient" && request.headers.get("origin") !== new URL(request.url).origin)
      throw new IntakeError("forbidden", "Origem não autorizada.", 403);
    const raw = await readBoundedJson(request);
    const db = publicIntakeDb();
    const result =
      kind === "issue"
        ? await issueInvitation(
            raw,
            /^Bearer ([a-f0-9]{64})$/i.exec(request.headers.get("authorization") ?? "")?.[1] ?? "",
            db,
          )
        : await patientInvitation(raw, db, intakeSecret());
    return intakeReply(result);
  } catch (e) {
    const error =
      e instanceof IntakeError
        ? e
        : new IntakeError("unavailable", "Serviço indisponível. Tente novamente.", 503);
    return intakeReply(
      {
        ...(kind === "issue" ? { can_proceed: false, can_send: false, anamnese_url: null } : {}),
        error: error.code,
        message: error.message,
      },
      error.status,
    );
  }
}
