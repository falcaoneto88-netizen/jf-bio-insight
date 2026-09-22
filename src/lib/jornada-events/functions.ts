import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { IntakeError } from "@/lib/intake-invitations/schema";

/**
 * Controles administrativos do aviso automático ao Jornada AI.
 * Toda chamada exige administrador autenticado; nenhum segredo sai do servidor.
 */

export type EventSettings = {
  enabled: boolean;
  activatedAt: string | null;
  /** Marca d'água: preservada ao pausar e reativar. */
  firstActivatedAt: string | null;
  reconciledAt: string | null;
  /** A verificação periódica está efetivamente ligada no servidor. */
  jobActive: boolean;
  /** A configuração do servidor (recebimento e clínica) corresponde. */
  configOk: boolean;
  /** A chave de prova da reserva já foi preparada no servidor. */
  keyReady: boolean;
  pending: number;
  blocked: number;
  exhausted: number;
  sent: number;
  /** Confirmações elegíveis que ainda não entraram na fila. */
  missing: number;
};
export type EventsResponse<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

const settingsSchema = z.object({
  enabled: z.boolean(),
  activated_at: z.string().nullable(),
  first_activated_at: z.string().nullable(),
  reconciled_at: z.string().nullable(),
  location_id: z.string(),
  job_active: z.boolean(),
  key_ready: z.boolean(),
  config_ok: z.boolean(),
  pending: z.number(),
  blocked: z.number(),
  exhausted: z.number(),
  sent: z.number(),
  missing: z.number(),
});

async function adminDb() {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { publicIntakeDb, assertIntakeAdmin } =
    await import("@/lib/intake-invitations/service.server");
  const authorization = getRequest().headers.get("authorization");
  if (!authorization || !/^Bearer \S+$/.test(authorization))
    throw new IntakeError("unauthorized", "Sua sessão expirou. Entre novamente.", 401);
  const db = publicIntakeDb(authorization);
  await assertIntakeAdmin(db);
  return db;
}

function failure(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof IntakeError) return { ok: false, code: error.code, message: error.message };
  return {
    ok: false,
    code: "unavailable",
    message: "Não foi possível concluir a operação. Tente novamente.",
  };
}

function toSettings(raw: unknown): EventSettings {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success)
    throw new IntakeError("invalid_response", "Não foi possível ler a configuração do aviso.", 503);
  return {
    enabled: parsed.data.enabled,
    activatedAt: parsed.data.activated_at,
    firstActivatedAt: parsed.data.first_activated_at,
    reconciledAt: parsed.data.reconciled_at,
    jobActive: parsed.data.job_active,
    keyReady: parsed.data.key_ready,
    configOk: parsed.data.config_ok,
    pending: parsed.data.pending,
    blocked: parsed.data.blocked,
    exhausted: parsed.data.exhausted,
    sent: parsed.data.sent,
    missing: parsed.data.missing,
  };
}

/** Situação atual do aviso automático. */
export const obterAvisoJornada = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data)
  .handler(async (): Promise<EventsResponse<EventSettings>> => {
    try {
      const db = await adminDb();
      const r = await db.rpc("jornada_outbox_settings");
      if (r.error)
        throw new IntakeError("db", "Não foi possível ler a configuração do aviso.", 503);
      return { ok: true, data: toSettings(r.data) };
    } catch (error) {
      return failure(error);
    }
  });

/**
 * Prepara no banco a chave de prova da reserva, derivada do segredo de
 * assinatura já configurado. O segredo e a chave derivada nunca são devolvidos.
 */
async function prepararChaveProva(db: Awaited<ReturnType<typeof adminDb>>) {
  const secret = process.env["BIOREPORT_JORNADA_SIGNING_SECRET"] ?? "";
  if (!secret)
    throw new IntakeError("not_configured", "O envio ao Jornada AI ainda não está configurado.", 503);
  const { deriveClaimKey } = await import("./outbox.server");
  const r = await db.rpc("jornada_outbox_provision_claim_key", { _key: await deriveClaimKey(secret) });
  if (r.error) throw new IntakeError("db", "Não foi possível preparar o aviso automático.", 503);
}

/** Ativa ou pausa o aviso automático. A ativação vale só para novas confirmações. */
export const configurarAvisoJornada = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.strictObject({ enabled: z.boolean(), confirm: z.literal(true) }).parse(data),
  )
  .handler(async ({ data }): Promise<EventsResponse<EventSettings>> => {
    try {
      const db = await adminDb();
      if (data.enabled) await prepararChaveProva(db);
      const r = await db.rpc("jornada_outbox_configure", { _enabled: data.enabled });
      if (r.error)
        throw new IntakeError(
          "config",
          r.error.message.includes("RECEBIMENTO_DESATIVADO")
            ? "Ative primeiro o recebimento de anamneses pelo GHL."
            : "Não foi possível alterar o aviso automático.",
          409,
        );
      const settings = toSettings(r.data);
      // Não declarar sucesso quando a verificação periódica está parada.
      if (data.enabled && (!settings.jobActive || !settings.keyReady || !settings.configOk))
        return {
          ok: false,
          code: "verificacao_parada",
          message:
            "Aviso marcado como ativo, mas a verificação periódica no servidor está parada. Nada será enviado até que ela seja ligada.",
        };
      return { ok: true, data: settings };
    } catch (error) {
      return failure(error);
    }
  });

/** Recoloca na fila um aviso com falha ou pendência de vínculo, sem apagar registros. */
export const reenviarAvisoJornada = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.strictObject({ outboxId: z.uuid(), confirm: z.literal(true) }).parse(data),
  )
  .handler(async ({ data }): Promise<EventsResponse<{ requeued: boolean }>> => {
    try {
      const db = await adminDb();
      const r = await db.rpc("jornada_outbox_retry", { _id: data.outboxId });
      if (r.error) throw new IntakeError("db", "Não foi possível recolocar o aviso na fila.", 503);
      return { ok: true, data: { requeued: r.data === true } };
    } catch (error) {
      return failure(error);
    }
  });
