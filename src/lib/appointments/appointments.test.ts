import { describe, expect, it } from "vitest";

import {
  assertRange,
  buildRows,
  localParts,
  plusDaysIso,
  rangeDays,
  selectConfirmedEvents,
  totals,
  utcWindow,
  type DraftRow,
  type InvitationRow,
  type SubmissionRow,
} from "./core";

const CAL = "qBIk8m8vqXzLKMgJEdsF";
const LOC = "ok2UHC2QMZsd8UHsAgEa";
const TZ = "America/Sao_Paulo";
const range = { from: "2026-09-18", to: "2026-09-20" };

const event = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "apt-1",
  calendarId: CAL,
  locationId: LOC,
  contactId: "ctc-1",
  startTime: "2026-09-18T15:00:00+00:00",
  appointmentStatus: "confirmed",
  ...over,
});

const invitation = (over: Partial<InvitationRow> = {}): InvitationRow => ({
  id: "inv-1",
  location_id: LOC,
  appointment_id: "apt-1",
  contact_id: "ctc-1",
  appointment_start: "2026-09-18T15:00:00+00:00",
  consultation_id: "con-1",
  expires_at: "2026-09-30T00:00:00+00:00",
  revoked_at: null,
  submitted_at: null,
  submission_id: null,
  ...over,
});

const rowsFor = (
  events: ReturnType<typeof selectConfirmedEvents>["events"],
  extra: {
    invitations?: InvitationRow[];
    submissions?: SubmissionRow[];
    drafts?: DraftRow[];
    names?: Map<string, string>;
    progressUnavailable?: boolean;
  } = {},
) =>
  buildRows({
    events,
    invitations: extra.invitations ?? [],
    submissions: extra.submissions ?? [],
    drafts: extra.drafts ?? [],
    consultationNames: extra.names ?? new Map([["con-1", "Paciente Fictício"]]),
    contactNames: new Map([["ctc-1", "Contato Fictício"]]),
    locationId: LOC,
    ...(extra.progressUnavailable ? { progressUnavailable: true } : {}),
    now: Date.parse("2026-09-18T12:00:00Z"),
  });

const selection = (events: unknown[]) =>
  selectConfirmedEvents(events, { calendarId: CAL, locationId: LOC, timezone: TZ, range });

describe("seleção de agendamentos", () => {
  it("mantém só confirmados do calendário e location configurados", () => {
    const result = selection([
      event(),
      event({ id: "a2", appointmentStatus: "showed" }),
      event({ id: "a3", calendarId: "outro-calendario" }),
      event({ id: "a4", locationId: "outra-location-xx" }),
      { id: "a5" },
    ]);
    expect(result.events.map((e) => e.id)).toEqual(["apt-1"]);
    expect(result.ignoredOtherStatus).toBe(1);
    expect(result.ignoredOtherCalendar).toBe(2);
    expect(result.invalid).toBe(1);
  });

  it("filtra por data local da clínica, não por UTC", () => {
    // 21/09 00:30 UTC = 20/09 21:30 em São Paulo: dentro do período local.
    const inside = selection([event({ id: "late", startTime: "2026-09-21T00:30:00+00:00" })]);
    expect(inside.events[0]?.localDate).toBe("2026-09-20");
    const outside = selection([event({ id: "next", startTime: "2026-09-21T13:00:00+00:00" })]);
    expect(outside.events).toHaveLength(0);
    expect(outside.ignoredOutOfRange).toBe(1);
  });

  it("amplia a janela UTC e limita o intervalo a 31 dias", () => {
    const w = utcWindow(range);
    expect(w.startTime).toBe(Date.parse("2026-09-17T00:00:00Z"));
    expect(w.endTime).toBe(Date.parse("2026-09-22T00:00:00Z"));
    expect(rangeDays(range)).toBe(3);
    expect(() => assertRange({ from: "2026-09-01", to: "2026-10-15" })).toThrow(/31 dias/);
    expect(localParts("2026-09-18T15:00:00+00:00", TZ).time).toBe("12:00");
    expect(plusDaysIso("2026-09-18", 30)).toBe("2026-10-18");
  });
});

describe("estado da anamnese", () => {
  it("bloqueia vínculo conflitante mesmo quando também há convite compatível", () => {
    const row = rowsFor(selection([event()]).events, {
      invitations: [invitation(), invitation({ id: "other", contact_id: "outro" })],
    })[0]!;
    expect(row.stage).toBe("conflito");
    expect(row.consultationId).toBeNull();
  });

  it("não oferece consulta que o banco não retornou", () => {
    const row = rowsFor(selection([event()]).events, {
      invitations: [invitation()],
      names: new Map(),
    })[0]!;
    expect(row.stage).toBe("indisponivel");
    expect(row.consultationId).toBeNull();
  });

  it("não declara pendente uma resposta cujo histórico ficou inconsistente", () => {
    const row = rowsFor(selection([event()]).events, {
      invitations: [invitation({ submission_id: "missing", submitted_at: "2026-09-18T09:00:00Z" })],
    })[0]!;
    expect(row.stage).toBe("indisponivel");
  });

  it("deduplica o evento e rejeita identidades divergentes no mesmo ID", () => {
    expect(selection([event(), event()]).events).toHaveLength(1);
    const conflict = selection([event(), event({ contactId: "outro" })]);
    expect(conflict.events).toHaveLength(0);
    expect(conflict.invalid).toBe(1);
  });

  it("sinaliza ausência de convite e reagendamento sem herdar resposta", () => {
    const none = rowsFor(selection([event()]).events)[0]!;
    expect(none.stage).toBe("sem_convite");
    expect(none.consultationId).toBeNull();
    expect(none.patientName).toBe("Contato Fictício");

    const moved = rowsFor(selection([event({ startTime: "2026-09-19T15:00:00+00:00" })]).events, {
      invitations: [invitation()],
      submissions: [
        {
          id: "sub-1",
          consultation_id: "con-1",
          invitation_id: "inv-1",
          confirmed_at: "2026-09-17T10:00:00Z",
        },
      ],
    })[0]!;
    expect(moved.stage).toBe("sem_convite");
    expect(moved.note).toMatch(/remarcado/);
    expect(moved.receivedAt).toBeNull();
  });

  it("não vincula convite de outro contato", () => {
    const row = rowsFor(selection([event()]).events, {
      invitations: [invitation({ contact_id: "ctc-outro" })],
    })[0]!;
    expect(row.stage).toBe("conflito");
    expect(row.consultationId).toBeNull();
  });

  it("distingue criado, expirado e revogado", () => {
    const events = selection([event()]).events;
    expect(rowsFor(events, { invitations: [invitation()] })[0]!.stage).toBe("convite_criado");
    expect(
      rowsFor(events, { invitations: [invitation({ expires_at: "2026-09-17T00:00:00Z" })] })[0]!
        .stage,
    ).toBe("convite_expirado");
    expect(
      rowsFor(events, { invitations: [invitation({ revoked_at: "2026-09-17T00:00:00Z" })] })[0]!
        .stage,
    ).toBe("convite_revogado");
  });

  it("aceita resposta do consultório na mesma consulta e distingue recebida, aplicada e nova versão", () => {
    const events = selection([event()]).events;
    const office: SubmissionRow = {
      id: "sub-office",
      consultation_id: "con-1",
      invitation_id: null,
      confirmed_at: "2026-09-18T09:00:00Z",
    };
    const received = rowsFor(events, { invitations: [invitation()], submissions: [office] })[0]!;
    expect(received.stage).toBe("recebida");
    expect(received.note).toMatch(/consultório/);

    const applied = rowsFor(events, {
      invitations: [invitation()],
      submissions: [office],
      drafts: [{ consultation_id: "con-1", anamnesis_id: "sub-office" }],
    })[0]!;
    expect(applied.stage).toBe("aplicada");
    expect(applied.appliedSubmissionId).toBe("sub-office");

    const newer = rowsFor(events, {
      invitations: [invitation()],
      submissions: [
        office,
        {
          id: "sub-new",
          consultation_id: "con-1",
          invitation_id: "inv-1",
          confirmed_at: "2026-09-18T11:00:00Z",
        },
      ],
      drafts: [{ consultation_id: "con-1", anamnesis_id: "sub-office" }],
    })[0]!;
    expect(newer.stage).toBe("nova_versao");
    expect(newer.receivedAt).toBe("2026-09-18T11:00:00Z");
  });

  it("falha de banco não vira 'sem anamnese'", () => {
    const row = rowsFor(selection([event()]).events, { progressUnavailable: true })[0]!;
    expect(row.stage).toBe("indisponivel");
    expect(totals([row])).toEqual([{ stage: "indisponivel", count: 1 }]);
  });

  it("não devolve tokens nem dados de contato sensíveis", () => {
    const row = rowsFor(selection([event()]).events, { invitations: [invitation()] })[0]!;
    expect(Object.keys(row).sort()).toEqual(
      [
        "appliedSubmissionId",
        "appointmentId",
        "consultationId",
        "expiresAt",
        "localDate",
        "localTime",
        "nameSource",
        "note",
        "patientName",
        "receivedAt",
        "stage",
        "startIso",
        "sync",
      ].sort(),
    );
    expect(JSON.stringify(row)).not.toMatch(/token|email|phone/i);
  });
});
