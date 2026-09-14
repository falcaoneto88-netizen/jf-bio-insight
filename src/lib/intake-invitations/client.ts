import { z } from "zod";
import { invitationSchema, type Invitation } from "./schema";
export async function callInvitation(data: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch("/api/public/anamnese-convite", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    throw new Error(
      "A conexão foi interrompida. Tente novamente; suas respostas continuam nesta página.",
    );
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ message: z.string().max(500) }).safeParse(payload);
    throw new Error(
      error.success ? error.data.message : "Não foi possível enviar. Tente novamente.",
    );
  }
  return payload;
}
export async function resolveInvitation(token: string): Promise<Invitation> {
  const r = invitationSchema.safeParse(await callInvitation({ action: "resolve", token }));
  if (!r.success)
    throw new Error("Não foi possível verificar o convite. Solicite ajuda à clínica.");
  return r.data;
}
export async function submitInvitation(data: {
  token: string;
  id: string;
  answers: unknown;
  name: string;
  accepted: true;
}) {
  const r = z
    .object({ confirmed_at: z.iso.datetime({ offset: true }) })
    .safeParse(await callInvitation({ action: "submit", ...data }));
  if (!r.success) throw new Error("Não foi possível confirmar o recebimento. Tente novamente.");
  return r.data;
}
