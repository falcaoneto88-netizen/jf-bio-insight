import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { ghlErrorMessage } from "@/lib/ghl/errors";

import { requireAdminClient } from "../supabase";

export default defineTool({
  name: "ghl_find_contact",
  title: "Procurar contacto no GoHighLevel",
  description:
    "Procura contactos no GoHighLevel por nome, email ou telefone e devolve id, nome, email e telefone.",
  inputSchema: {
    query: z
      .string({ error: "Indique um texto válido." })
      .trim()
      .min(2, "O valor é inferior ao mínimo permitido (2).")
      .max(254, "Use no máximo 254 caracteres.")
      .describe("Nome, email ou telefone a procurar."),
    limit: z
      .number({ error: "O limite deve ser numérico." })
      .int("O limite deve ser um número inteiro.")
      .min(1, "O valor é inferior ao mínimo permitido (1).")
      .max(25, "O valor excede o máximo permitido (25).")
      .optional()
      .describe("Número máximo de contactos (1 a 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  handler: async ({ query, limit }, ctx) => {
    const access = await requireAdminClient(ctx);
    if (!access.ok) return { content: [{ type: "text", text: access.message }], isError: true };

    try {
      const { searchGhlContacts } = await import("@/lib/ghl/client.server");
      const contacts = await searchGhlContacts(query, Math.min(Math.max(limit ?? 10, 1), 25));
      return {
        content: [{ type: "text", text: JSON.stringify(contacts) }],
        structuredContent: { contacts },
      };
    } catch (err) {
      const message = ghlErrorMessage(err);
      return { content: [{ type: "text", text: message }], isError: true };
    }
  },
});
