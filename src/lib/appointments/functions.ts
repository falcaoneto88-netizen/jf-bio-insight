import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { IntakeError } from "@/lib/intake-invitations/schema";
import { AppointmentsError, rangeSchema, type AppointmentRow, type Stage } from "./core";

export type AppointmentsPayload = {
  rows: AppointmentRow[];
  timezone: string;
  fetchedAt: string;
  range: { from: string; to: string };
  totals: { stage: Stage; count: number }[];
  warnings: string[];
  progressUnavailable: boolean;
};

export type AppointmentsResponse =
  | { ok: true; data: AppointmentsPayload }
  | { ok: false; code: string; message: string };

/**
 * Leitura somente: exige administrador autenticado ANTES de qualquer consulta
 * ao GHL ou ao banco. Nenhum identificador de clínica ou calendário vem do
 * navegador — apenas o período escolhido.
 */
export const listarAgendamentosConfirmados = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => rangeSchema.parse(data))
  .handler(async ({ data }): Promise<AppointmentsResponse> => {
    try {
      const { getRequest } = await import("@tanstack/react-start/server");
      const { publicIntakeDb, assertIntakeAdmin } = await import(
        "@/lib/intake-invitations/service.server"
      );
      const authorization = getRequest().headers.get("authorization");
      if (!authorization || !/^Bearer \S+$/.test(authorization))
        throw new IntakeError("unauthorized", "Sua sessão expirou. Entre novamente.", 401);
      const db = publicIntakeDb(authorization);
      await assertIntakeAdmin(db);

      const { listConfirmedAppointments } = await import("./service.server");
      const result = await listConfirmedAppointments(db, data);
      return { ok: true, data: result };
    } catch (error) {
      if (error instanceof AppointmentsError)
        return { ok: false, code: error.code, message: error.message };
      if (error instanceof IntakeError)
        return { ok: false, code: error.code, message: error.message };
      if (error instanceof z.ZodError)
        return { ok: false, code: "invalid_range", message: "Confira as datas do período." };
      return {
        ok: false,
        code: "unavailable",
        message: "Não foi possível carregar os agendamentos. Tente novamente.",
      };
    }
  });
