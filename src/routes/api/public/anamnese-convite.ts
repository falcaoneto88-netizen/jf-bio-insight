import { createFileRoute } from "@tanstack/react-router";
export const Route = createFileRoute("/api/public/anamnese-convite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { intakeHttp } = await import("@/lib/intake-invitations/service.server");
        return intakeHttp(request, "patient");
      },
    },
  },
});
