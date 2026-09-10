import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildReportNote, type ReportSummaryInput } from "@/lib/ghl-summary";

type AuthedContext = {
  supabase: { rpc: (...args: never[]) => unknown };
  userId: string;
};

async function assertAdmin(context: AuthedContext) {
  const rpc = context.supabase.rpc as unknown as (
    fn: "has_role",
    args: { _user_id: string; _role: "admin" },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Acesso restrito: apenas administradores.");
}

/** Procura contactos no GoHighLevel por nome, email ou telefone. */
export const searchGhlContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => {
    const query = input.query?.trim() ?? "";
    if (!query) throw new Error("Indique um nome, email ou telefone.");
    return { query };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { searchGhlContacts } = await import("@/lib/ghl/client.server");
    const contacts = await searchGhlContacts(data.query, 10);
    return { contacts };
  });

/** Cria/atualiza o contacto no GoHighLevel e regista o resumo do relatório. */
export const pushReportToGhl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { contactId?: string; name: string; email?: string; phone?: string; summary: ReportSummaryInput }) => {
      const name = input.name?.trim() ?? "";
      if (!name) throw new Error("Nome do paciente em falta.");
      if (!input.contactId && !input.email?.trim() && !input.phone?.trim()) {
        throw new Error("Indique um email ou telefone para identificar o contacto.");
      }
      return {
        contactId: input.contactId?.trim() || undefined,
        name,
        email: input.email?.trim() || undefined,
        phone: input.phone?.trim() || undefined,
        summary: input.summary,
      };
    },
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { upsertGhlContact, addGhlContactNote } = await import("@/lib/ghl/client.server");

    const contactId =
      data.contactId ??
      (
        await upsertGhlContact({
          name: data.name,
          email: data.email,
          phone: data.phone,
          tags: ["bioreport"],
        })
      ).id;

    await addGhlContactNote(contactId, buildReportNote({ ...data.summary, patientName: data.name }));
    return { contactId };
  });
