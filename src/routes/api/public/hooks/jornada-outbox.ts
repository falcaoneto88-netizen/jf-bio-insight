import { createFileRoute } from "@tanstack/react-router";

/**
 * Trabalhador periódico da fila de avisos administrativos ao Jornada AI.
 * Só executa com a credencial interna do agendador; nunca consome a fila sem autenticação.
 * Não recebe nem devolve dados clínicos: apenas contagens.
 */
export const Route = createFileRoute("/api/public/hooks/jornada-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { timingSafeEqual } = await import("node:crypto");
        const expected = process.env["BIOREPORT_JORNADA_WORKER_SECRET"] ?? "";
        const received = /^Bearer (\S+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
        const ok =
          expected.length >= 16 &&
          !!received &&
          received.length === expected.length &&
          timingSafeEqual(Buffer.from(received), Buffer.from(expected));
        if (!ok)
          return Response.json(
            { error: "unauthorized" },
            { status: 401, headers: { "Cache-Control": "no-store, private" } },
          );

        const locationId = process.env["GHL_LOCATION_ID"] ?? "";
        if (!locationId)
          return Response.json(
            { error: "not_configured" },
            { status: 503, headers: { "Cache-Control": "no-store, private" } },
          );

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { runOutboxWorker } = await import("@/lib/jornada-events/outbox.server");
          const { sendJornadaEvent } = await import("@/lib/jornada-events/client.server");
          const summary = await runOutboxWorker({
            db: supabaseAdmin,
            send: sendJornadaEvent,
            locationId,
          });
          return Response.json(summary, { headers: { "Cache-Control": "no-store, private" } });
        } catch {
          return Response.json(
            { error: "unavailable" },
            { status: 503, headers: { "Cache-Control": "no-store, private" } },
          );
        }
      },
    },
  },
});
