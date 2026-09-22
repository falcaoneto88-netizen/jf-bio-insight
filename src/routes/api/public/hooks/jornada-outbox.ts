import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Trabalhador periódico da fila de avisos administrativos ao Jornada AI.
 *
 * O despertador interno do banco (pg_net) segue redirects, por isso ele não
 * envia credencial fixa: o corpo carrega apenas uma assinatura de finalidade
 * exclusiva ("jornada-outbox-wakeup"), uso único e validade de 2 minutos, sem
 * nenhum identificador de paciente. A assinatura é verificada pelo próprio
 * banco na reserva. Este trabalhador não usa acesso privilegiado (service
 * role), não guarda segredos e nunca registra cabeçalhos, corpo ou credenciais.
 */

const wakeupSchema = z.object({
  ts: z.number().int().positive(),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
  sig: z.string().regex(/^[a-f0-9]{64}$/),
});

export const Route = createFileRoute("/api/public/hooks/jornada-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = (error: string, status: number) =>
          Response.json({ error }, { status, headers: { "Cache-Control": "no-store, private" } });

        let wakeup: z.infer<typeof wakeupSchema>;
        try {
          wakeup = wakeupSchema.parse(await request.json());
        } catch {
          return deny("unauthorized", 401);
        }

        const locationId = process.env["GHL_LOCATION_ID"] ?? "";
        const organizationId = process.env["JORNADA_AI_ORGANIZATION_ID"] ?? "";
        if (!locationId || !organizationId) return deny("not_configured", 503);

        try {
          const { createOutboxClient } = await import("@/lib/jornada-events/outbox.server");
          const { runOutboxWorker } = await import("@/lib/jornada-events/outbox.server");
          const { sendJornadaEvent } = await import("@/lib/jornada-events/client.server");
          // Só a impressão digital do destino sai do servidor; o valor nunca é exposto.
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(organizationId),
          );
          const orgFingerprint = [...new Uint8Array(digest)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          const summary = await runOutboxWorker({
            db: createOutboxClient(),
            send: sendJornadaEvent,
            locationId,
            orgFingerprint,
            wakeup,
          });
          return Response.json(summary, { headers: { "Cache-Control": "no-store, private" } });
        } catch (error) {
          // Assinatura recusada pelo banco não é diferenciada de indisponibilidade no corpo.
          const invalid = error instanceof Error && error.message === "wakeup";
          return deny(invalid ? "unauthorized" : "unavailable", invalid ? 401 : 503);
        }
      },
    },
  },
});
