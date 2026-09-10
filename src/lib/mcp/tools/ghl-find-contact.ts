import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { requireAdminClient } from "../supabase";

export default defineTool({
  name: "ghl_find_contact",
  title: "Procurar contacto no GoHighLevel",
  description:
    "Procura contactos no GoHighLevel por nome, email ou telefone e devolve id, nome, email e telefone.",
  inputSchema: {
    query: z.string().trim().min(2).describe("Nome, email ou telefone a procurar."),
    limit: z.number().int().optional().describe("Número máximo de contactos (1 a 25)."),
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
      const message = err instanceof Error ? err.message : "Falha ao contactar o GoHighLevel.";
      return { content: [{ type: "text", text: message }], isError: true };
    }
  },
});
