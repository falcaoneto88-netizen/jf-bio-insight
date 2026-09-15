import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appointmentContext as readAppointmentContext,
  issueInvitation,
  patientInvitation,
  assertIntakeAdmin,
  configureIntake,
  readBoundedJson,
  intakeHttp,
} from "./service.server";
import { INTAKE_LOCATION_ID, INTAKE_WORKFLOW_ID } from "./schema";
import { anamnesisSchema, emptyAnamnesis } from "@/lib/anamnesis/form";
const token = "a".repeat(64),
  calendarId = "calendar_test_01",
  cid = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const input = {
  location_id: INTAKE_LOCATION_ID,
  workflow_id: INTAKE_WORKFLOW_ID,
  contact_id: "contact_test_01",
  appointment_id: "appointment_test_01",
} as const;
const contact = {
  contact: {
    id: input.contact_id,
    locationId: input.location_id,
    firstName: "Paciente",
    lastName: "Teste",
    email: "ficticio@example.test",
  },
};
const event = {
  event: {
    id: input.appointment_id,
    contactId: input.contact_id,
    locationId: input.location_id,
    appointmentStatus: "confirmed",
    calendarId,
    startTime: "2026-09-14T23:30:00Z",
  },
};
const location = { location: { id: input.location_id, timezone: "Europe/Lisbon" } };
const appointmentContext = (c: unknown, e: unknown, l: unknown, i: typeof input) =>
  readAppointmentContext(c, e, l, i, calendarId);
const answers = () => ({
  ...emptyAnamnesis(),
  patientName: "Paciente Teste",
  age: "35",
  consultationDate: "2026-09-15",
  wakeTime: "07:00",
  sleepTime: "23:00",
  hasChildren: "Não",
  hasConditions: "Não",
  takesMedication: "Não",
  hasDrugAllergies: "Não sei",
  hasFoodAllergies: "Não",
  trains: "Sim",
  trainingFrequency: "3",
  trainingType: "Natação",
  waterLiters: "2,5",
  drinksAlcohol: "Não",
  smokes: "Não",
  sleepQuality: "Bom",
  takesSupplements: "Não",
  mainComplaint: "Exemplo fictício",
  treatmentGoal: "Objetivo fictício",
});
const env = {
  BIOREPORT_GHL_INTAKE_SECRET: token,
  GHL_API_KEY: "test-placeholder",
  BIOREPORT_GHL_PROCEDURE_CALENDAR_ID: calendarId,
};
function db(status = "pending") {
  const rpc = vi.fn(async () => ({
    error: null,
    data: { status, consultation_id: cid, expires_at: "2026-09-16T00:00:00Z" },
  }));
  return { rpc, client: { rpc } as unknown as SupabaseClient };
}
function fetcher(appointmentResponse: unknown = { appointment: event.event }) {
  return vi.fn<typeof fetch>(async (url, init) => {
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("manual");
    return Response.json(
      String(url).includes("/appointments/")
        ? appointmentResponse
        : String(url).includes("/contacts/")
          ? contact
          : location,
    );
  });
}
describe("GHL invitation issuance", () => {
  it("requires a calendar before administrator activation", async () => {
    vi.stubEnv("BIOREPORT_GHL_PROCEDURE_CALENDAR_ID", "");
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    const client = {
      auth: { getUser: async () => ({ data: { user: { id: cid } }, error: null }) },
      rpc,
    } as unknown as SupabaseClient;
    await expect(configureIntake(client, true)).rejects.toMatchObject({
      code: "calendar_not_configured",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: cid, _role: "admin" });
    await expect(configureIntake(client, false)).resolves.toEqual({ enabled: false });
  });
  it("checks the private key before reading a contact or creating a consultation", async () => {
    const d = db(),
      f = fetcher();
    await expect(issueInvitation(input, "b".repeat(64), d.client, f, env)).rejects.toMatchObject({
      status: 401,
    });
    expect(f).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("fails closed without configuration", async () => {
    const d = db(),
      f = fetcher();
    await expect(issueInvitation(input, token, d.client, f, {})).rejects.toMatchObject({
      code: "not_configured",
    });
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects other workflows, locations and client-supplied clinical data", async () => {
    for (const value of [
      { ...input, workflow_id: cid },
      { ...input, location_id: "other_location" },
      { ...input, answers: {} },
    ]) {
      const d = db(),
        f = fetcher();
      await expect(issueInvitation(value, token, d.client, f, env)).rejects.toMatchObject({
        code: "invalid_request",
      });
      expect(f).not.toHaveBeenCalled();
    }
  });
  it("verifies appointment ownership and uses the clinic timezone", () => {
    expect(appointmentContext(contact, event, location, input).date).toBe("2026-09-15");
    expect(() =>
      appointmentContext(
        contact,
        { event: { ...event.event, contactId: "another_contact" } },
        location,
        input,
      ),
    ).toThrow(/não coincidem/);
    expect(() =>
      appointmentContext(
        contact,
        { event: { ...event.event, appointmentStatus: "cancelled" } },
        location,
        input,
      ),
    ).toThrow(/precisa estar confirmado/);
  });
  it("does not guess missing appointment or location identity", () => {
    expect(() =>
      appointmentContext(
        contact,
        { event: { ...event.event, locationId: undefined } },
        location,
        input,
      ),
    ).toThrow(/incompletos/);
    expect(() =>
      appointmentContext(
        contact,
        event,
        { location: { ...location.location, timezone: "Bad/Timezone" } },
        input,
      ),
    ).toThrow(/fuso/);
  });
  it("allows a contact without email and rejects an incomplete name before issuing", () => {
    expect(
      appointmentContext({ contact: { ...contact.contact, email: "" } }, event, location, input)
        .email,
    ).toBe("");
    expect(() =>
      appointmentContext({ contact: { ...contact.contact, lastName: "" } }, event, location, input),
    ).toThrow(/nome completo/);
  });
  it("returns the same link for a retry and only passes a token digest to storage", async () => {
    const d = db(),
      f = fetcher();
    const a = await issueInvitation(input, token, d.client, f, env),
      b = await issueInvitation(input, token, d.client, f, env);
    expect(a.anamnese_url).toBe(b.anamnese_url);
    expect(a.anamnese_url).toMatch(
      /^https:\/\/jf-bio-insight\.lovable\.app\/anamnese#convite=[a-f0-9]{64}$/,
    );
    const args = d.rpc.mock.calls[0] as unknown as [string, Record<string, string>];
    expect(args[1]._token_hash).not.toBe(a.anamnese_url?.split("=")[1]);
    expect(args[1]._consultation_date).toBe("2026-09-15");
  });
  it("suppresses another send after the form was received", async () => {
    const result = await issueInvitation(input, token, db("submitted").client, fetcher(), env);
    expect(result).toMatchObject({ can_send: false, anamnese_url: null, status: "submitted" });
  });
  it("requires the procedure calendar configuration before reading any GHL data", async () => {
    const d = db(),
      f = fetcher();
    await expect(
      issueInvitation(input, token, d.client, f, {
        ...env,
        BIOREPORT_GHL_PROCEDURE_CALENDAR_ID: undefined,
      }),
    ).rejects.toMatchObject({ code: "calendar_not_configured" });
    expect(f).not.toHaveBeenCalled();
    expect(d.rpc).not.toHaveBeenCalled();
  });
  describe.each(["appointment", "event"])("GHL %s envelope", (envelope) => {
    it("issues an invitation with the verified identity and clinic date", async () => {
      const d = db();
      const result = await issueInvitation(
        input,
        token,
        d.client,
        fetcher({ [envelope]: event.event }),
        env,
      );
      expect(result).toMatchObject({
        can_proceed: true,
        can_send: true,
        consultation_id: cid,
        appointment_id: input.appointment_id,
        appointment_start: "2026-09-14T23:30:00.000Z",
        appointment_timezone: "Europe/Lisbon",
        consultation_date: "2026-09-15",
      });
      expect(d.rpc).toHaveBeenCalledTimes(1);
    });
    it.each([
      [{ appointmentStatus: "new" }, "appointment_not_confirmed"],
      [{ appointmentStatus: "cancelled" }, "appointment_not_confirmed"],
      [{ appointmentStatus: "noshow" }, "appointment_not_confirmed"],
      [{ calendarId: "initial_consultation" }, "calendar_mismatch"],
      [{ calendarId: undefined }, "ghl_invalid"],
      [{ startTime: "2026-09-14T12:00:00Z" }, "appointment_out_of_range"],
      [{ startTime: "2026-09-13T12:00:00Z" }, "appointment_out_of_range"],
      [{ startTime: "2028-09-14T12:00:00Z" }, "appointment_out_of_range"],
      [{ startTime: "2026-09-15" }, "ghl_invalid"],
      [{ startTime: "2026-09-15T10:00:00" }, "ghl_invalid"],
      [{ contactId: "another_contact" }, "identity_mismatch"],
      [{ id: "another_appointment" }, "identity_mismatch"],
      [{ locationId: "another_location" }, "identity_mismatch"],
      [{ locationId: undefined }, "ghl_invalid"],
    ])("blocks invalid procedure %j before creating a consultation", async (change, code) => {
      const d = db();
      await expect(
        issueInvitation(
          input,
          token,
          d.client,
          fetcher({ [envelope]: { ...event.event, ...change } }),
          env,
        ),
      ).rejects.toMatchObject({ code });
      expect(d.rpc).not.toHaveBeenCalled();
    });
  });
  it.each([
    ["missing envelope", {}],
    ["malformed appointment", { appointment: {} }],
    ["malformed event", { event: {} }],
    ["two valid envelopes", { appointment: event.event, event: event.event }],
    ["invalid appointment with valid event", { appointment: {}, event: event.event }],
    ["invalid event with valid appointment", { appointment: event.event, event: {} }],
  ])("rejects %s without guessing which appointment to use", async (_name, response) => {
    const d = db();
    await expect(
      issueInvitation(input, token, d.client, fetcher(response), env),
    ).rejects.toMatchObject({ code: "ghl_invalid", status: 502 });
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it.each([301, 302, 303, 307, 308])(
    "rejects HTTP %i without following the redirect",
    async (status) => {
      const d = db();
      const f = vi.fn<typeof fetch>(
        async () =>
          new Response("private-upstream-body", {
            status,
            headers: { Location: "https://untrusted.example.test/redirect" },
          }),
      );
      await expect(issueInvitation(input, token, d.client, f, env)).rejects.toMatchObject({
        code: "ghl_unavailable",
        status: 502,
        message: "Contato ou agendamento indisponível no GHL.",
      });
      expect(d.rpc).not.toHaveBeenCalled();
      expect(f.mock.calls.map(([url]) => url).sort()).toEqual(
        [
          `https://services.leadconnectorhq.com/contacts/${input.contact_id}`,
          `https://services.leadconnectorhq.com/calendars/events/appointments/${input.appointment_id}`,
          `https://services.leadconnectorhq.com/locations/${input.location_id}`,
        ].sort(),
      );
      for (const [, init] of f.mock.calls) {
        expect(init).toMatchObject({ method: "GET", redirect: "manual" });
      }
    },
  );
  it("returns a linked consultation and authoritative date only after storage succeeds", async () => {
    const result = await issueInvitation(input, token, db().client, fetcher(), env);
    expect(result).toMatchObject({
      can_proceed: true,
      consultation_id: cid,
      appointment_id: input.appointment_id,
      appointment_start: "2026-09-14T23:30:00.000Z",
      appointment_timezone: "Europe/Lisbon",
      consultation_date: "2026-09-15",
    });
    const invalid = { rpc: vi.fn(async () => ({ data: { status: "pending" }, error: null })) };
    await expect(
      issueInvitation(input, token, invalid as unknown as SupabaseClient, fetcher(), env),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("blocks continuation on database linkage conflicts without leaking details", async () => {
    const invalid = {
      rpc: vi.fn(async () => ({ data: null, error: { code: "P0003", message: "private detail" } })),
    };
    await expect(
      issueInvitation(input, token, invalid as unknown as SupabaseClient, fetcher(), env),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });
  it("returns explicit negative flags on HTTP validation failures", async () => {
    const response = await intakeHttp(
      new Request("https://example.test/", { method: "POST", body: "{}" }),
      "issue",
    );
    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      can_proceed: false,
      can_send: false,
      anamnese_url: null,
    });
  });
  it("does not return upstream bodies, credentials or raw errors", async () => {
    const f = vi.fn<typeof fetch>(
      async () => new Response("private-upstream-body", { status: 401 }),
    );
    await expect(issueInvitation(input, token, db().client, f, env)).rejects.toThrow(/credencial/);
    await expect(issueInvitation(input, token, db().client, f, env)).rejects.not.toThrow(
      /private-upstream/,
    );
  });
});
describe("public patient API", () => {
  it("requires complete valid answers and explicit confirmation before storage", async () => {
    const d = db();
    for (const body of [
      {
        action: "submit",
        token,
        id: cid,
        answers: answers(),
        name: "Paciente Teste",
        accepted: false,
      },
      { action: "submit", token, id: cid, answers: {}, name: "Paciente Teste", accepted: true },
      { action: "resolve", token, consultation_id: cid },
    ])
      await expect(patientInvitation(body, d.client, token)).rejects.toMatchObject({
        code: "invalid_request",
      });
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("clears hidden conditional values and returns only the receipt", async () => {
    const rpc = vi.fn(async () => ({
      error: null,
      data: { confirmed_at: "2026-09-14T13:00:00Z" },
    }));
    const result = await patientInvitation(
      {
        action: "submit",
        token,
        id: cid,
        answers: { ...answers(), medications: "Hidden answer" },
        name: "Paciente Teste",
        accepted: true,
      },
      { rpc } as unknown as SupabaseClient,
      token,
    );
    expect(result).toEqual({ confirmed_at: "2026-09-14T13:00:00Z" });
    const args = rpc.mock.calls[0] as unknown as [string, { _answers: Record<string, string> }];
    expect(args[1]._answers).not.toHaveProperty("medications");
    await patientInvitation(
      {
        action: "submit",
        token,
        id: cid,
        answers: anamnesisSchema.parse(answers()),
        name: "Paciente Teste",
        accepted: true,
      },
      { rpc } as unknown as SupabaseClient,
      token,
    );
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("maps expiry/revocation without revealing which invitation exists", async () => {
    const client = {
      rpc: async () => ({ error: { code: "42501", message: "raw-db-private" }, data: null }),
    } as unknown as SupabaseClient;
    await expect(patientInvitation({ action: "resolve", token }, client, token)).rejects.toThrow(
      /indisponível/,
    );
  });
  it("refuses cross-origin and non-JSON requests before calling the database", async () => {
    const foreign = await intakeHttp(
      new Request("https://example.test/api/public/anamnese-convite", {
        method: "POST",
        headers: { Origin: "https://other.test", "Content-Type": "application/json" },
        body: "{}",
      }),
      "patient",
    );
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(foreign.headers.get("Cache-Control")).toContain("no-store");
    const wrongType = await intakeHttp(
      new Request("https://example.test/", { method: "POST", body: "{}" }),
      "patient",
    );
    expect(wrongType.status).toBe(415);
  });
  it("bounds request bodies", async () => {
    await expect(readBoundedJson(new Response("x".repeat(1001)), 1000)).rejects.toMatchObject({
      status: 413,
    });
  });
  it("prevents non-admin activation and distinguishes expired sessions", async () => {
    const rpc = vi.fn(async () => ({ data: false, error: null }));
    const auth = { getUser: async () => ({ data: { user: { id: cid } }, error: null }) };
    await expect(
      assertIntakeAdmin({ auth, rpc } as unknown as SupabaseClient),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      assertIntakeAdmin({
        auth: { getUser: async () => ({ data: { user: null }, error: null }) },
        rpc,
      } as unknown as SupabaseClient),
    ).rejects.toMatchObject({ status: 401 });
  });
});
