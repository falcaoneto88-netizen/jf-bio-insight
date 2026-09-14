import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { IntakeError, intakeDatabaseError } from "./schema";

async function withAdmin<T>(
  action: (db: import("@supabase/supabase-js").SupabaseClient) => Promise<T>,
) {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { publicIntakeDb, assertIntakeAdmin } = await import("./service.server");
    const authorization = getRequest().headers.get("authorization");
    if (!authorization || !/^Bearer \S+$/.test(authorization))
      throw new IntakeError("unauthorized", "Sua sessão expirou. Entre novamente.");
    const db = publicIntakeDb(authorization);
    await assertIntakeAdmin(db);
    return { ok: true as const, data: await action(db) };
  } catch (e) {
    return {
      ok: false as const,
      message:
        e instanceof IntakeError
          ? e.message
          : "Não foi possível concluir a configuração. Tente novamente.",
    };
  }
}
export const loadIntakeSettings = createServerFn({ method: "POST" }).handler(async () =>
  withAdmin(async (db) => {
    const { getIntakeSettings } = await import("./service.server");
    return getIntakeSettings(db);
  }),
);
export const changeIntakeSettings = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.strictObject({ enabled: z.boolean(), confirm: z.literal(true) }).parse(data),
  )
  .handler(async ({ data }) =>
    withAdmin(async (db) => {
      const { configureIntake } = await import("./service.server");
      return configureIntake(db, data.enabled);
    }),
  );
export const revokeIntakeLink = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.strictObject({ consultationId: z.uuid(), confirm: z.literal(true) }).parse(data),
  )
  .handler(async ({ data }) =>
    withAdmin(async (db) => {
      const r = await db.rpc("revoke_intake_invitation", { _consultation_id: data.consultationId });
      if (r.error) throw intakeDatabaseError(r.error);
      return { revoked: true };
    }),
  );
