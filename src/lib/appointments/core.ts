import { z } from "zod";

/**
 * Núcleo puro do acompanhamento de agendamentos confirmados.
 * Sem acesso a rede, banco ou segredos: só validação, fuso e derivação de estado.
 */

export const MAX_RANGE_DAYS = 31;
export const MAX_EVENTS = 250;
export const MAX_NAME_LOOKUPS = 60;

export class AppointmentsError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const rangeSchema = z
  .strictObject({ from: z.iso.date(), to: z.iso.date() })
  .refine((r) => r.from <= r.to, { message: "range" });
export type Range = z.infer<typeof rangeSchema>;
export const requestSchema = z.union([rangeSchema, z.strictObject({})]);

export const eventSchema = z.object({
  id: z.string().min(1),
  calendarId: z.string().min(1),
  locationId: z.string().min(1),
  contactId: z.string().min(1),
  startTime: z.string().min(1),
  appointmentStatus: z.string().min(1),
});
export type CalendarEvent = z.infer<typeof eventSchema>;

export const eventsPayloadSchema = z.object({ events: z.array(z.unknown()).max(2000) });

export function rangeDays(range: Range): number {
  return (
    Math.round(
      (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86400000,
    ) + 1
  );
}

export function assertRange(range: Range): Range {
  if (!rangeSchema.safeParse(range).success)
    throw new AppointmentsError("invalid_range", "Confira as datas do período selecionado.");
  const days = rangeDays(range);
  if (!Number.isFinite(days) || days < 1)
    throw new AppointmentsError("invalid_range", "Confira as datas do período selecionado.");
  if (days > MAX_RANGE_DAYS)
    throw new AppointmentsError(
      "range_too_large",
      `O período está limitado a ${MAX_RANGE_DAYS} dias. Escolha um intervalo menor.`,
    );
  return range;
}

/**
 * Janela UTC ampliada em um dia de cada lado: evita perder agendamentos
 * junto à meia-noite local e em mudanças de horário de verão. A filtragem
 * final é sempre feita pela data local da clínica.
 */
export function utcWindow(range: Range): { startTime: number; endTime: number } {
  return {
    startTime: Date.parse(`${range.from}T00:00:00Z`) - 86400000,
    endTime: Date.parse(`${range.to}T00:00:00Z`) + 2 * 86400000,
  };
}

export function localParts(iso: string, timezone: string): { date: string; time: string } {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()))
    throw new AppointmentsError(
      "invalid_event",
      "O GHL devolveu uma data de agendamento inválida.",
    );
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(at);
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
  } catch {
    throw new AppointmentsError("invalid_timezone", "Confira o fuso horário da clínica no GHL.");
  }
}

export type SelectionResult = {
  events: (CalendarEvent & { localDate: string; localTime: string })[];
  ignoredOtherStatus: number;
  ignoredOtherCalendar: number;
  ignoredOutOfRange: number;
  invalid: number;
};

/** Mantém apenas confirmados do calendário/location configurados, dentro das datas locais. */
export function selectConfirmedEvents(
  raw: unknown[],
  options: { calendarId: string; locationId: string; timezone: string; range: Range },
): SelectionResult {
  const result: SelectionResult = {
    events: [],
    ignoredOtherStatus: 0,
    ignoredOtherCalendar: 0,
    ignoredOutOfRange: 0,
    invalid: 0,
  };
  for (const item of raw) {
    const parsed = eventSchema.safeParse(item);
    if (!parsed.success) {
      result.invalid += 1;
      continue;
    }
    const event = parsed.data;
    if (event.calendarId !== options.calendarId || event.locationId !== options.locationId) {
      result.ignoredOtherCalendar += 1;
      continue;
    }
    if (event.appointmentStatus.toLowerCase() !== "confirmed") {
      result.ignoredOtherStatus += 1;
      continue;
    }
    let local: { date: string; time: string };
    try {
      local = localParts(event.startTime, options.timezone);
    } catch {
      result.invalid += 1;
      continue;
    }
    if (local.date < options.range.from || local.date > options.range.to) {
      result.ignoredOutOfRange += 1;
      continue;
    }
    result.events.push({ ...event, localDate: local.date, localTime: local.time });
  }
  // Respostas duplicadas não duplicam pacientes; identidades ambíguas não são vinculadas.
  const unique = new Map<string, (typeof result.events)[number]>();
  const ambiguous = new Set<string>();
  for (const event of result.events) {
    const previous = unique.get(event.id);
    if (
      previous &&
      (previous.contactId !== event.contactId || !sameInstant(previous.startTime, event.startTime))
    )
      ambiguous.add(event.id);
    unique.set(event.id, event);
  }
  result.invalid += ambiguous.size;
  result.events = [...unique.values()].filter((e) => !ambiguous.has(e.id));
  result.events.sort(
    (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || a.id.localeCompare(b.id),
  );
  return result;
}

export type InvitationRow = {
  id: string;
  location_id: string;
  appointment_id: string;
  contact_id: string;
  appointment_start: string;
  consultation_id: string;
  expires_at: string;
  revoked_at: string | null;
  submitted_at: string | null;
  submission_id: string | null;
};
export type SubmissionRow = {
  id: string;
  consultation_id: string;
  invitation_id: string | null;
  confirmed_at: string;
};
export type DraftRow = { consultation_id: string; anamnesis_id: string | null };

export type Stage =
  | "sem_convite"
  | "convite_criado"
  | "convite_expirado"
  | "convite_revogado"
  | "recebida"
  | "aplicada"
  | "nova_versao"
  | "conflito"
  | "indisponivel";

export const STAGE_LABEL: Record<Stage, string> = {
  sem_convite: "Sem convite para este horário",
  convite_criado: "Convite criado — aguardando resposta",
  convite_expirado: "Convite expirado",
  convite_revogado: "Convite revogado",
  recebida: "Anamnese recebida",
  aplicada: "Anamnese aplicada à ficha",
  nova_versao: "Nova versão por revisar",
  conflito: "Vínculo conflitante — conferir",
  indisponivel: "Estado indisponível",
};

export type AppointmentRow = {
  appointmentId: string;
  startIso: string;
  localDate: string;
  localTime: string;
  stage: Stage;
  patientName: string | null;
  nameSource: "cadastro" | "ghl" | "indisponivel";
  consultationId: string | null;
  receivedAt: string | null;
  appliedSubmissionId: string | null;
  expiresAt: string | null;
  note: string | null;
};

export const sameInstant = (a: string, b: string) => {
  const x = Date.parse(a);
  const y = Date.parse(b);
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};

/**
 * Cruza cada agendamento com o convite do MESMO location + appointment + contato
 * + instante de início. Reagendamentos não herdam a resposta anterior.
 */
export function buildRows(input: {
  events: (CalendarEvent & { localDate: string; localTime: string })[];
  invitations: InvitationRow[];
  submissions: SubmissionRow[];
  drafts: DraftRow[];
  consultationNames: Map<string, string>;
  contactNames: Map<string, string>;
  locationId: string;
  progressUnavailable?: boolean;
  now?: number;
}): AppointmentRow[] {
  const now = input.now ?? Date.now();
  return input.events.map((event) => {
    const base = {
      appointmentId: event.id,
      startIso: new Date(event.startTime).toISOString(),
      localDate: event.localDate,
      localTime: event.localTime,
      patientName: null as string | null,
      nameSource: "indisponivel" as AppointmentRow["nameSource"],
      consultationId: null as string | null,
      receivedAt: null as string | null,
      appliedSubmissionId: null as string | null,
      expiresAt: null as string | null,
      note: null as string | null,
    };
    const contactName = input.contactNames.get(event.contactId) ?? null;
    if (contactName) {
      base.patientName = contactName;
      base.nameSource = "ghl";
    }

    if (input.progressUnavailable) {
      return {
        ...base,
        stage: "indisponivel",
        note: "Não foi possível ler o progresso da anamnese.",
      };
    }

    const forAppointment = input.invitations.filter(
      (i) => i.location_id === input.locationId && i.appointment_id === event.id,
    );
    const conflicting = forAppointment.filter((i) => i.contact_id !== event.contactId);
    const invitation = forAppointment.find(
      (i) => i.contact_id === event.contactId && sameInstant(i.appointment_start, event.startTime),
    );

    if (
      conflicting.length > 0 ||
      new Set(
        forAppointment
          .filter((i) => sameInstant(i.appointment_start, event.startTime))
          .map((i) => i.consultation_id),
      ).size > 1
    )
      return {
        ...base,
        stage: "conflito",
        note: "Há vínculos divergentes para este agendamento. Confira o cadastro antes de abrir a consulta.",
      };

    if (!invitation) {
      if (conflicting.length > 0)
        return {
          ...base,
          stage: "conflito",
          note: "Existe convite com outro contato para este agendamento. Não foi vinculado.",
        };
      const previous = forAppointment.some((i) => i.contact_id === event.contactId);
      return {
        ...base,
        stage: "sem_convite",
        note: previous ? "Há convite de um horário anterior; o agendamento foi remarcado." : null,
      };
    }

    if (!input.consultationNames.has(invitation.consultation_id))
      return {
        ...base,
        stage: "indisponivel",
        note: "A consulta vinculada não pôde ser confirmada. Tente atualizar.",
      };

    const consultationName = input.consultationNames.get(invitation.consultation_id) ?? null;
    if (consultationName) {
      base.patientName = consultationName;
      base.nameSource = "cadastro";
    }
    base.consultationId = invitation.consultation_id;
    base.expiresAt = invitation.expires_at;

    // Inclui anamneses confirmadas no consultório: qualquer versão da MESMA consulta.
    const versions = input.submissions
      .filter((s) => s.consultation_id === invitation.consultation_id)
      .sort((a, b) => Date.parse(b.confirmed_at) - Date.parse(a.confirmed_at));
    const current = versions[0];
    const draft = input.drafts.find((d) => d.consultation_id === invitation.consultation_id);
    if (
      (invitation.submission_id && !versions.some((s) => s.id === invitation.submission_id)) ||
      (invitation.submitted_at && !current) ||
      (draft?.anamnesis_id && !versions.some((s) => s.id === draft.anamnesis_id))
    )
      return {
        ...base,
        stage: "indisponivel",
        note: "Há uma resposta registrada, mas não foi possível conferir todas as versões.",
      };

    if (current) {
      const applied = draft?.anamnesis_id ?? null;
      const stage: Stage =
        applied === current.id ? "aplicada" : applied ? "nova_versao" : "recebida";
      return {
        ...base,
        stage,
        receivedAt: current.confirmed_at,
        appliedSubmissionId: applied,
        note:
          versions.length > 1
            ? `${versions.length} versões recebidas nesta consulta.`
            : current.invitation_id === null
              ? "Respondida no consultório, na mesma consulta."
              : null,
      };
    }
    if (invitation.revoked_at) return { ...base, stage: "convite_revogado" };
    if (Date.parse(invitation.expires_at) <= now) return { ...base, stage: "convite_expirado" };
    return {
      ...base,
      stage: "convite_criado",
      note: "Convite criado no sistema. Não confirma envio ou entrega ao paciente.",
    };
  });
}

export function totals(rows: AppointmentRow[]): { stage: Stage; count: number }[] {
  const counts = new Map<Stage, number>();
  for (const row of rows) counts.set(row.stage, (counts.get(row.stage) ?? 0) + 1);
  return [...counts.entries()].map(([stage, count]) => ({ stage, count }));
}

export function todayIso(now: Date, timezone: string): string {
  return localParts(now.toISOString(), timezone).date;
}
export function plusDaysIso(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
