import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const dir = await mkdtemp(resolve("node_modules/.jornada-events-test-"));
const outfile = resolve(dir, "suite.mjs");
await build({
  stdin: {
    contents: `export * from './src/lib/jornada-events/core'; export * from './src/lib/jornada-events/client.server'; export { default as tool } from './src/lib/mcp/tools/jornada-sync-consultation'; export { default as preview } from './src/lib/mcp/tools/jornada-preview-consultation';`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  plugins: [
    {
      name: "admin",
      setup(b) {
        b.onResolve({ filter: /^\.\.\/supabase$/ }, () => ({ path: "admin", namespace: "test" }));
        b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents: "export const requireAdminClient = () => globalThis.eventTestAccess();",
        }));
      },
    },
  ],
});
const api = await import(pathToFileURL(outfile));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  consultationId: uuid(1),
  recordId: uuid(2),
  eventType: "anamnese_recebida",
  ghlContactId: "synthetic_contact",
  confirm: true,
};
const source = {
  consultationId: uuid(1),
  patientId: uuid(3),
  recordId: uuid(2),
  occurredAt: "2026-01-01T10:00:00Z",
};
const config = { organizationId: uuid(4), locationId: "synthetic_location", keyId: "test_v1" };
const envNames = [
  "BIOREPORT_JORNADA_SIGNING_SECRET",
  "JORNADA_AI_ORGANIZATION_ID",
  "GHL_LOCATION_ID",
  "BIOREPORT_JORNADA_KEY_ID",
];
const oldEnv = envNames.map((k) => process.env[k]);
const originalFetch = globalThis.fetch;
beforeEach(() => {
  process.env.BIOREPORT_JORNADA_SIGNING_SECRET = "a".repeat(64);
  process.env.JORNADA_AI_ORGANIZATION_ID = config.organizationId;
  process.env.GHL_LOCATION_ID = config.locationId;
  process.env.BIOREPORT_JORNADA_KEY_ID = config.keyId;
  globalThis.fetch = async () => {
    throw new Error("unexpected network");
  };
});
after(async () => {
  globalThis.fetch = originalFetch;
  delete globalThis.eventTestAccess;
  envNames.forEach((k, i) =>
    oldEnv[i] === undefined ? delete process.env[k] : (process.env[k] = oldEnv[i]),
  );
  await rm(dir, { recursive: true, force: true });
});
test("recusa ausência de confirmação, IDs inválidos e conteúdo clínico extra", () => {
  for (const invalid of [
    { ...input, confirm: false },
    { ...input, recordId: "x" },
    { ...input, ghlContactId: "../contacts" },
    { ...input, answers: {} },
  ])
    assert.equal(api.syncInput.safeParse(invalid).success, false);
});
test("evento contém somente IDs e estado, com chave estável entre repetições", () => {
  const a = api.buildEvent(input, source, config),
    b = api.buildEvent(input, source, config, Date.now() + 1000);
  assert.equal(a.event_id, b.event_id);
  assert.equal(Object.keys(a).length, 14);
  assert.equal(a.patient_id, source.patientId);
  assert.throws(
    () => api.buildEvent(input, { ...source, consultationId: uuid(90) }, config),
    /não pertence/,
  );
  assert.throws(() => api.buildEvent(input, { ...source, occurredAt: "invalid" }, config), /Data/);
});
test("bloqueia antes de consultar dados quando não autorizado", async () => {
  globalThis.eventTestAccess = () => ({ ok: false, message: "Acesso restrito" });
  assert.equal((await api.tool.handler(input, {})).isError, true);
});
test("bloqueia confirmação falsa antes de consultar a consulta", async () => {
  globalThis.eventTestAccess = () => ({
    ok: true,
    supabase: {
      from() {
        assert.fail("query proibida");
      },
    },
  });
  assert.equal((await api.tool.handler({ ...input, confirm: false }, {})).isError, true);
});
function database(record) {
  return {
    from(table) {
      const chain = {
        select(columns) {
          assert.doesNotMatch(columns, /answers|body_composition|content|name/);
          return chain;
        },
        eq() {
          return chain;
        },
        async maybeSingle() {
          return {
            data: table === "consultations" ? { id: uuid(1), patient_id: uuid(3) } : record,
            error: null,
          };
        },
      };
      return chain;
    },
  };
}
test("não envia registro inexistente ou anamnese não confirmada", async () => {
  for (const record of [null, { id: uuid(2), accepted: false }]) {
    globalThis.eventTestAccess = () => ({ ok: true, supabase: database(record) });
    assert.equal((await api.tool.handler(input, {})).isError, true);
  }
});
test("assina no servidor e nunca devolve assinatura ou segredo", async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://jornada-ai-conecta.lovable.app/api/public/bioreport-event");
    assert.equal(init.redirect, "error");
    assert.equal(
      init.headers["x-bioreport-signature"],
      createHmac("sha256", "a".repeat(64)).update(init.body).digest("hex"),
    );
    const body = JSON.parse(init.body);
    assert.equal(Object.keys(body).length, 14);
    return Response.json({
      status: "received",
      event_id: body.event_id,
      contact_id: uuid(5),
      messages_sent: 0,
    });
  };
  const r = await api.sendJornadaEvent(input, source);
  assert.equal(r.status, "received");
  assert.doesNotMatch(JSON.stringify(r), /signature|secret/);
});
test("erros HTTP não expõem corpo do provedor", async () => {
  for (const status of [401, 409, 500]) {
    globalThis.fetch = async () => new Response("provider-secret-and-patient-data", { status });
    await assert.rejects(
      api.sendJornadaEvent(input, source),
      (e) => !e.message.includes("provider-secret"),
    );
  }
});
test("recusa resposta para outro evento e configuração ausente", async () => {
  globalThis.fetch = async () =>
    Response.json({ status: "received", event_id: "other", contact_id: uuid(5), messages_sent: 0 });
  await assert.rejects(api.sendJornadaEvent(input, source), /evento solicitado/);
  delete process.env.BIOREPORT_JORNADA_SIGNING_SECRET;
  await assert.rejects(api.sendJornadaEvent(input, source), /não configurada/);
});

test("preview bloqueia acesso sem permissão", async () => {
  globalThis.eventTestAccess = () => ({ ok: false, message: "Acesso restrito" });
  assert.equal(
    (await api.preview.handler({ consultationId: input.consultationId }, {})).isError,
    true,
  );
});
test("preview retorna IDs limitados sem respostas clínicas", async () => {
  const db = {
    from(table) {
      const chain = {
        select(columns) {
          assert.doesNotMatch(columns, /answers|body_composition|clinical_data/);
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        async maybeSingle() {
          return {
            data: {
              id: input.consultationId,
              patient_id: source.patientId,
              patient_name: "Paciente Sintético",
            },
            error: null,
          };
        },
        async limit(n) {
          assert.equal(n, 11);
          return {
            data: Array.from({ length: 11 }, (_, i) => ({ id: uuid(100 + i) })),
            error: null,
          };
        },
      };
      return chain;
    },
  };
  globalThis.eventTestAccess = () => ({ ok: true, supabase: db });
  const result = await api.preview.handler({ consultationId: input.consultationId }, {});
  assert.equal(result.structuredContent.anamneses.length, 10);
  assert.equal(result.structuredContent.truncated, true);
});
