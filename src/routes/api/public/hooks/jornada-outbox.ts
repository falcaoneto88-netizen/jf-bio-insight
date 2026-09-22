import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Trabalhador periódico da fila de avisos administrativos ao Jornada AI.
 *
 * Autoridades separadas:
 * - O despertador interno do banco (pg_net segue redirects) carrega apenas uma
 *   assinatura de finalidade exclusiva ("jornada-outbox-wakeup"), uso único e
 *   validade de 2 minutos, sem nenhum identificador de paciente. Ela SÓ acorda
 *   este endpoint: não lê, não reserva e não conclui nada.
 * - Reservar, renovar e concluir exigem outra prova, gerada aqui no servidor a
 *   partir de uma subchave derivada do segredo de assinatura já configurado.
 *
 * Sem acesso privilegiado (service role), sem guardar segredos e sem registrar
 * cabeçalhos, corpo ou credenciais.
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

        // Configuração conferida ANTES de consumir o despertador.
        const locationId = process.env["GHL_LOCATION_ID"] ?? "";
        const organizationId = process.env["JORNADA_AI_ORGANIZATION_ID"] ?? "";
        const signingSecret = process.env["BIOREPORT_JORNADA_SIGNING_SECRET"] ?? "";
        if (!locationId || !organizationId || !signingSecret) return deny("not_configured", 503);

        try {
          const { createOutboxClient, runOutboxWorker, deriveClaimKey } =
            await import("@/lib/jornada-events/outbox.server");
          const { sendJornadaEvent } = await import("@/lib/jornada-events/client.server");
          const db = createOutboxClient();

          // Despertador: apenas acorda. Não devolve identificadores nem reserva.
          const woke = await db.rpc("jornada_outbox_wake_signed", {
            _epoch: wakeup.ts,
            _nonce: wakeup.nonce,
            _sig: wakeup.sig,
          });
          if (woke.error || woke.data !== true) return deny("unauthorized", 401);

          // Só a impressão digital do destino sai do servidor; o valor nunca é exposto.
          const digest = await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(organizationId),
          );
          const orgFingerprint = [...new Uint8Array(digest)]
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
          const summary = await runOutboxWorker({
            db,
            send: sendJornadaEvent,
            locationId,
            orgFingerprint,
            claimKey: await deriveClaimKey(signingSecret),
          });
          return Response.json(summary, { headers: { "Cache-Control": "no-store, private" } });
        } catch (error) {
          // Prova recusada pelo banco não é diferenciada de indisponibilidade no corpo.
          const invalid = error instanceof Error && error.message === "claim";
          return deny(invalid ? "unauthorized" : "unavailable", invalid ? 401 : 503);
        }
      },
    },
  },
});
