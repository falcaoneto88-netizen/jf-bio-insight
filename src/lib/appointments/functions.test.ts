import { beforeEach, expect, it, vi } from "vitest";
import { IntakeError } from "@/lib/intake-invitations/schema";

const mocks = vi.hoisted(() => ({
  authorization: "Bearer ficticio" as string | null,
  admin: vi.fn(),
  db: vi.fn(() => ({ synthetic: true })),
  list: vi.fn(async () => ({ rows: [] })),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }),
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: { get: () => mocks.authorization } }),
}));
vi.mock("@/lib/intake-invitations/service.server", () => ({
  publicIntakeDb: mocks.db,
  assertIntakeAdmin: mocks.admin,
}));
vi.mock("./service.server", () => ({ listConfirmedAppointments: mocks.list }));
import { listarAgendamentosConfirmados } from "./functions";
const invoke = listarAgendamentosConfirmados as unknown as (input: {
  data: unknown;
}) => Promise<{ ok: boolean; code?: string }>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorization = "Bearer ficticio";
  mocks.admin.mockResolvedValue(undefined);
});
it("sem sessão não cria cliente nem lê dados", async () => {
  mocks.authorization = null;
  expect(await invoke({ data: {} })).toMatchObject({ ok: false, code: "unauthorized" });
  expect(mocks.db).not.toHaveBeenCalled();
  expect(mocks.list).not.toHaveBeenCalled();
});
it("não administrador não consulta agenda nem histórico", async () => {
  mocks.admin.mockRejectedValue(new IntakeError("forbidden", "Acesso restrito.", 403));
  expect(await invoke({ data: {} })).toMatchObject({ ok: false, code: "forbidden" });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("data inválida devolve erro tratável em português", async () => {
  expect(await invoke({ data: { from: "inválida", to: "2026-09-20" } })).toMatchObject({
    ok: false,
    code: "invalid_range",
  });
  expect(mocks.list).not.toHaveBeenCalled();
});
it("admin é validado antes da leitura e o padrão usa a clínica no servidor", async () => {
  expect(await invoke({ data: {} })).toMatchObject({ ok: true });
  expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.list.mock.invocationCallOrder[0]!,
  );
  expect(mocks.list).toHaveBeenCalledWith({ synthetic: true }, undefined);
});
