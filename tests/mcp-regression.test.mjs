import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const directory = await mkdtemp(resolve("node_modules/.bioreport-test-"));
const outfile = resolve(directory, "suite.mjs");
await build({
  stdin: {
    contents: `
    export * from './src/lib/mcp/evolution';
    export * from './src/lib/ghl/client.server';
    export * from './src/lib/ghl/errors';
    export { default as list } from './src/lib/mcp/tools/list-reports';
    export { default as get } from './src/lib/mcp/tools/get-report';
    export { default as evolution } from './src/lib/mcp/tools/patient-evolution';
    export { default as find } from './src/lib/mcp/tools/ghl-find-contact';
    export { default as push } from './src/lib/mcp/tools/ghl-push-report';
  `,
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
      name: "fake-admin-gate",
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/supabase$/ }, () => ({
          path: "admin-gate",
          namespace: "test",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            "export const requireAdminClient = (...args) => globalThis.auditAdmin(...args);",
        }));
      },
    },
  ],
});
const api = await import(pathToFileURL(outfile));
after(async () => {
  delete globalThis.auditAdmin;
  await rm(directory, { recursive: true, force: true });
});
const row = (id, exam, generated, weight = "70", name = "Ana Silva") => ({
  id,
  patient_name: name,
  exam_date: exam,
  generated_at: generated,
  body_classification: "Teste",
  body_composition: { weight },
});
const a = row("a", "2026-01-01T12:00", "2026-03-01T12:00:00Z");
const b = row("b", "2026-02-01T12:00", "2026-02-01T12:00:00Z", "68");

test("evolução ordena pela data clínica e não pela geração", () => {
  const result = api.buildEvolution([a, b], "Ana Silva", 12);
  assert.equal(result.first.id, "a");
  assert.equal(result.last.id, "b");
  assert.equal(result.change.weight, -2);
});
test("regenerações do mesmo exame não produzem evolução fictícia", () => {
  const result = api.buildEvolution(
    [a, { ...a, id: "c", generated_at: "2026-04-01T00:00:00Z" }],
    "Ana Silva",
    12,
  );
  assert.equal(result.reports, 1);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.change, null);
  assert.equal(result.last.id, "c");
});
test("limite usa exames únicos mais recentes e informa truncamento", () => {
  const result = api.buildEvolution([a, b, row("c", "2026-03-01", "2026-03-01")], "Ana Silva", 2);
  assert.equal(result.first.id, "b");
  assert.equal(result.truncated, true);
  assert.equal(result.uniqueExams, 3);
});
test("recusa nomes ambíguos, parciais ou abreviados", () => {
  assert.throws(
    () => api.buildEvolution([a, { ...b, patient_name: "Ana Souza" }], "Ana", 12),
    /nomes diferentes/,
  );
  assert.throws(() => api.buildEvolution([a], "Ana", 12), /nomes diferentes/);
  assert.throws(
    () => api.buildEvolution([{ ...a, patient_name: "ANA..." }], "ANA...", 12),
    /abreviado/,
  );
  assert.equal(
    api.buildEvolution([{ ...a, patient_name: " ANA SILVA " }], "Ana Silva", 12).reports,
    1,
  );
});
test("recusa medições conflitantes na mesma data", () => {
  assert.throws(
    () =>
      api.buildEvolution(
        [a, { ...a, id: "b", body_composition: { weight: "90" } }],
        "Ana Silva",
        12,
      ),
    /medições diferentes/,
  );
});
test("datas inválidas são excluídas e ausência não se torna zero", () => {
  const result = api.buildEvolution(
    [a, { ...b, exam_date: "2026-02-30" }, { ...b, id: "c", exam_date: "" }],
    "Ana Silva",
    12,
  );
  assert.equal(result.excludedInvalidDates, 2);
  assert.equal(result.change, null);
  for (const value of ["", "—", "não informado", "1,2,3", "1.234,5", null, Infinity])
    assert.equal(api.metricNumber(value), null);
  assert.equal(api.metricNumber("70,2 kg"), 70.2);
  assert.equal(api.metricNumber("0"), 0);
});
test("filtros escapam curingas e barras de LIKE", () =>
  assert.equal(api.escapeLike("Ana_%\\"), "Ana\\_\\%\\\\"));
test("Zod rejeita UUID, data, limites e contactos inválidos", () => {
  const invalid = [
    [api.get, { id: "" }],
    [api.get, { id: "x" }],
    [api.list, { limit: 0 }],
    [api.list, { limit: 101 }],
    [api.list, { generatedAfter: "2026-02-30" }],
    [api.evolution, { patientName: "A" }],
    [api.evolution, { patientName: "Ana", limit: 1 }],
    [api.find, { query: "a" }],
    [api.find, { query: "a".repeat(255) }],
    [api.find, { query: "Ana", limit: 26 }],
    [api.push, { reportId: "00000000-0000-4000-8000-000000000001", confirm: false }],
    [
      api.push,
      { reportId: "00000000-0000-4000-8000-000000000001", confirm: true, email: "errado" },
    ],
    [api.push, { reportId: "00000000-0000-4000-8000-000000000001", confirm: true, phone: "999" }],
    [api.push, { reportId: "00000000-0000-4000-8000-000000000001", confirm: true, contactId: "" }],
  ];
  for (const [tool, input] of invalid)
    assert.equal(z.object(tool.inputSchema).safeParse(input).success, false, tool.name);
});
function queryResult(result) {
  const calls = [];
  const query = { then: (ok, bad) => Promise.resolve(result).then(ok, bad) };
  for (const method of ["select", "ilike", "order", "limit", "gte", "lte", "lt"])
    query[method] = (...args) => {
      calls.push([method, ...args]);
      return query;
    };
  globalThis.auditAdmin = async () => ({ ok: true, supabase: { from: () => query } });
  return calls;
}
test("as cinco ferramentas recusam acesso antes de queries/HTTP", async () => {
  globalThis.auditAdmin = async () => ({ ok: false, message: "Acesso restrito." });
  for (const tool of [api.list, api.get, api.evolution, api.find, api.push]) {
    const result = await tool.handler({}, {});
    assert.equal(result.isError, true);
    assert.equal(result.content[0].text, "Acesso restrito.");
  }
});
test("push sem confirmação não consulta nem escreve, mesmo chamado diretamente", async () => {
  globalThis.auditAdmin = async () => ({
    ok: true,
    supabase: { from: () => assert.fail("query sem confirmação") },
  });
  const result = await api.push.handler({ confirm: false }, {});
  assert.equal(result.isError, true);
});
test("intervalo invertido é rejeitado antes de consultar relatórios", async () => {
  globalThis.auditAdmin = async () => ({
    ok: true,
    supabase: { from: () => assert.fail("query com intervalo inválido") },
  });
  const result = await api.list.handler(
    { generatedAfter: "2026-03-01", generatedBefore: "2026-01-01" },
    {},
  );
  assert.equal(result.isError, true);
});
test("list distingue limite exato de truncamento e escapa nome", async () => {
  let calls = queryResult({ data: [a, b], error: null });
  let result = await api.list.handler({ limit: 2, patientName: "Ana_%" }, {});
  assert.equal(result.structuredContent.truncated, false);
  assert.deepEqual(
    calls.find((x) => x[0] === "ilike"),
    ["ilike", "patient_name", "%Ana\\_\\%%"],
  );
  queryResult({ data: [a, b, a], error: null });
  result = await api.list.handler({ limit: 2 }, {});
  assert.equal(result.structuredContent.truncated, true);
  assert.equal(result.structuredContent.reports.length, 2);
});
test("evolução recusa conjuntos incompletos, inclusive limite do servidor", async () => {
  queryResult({ data: [a], count: 2, error: null });
  const result = await api.evolution.handler({ patientName: "Ana Silva" }, {});
  assert.equal(result.isError, true);
});
test("erros GHL nunca devolvem nem registam conteúdo do fornecedor", async () => {
  const originalFetch = globalThis.fetch,
    originalLog = console.error;
  const originalKey = process.env.GHL_API_KEY,
    originalLocation = process.env.GHL_LOCATION_ID;
  process.env.GHL_API_KEY = "dummy-key";
  process.env.GHL_LOCATION_ID = "dummy-location";
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    globalThis.fetch = async () => new Response("sensitive-provider-content", { status: 401 });
    await assert.rejects(
      () => api.searchGhlContacts("fictício"),
      (e) => e instanceof api.GhlError && !e.message.includes("sensitive"),
    );
    assert.equal(JSON.stringify(logs).includes("sensitive"), false);
    assert.equal(JSON.stringify(logs).includes("dummy"), false);
    globalThis.fetch = async () => {
      throw new Error("sensitive-network-content");
    };
    await assert.rejects(
      () => api.searchGhlContacts("fictício"),
      (e) => e instanceof api.GhlError && !e.message.includes("sensitive"),
    );
    globalThis.fetch = async () => new Response("invalid-sensitive-json", { status: 200 });
    await assert.rejects(
      () => api.searchGhlContacts("fictício"),
      (e) => e instanceof api.GhlError && !e.message.includes("sensitive"),
    );
    globalThis.fetch = async () => Response.json(null);
    await assert.rejects(
      () => api.searchGhlContacts("fictício"),
      (e) => e instanceof api.GhlError,
    );
    assert.equal(api.ghlErrorMessage(new Error("sensitive")).includes("sensitive"), false);
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalLog;
    if (originalKey === undefined) delete process.env.GHL_API_KEY;
    else process.env.GHL_API_KEY = originalKey;
    if (originalLocation === undefined) delete process.env.GHL_LOCATION_ID;
    else process.env.GHL_LOCATION_ID = originalLocation;
  }
});

test("filtro final inclui todo o dia usando fronteira exclusiva", async () => {
  const calls = queryResult({ data: [], error: null });
  await api.list.handler({ generatedBefore: "2026-02-28" }, {});
  assert.deepEqual(
    calls.find((x) => x[0] === "lt"),
    ["lt", "generated_at", "2026-03-01T00:00:00.000Z"],
  );
});

test("datas equivalentes com offset agrupam o mesmo exame", () => {
  const result = api.buildEvolution(
    [a, { ...a, id: "z", exam_date: "2026-01-01T09:00:00-03:00" }],
    "Ana Silva",
    12,
  );
  assert.equal(result.reports, 1);
  assert.equal(result.duplicatesRemoved, 1);
});

test("métricas ausentes continuam null nas variações", () => {
  const result = api.buildEvolution(
    [{ ...a, body_composition: { weight: "" } }, b],
    "Ana Silva",
    12,
  );
  assert.equal(result.comparable, true);
  assert.equal(result.change.weight, null);
});
