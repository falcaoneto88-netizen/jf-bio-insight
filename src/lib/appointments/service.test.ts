import { describe, expect, it, vi } from "vitest";

import { AppointmentsError } from "./core";
import { listConfirmedAppointments } from "./service.server";

const CAL = "qBIk8m8vqXzLKMgJEdsF";
const LOC = "ok2UHC2QMZsd8UHsAgEa";
const range = { from: "2026-09-18", to: "2026-09-20" };
const env = { GHL_API_KEY: "chave-ficticia", BIOREPORT_GHL_PROCEDURE_CALENDAR_ID: CAL };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function fakeFetch(handlers: {
  location?: unknown;
  events?: unknown;
  contact?: unknown;
  status?: number;
}) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (handlers.status) return json({ message: "erro" }, handlers.status);
    if (url.includes("/locations/"))
      return json(handlers.location ?? { location: { id: LOC, timezone: "America/Sao_Paulo" } });
    if (url.includes("/calendars/events")) return json(handlers.events ?? { events: [] });
    return json(
      handlers.contact ?? { contact: { id: "ctc-1", locationId: LOC, name: "Contato Fictício" } },
    );
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

function fakeDb(
  overrides: Record<string, { data?: unknown[]; error?: unknown; count?: number | null }> = {},
) {
  const used: string[] = [];
  const db = {
    from(table: string) {
      used.push(table);
      const result = overrides[table] ?? { data: [] };
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        limit: () =>
          Promise.resolve({ count: result.data?.length ?? null, error: null, ...result }),
      };
      return chain;
    },
  };
  return { db: db as never, used };
}

describe("leitura real de agendamentos (com fixtures)", () => {
  const confirmed = {
    events: [
      {
        id: "apt-1",
        calendarId: CAL,
        locationId: LOC,
        contactId: "ctc-1",
        startTime: "2026-09-18T15:00:00Z",
        appointmentStatus: "confirmed",
      },
    ],
  };

  it.each([
    { id: "outro", locationId: LOC, name: "Nome não autorizado" },
    { id: "ctc-1", locationId: "outra", name: "Nome não autorizado" },
    { id: "ctc-1", name: "Nome sem location" },
  ])("não aceita nomes com identidade ou clínica divergente", async (contact) => {
    const { fetcher } = fakeFetch({ events: confirmed, contact: { contact } });
    const result = await listConfirmedAppointments(fakeDb().db, range, { fetcher, env });
    expect(result.rows[0]!.patientName).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("detecta truncamento do banco em vez de declarar ausência de convite", async () => {
    const { fetcher } = fakeFetch({ events: confirmed });
    const result = await listConfirmedAppointments(
      fakeDb({ intake_invitations: { data: [], count: 1001 } }).db,
      range,
      { fetcher, env },
    );
    expect(result.rows[0]!.stage).toBe("indisponivel");
    expect(result.progressUnavailable).toBe(true);
  });

  it("deriva os próximos 30 dias pela data da clínica perto da meia-noite UTC", async () => {
    const { fetcher } = fakeFetch({});
    const result = await listConfirmedAppointments(fakeDb().db, undefined, {
      fetcher,
      env,
      now: Date.parse("2026-09-19T01:00:00Z"),
    });
    expect(result.range).toEqual({ from: "2026-09-18", to: "2026-10-17" });
  });

  it("rejeita fuso inválido mesmo sem eventos", async () => {
    const { fetcher, calls } = fakeFetch({
      location: { location: { id: LOC, timezone: "invalido" } },
    });
    await expect(
      listConfirmedAppointments(fakeDb().db, range, { fetcher, env }),
    ).rejects.toMatchObject({ code: "invalid_timezone" });
    expect(calls).toHaveLength(1);
  });

  it("cancela uma resposta grande antes de ler todo o corpo", async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const fetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            pull(controller) {
              pulls++;
              controller.enqueue(new Uint8Array(200_001));
            },
            cancel,
          }),
        ),
    ) as unknown as typeof fetch;
    await expect(
      listConfirmedAppointments(fakeDb().db, range, { fetcher, env }),
    ).rejects.toMatchObject({ code: "too_large" });
    expect(cancel).toHaveBeenCalledOnce();
    expect(pulls).toBeLessThanOrEqual(4);
  });

  it("rejeita período maior que 31 dias antes de qualquer chamada ao GHL", async () => {
    const { fetcher, calls } = fakeFetch({});
    await expect(
      listConfirmedAppointments(
        fakeDb().db,
        { from: "2026-09-01", to: "2026-10-15" },
        { fetcher, env },
      ),
    ).rejects.toBeInstanceOf(AppointmentsError);
    expect(calls).toHaveLength(0);
  });

  it("não chama o GHL sem calendário configurado", async () => {
    const { fetcher, calls } = fakeFetch({});
    await expect(
      listConfirmedAppointments(fakeDb().db, range, { fetcher, env: { GHL_API_KEY: "x" } }),
    ).rejects.toMatchObject({ code: "calendar_not_configured" });
    expect(calls).toHaveLength(0);
  });

  it("usa o calendário e a location configurados e pede janela em milissegundos", async () => {
    const { fetcher, calls } = fakeFetch({
      events: {
        events: [
          {
            id: "apt-1",
            calendarId: CAL,
            locationId: LOC,
            contactId: "ctc-1",
            startTime: "2026-09-18T15:00:00+00:00",
            appointmentStatus: "confirmed",
          },
        ],
      },
    });
    const result = await listConfirmedAppointments(fakeDb().db, range, {
      fetcher,
      env,
      now: Date.parse("2026-09-18T12:00:00Z"),
    });
    const eventsCall = calls.find((c) => c.includes("/calendars/events"))!;
    expect(eventsCall).toContain(`calendarId=${CAL}`);
    expect(eventsCall).toContain(`locationId=${LOC}`);
    expect(eventsCall).toMatch(/startTime=\d{13}/);
    expect(result.timezone).toBe("America/Sao_Paulo");
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.stage).toBe("sem_convite");
    expect(result.rows[0]!.patientName).toBe("Contato Fictício");
  });

  it("traduz credencial inválida do GHL em erro em português", async () => {
    const { fetcher } = fakeFetch({ status: 401 });
    await expect(
      listConfirmedAppointments(fakeDb().db, range, { fetcher, env }),
    ).rejects.toMatchObject({
      code: "ghl_credentials",
    });
  });

  it("falha do banco marca o progresso como indisponível, sem inventar 'sem anamnese'", async () => {
    const { fetcher } = fakeFetch({
      events: {
        events: [
          {
            id: "apt-1",
            calendarId: CAL,
            locationId: LOC,
            contactId: "ctc-1",
            startTime: "2026-09-18T15:00:00+00:00",
            appointmentStatus: "confirmed",
          },
        ],
      },
    });
    const { db } = fakeDb({ intake_invitations: { error: { code: "42501" } } });
    const result = await listConfirmedAppointments(db, range, { fetcher, env });
    expect(result.progressUnavailable).toBe(true);
    expect(result.rows[0]!.stage).toBe("indisponivel");
    expect(result.warnings.join(" ")).toMatch(/convites/);
  });
});
