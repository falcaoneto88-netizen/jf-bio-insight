import test, { after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const directory = await mkdtemp(resolve("node_modules/.access-test-"));
const outfile = resolve(directory, "suite.mjs");
await build({
  stdin: {
    contents: "export * from './src/lib/access'; export * from './src/lib/report-history';",
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
      name: "fake-supabase",
      setup(builder) {
        builder.onResolve({ filter: /^@\/integrations\/supabase\/client$/ }, () => ({
          path: "supabase",
          namespace: "test",
        }));
        builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            "export const supabase = new Proxy({}, { get: (_, key) => globalThis.accessClient[key] });",
        }));
      },
    },
  ],
});
const api = await import(pathToFileURL(outfile));
after(async () => {
  delete globalThis.accessClient;
  await rm(directory, { recursive: true, force: true });
});
function client({
  session = true,
  role = true,
  userError = null,
  roleError = null,
  dbError = null,
} = {}) {
  const calls = [];
  const query = new Proxy(
    {},
    {
      get: (_, key) =>
        key === "then" ? (resolve) => resolve({ data: [], error: dbError }) : () => query,
    },
  );
  globalThis.accessClient = {
    auth: {
      getSession: async () => ({ data: { session: session ? {} : null }, error: null }),
      getUser: async () => ({
        data: { user: userError ? null : { id: "admin-id" } },
        error: userError,
      }),
    },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: role, error: roleError };
    },
    from: (name) => {
      calls.push(["from", name]);
      return query;
    },
  };
  return calls;
}
test("return URL accepts only application clinical pages", () => {
  for (const value of [
    "https://evil.test",
    "//evil.test",
    "/login",
    "/history?redirect=evil",
    undefined,
  ])
    assert.equal(api.safeReturnTo(value), "/history");
  assert.equal(api.safeReturnTo("/review"), "/review");
});
for (const [name, config, code] of [
  ["missing session", { session: false }, "guest"],
  ["expired session", { userError: { status: 401 } }, "expired"],
  ["non-admin", { role: false }, "forbidden"],
  ["unknown role", { role: null }, "forbidden"],
  ["offline verification", { userError: { status: 0 } }, "unavailable"],
  ["role lookup failure", { roleError: { code: "network" } }, "unavailable"],
]) {
  test(`${name}: history, save and delete cannot reach reports`, async () => {
    const calls = client(config);
    for (const action of [
      () => api.getReportHistory(),
      () => api.addReportToHistory({}),
      () => api.clearReportHistory(),
    ]) {
      await assert.rejects(
        action,
        (error) => error instanceof api.AccessError && error.code === code,
      );
    }
    assert.equal(
      calls.some(([name]) => name === "from"),
      false,
    );
  });
}
test("admin reads verify role before query and after query", async () => {
  const calls = client();
  assert.deepEqual(await api.getReportHistory(), []);
  assert.deepEqual(
    calls.map(([name]) => name),
    ["has_role", "from", "has_role"],
  );
  assert.deepEqual(calls[0][1], { _user_id: "admin-id", _role: "admin" });
});
test("RLS denial is explicit, never an empty history", async () => {
  client({ dbError: { code: "42501", message: "private provider detail" } });
  await assert.rejects(
    () => api.getReportHistory(),
    (error) => error.code === "forbidden" && !error.message.includes("private"),
  );
});
test("database failure is sanitized and not an empty history", async () => {
  client({ dbError: { code: "500", message: "private provider detail" } });
  await assert.rejects(
    () => api.getReportHistory(),
    (error) => /Tente novamente/.test(error.message) && !error.message.includes("private"),
  );
});
