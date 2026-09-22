import { createFileRoute } from "@tanstack/react-router";

/**
 * Trabalhador periódico da fila de avisos administrativos ao Jornada AI.
 * Só executa com a credencial interna guardada no cofre do banco: a fila
 * nunca pode ser consumida sem autenticação. Não recebe nem devolve dados
 * clínicos — apenas contagens — e nunca registra cabeçalhos ou credenciais.
 */
export const Route = createFileRoute("/api/public/hooks/jornada-outbox")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const deny = (error: string, status: number) =>
          Response.json({ error }, { status, headers: { "Cache-Control": "no-store, private" } });

        const token = /^Bearer (\S{32,200})$/.exec(request.headers.get("authorization") ?? "")?.[1];
        if (!token) return deny("unauthorized", 401);

        const locationId = process.env["GHL_LOCATION_ID"] ?? "";
        if (!locationId) return deny("not_configured", 503);

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const auth = await supabaseAdmin.rpc("jornada_worker_auth", { _token: token });
          if (auth.error || auth.data !== true) return deny("unauthorized", 401);

          const { runOutboxWorker } = await import("@/lib/jornada-events/outbox.server");
          const { sendJornadaEvent } = await import("@/lib/jornada-events/client.server");
          const summary = await runOutboxWorker({
            db: supabaseAdmin,
            send: sendJornadaEvent,
            locationId,
          });
          return Response.json(summary, { headers: { "Cache-Control": "no-store, private" } });
        } catch {
          return deny("unavailable", 503);
        }
      },
    },
  },
});
