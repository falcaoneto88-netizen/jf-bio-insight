import { createHmac } from "node:crypto";
import { z } from "zod";
import { buildEvent, type Source, type SyncInput } from "./core";

const destination = "https://jornada-ai-conecta.lovable.app/api/public/bioreport-event";
const receiptSchema = z
  .object({
    status: z.enum(["received", "duplicate"]),
    event_id: z.string().max(100),
    contact_id: z.uuid(),
    messages_sent: z.literal(0),
  })
  .strict();

/** Somente no servidor, depois da autorização e da confirmação do administrador. */
export async function sendJornadaEvent(input: SyncInput, source: Source) {
  const secret = process.env["BIOREPORT_JORNADA_SIGNING_SECRET"] ?? "";
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error("Integração Jornada AI não configurada.");
  const event = buildEvent(input, source, {
    organizationId: process.env["JORNADA_AI_ORGANIZATION_ID"] ?? "",
    locationId: process.env["GHL_LOCATION_ID"] ?? "",
    keyId: process.env["BIOREPORT_JORNADA_KEY_ID"] ?? "",
  });
  const body = JSON.stringify(event);
  const signature = createHmac("sha256", secret).update(body, "utf8").digest("hex");
  let response: Response;
  try {
    response = await fetch(destination, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", "x-bioreport-signature": signature },
      body,
    });
  } catch {
    throw new Error(
      "Não foi possível confirmar o recebimento. Consulte os eventos no Jornada AI; repetir o mesmo registro não duplica o evento.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    if (response.status === 401)
      throw new Error("Jornada AI recusou a assinatura. Confira a configuração da integração.");
    if (response.status === 409)
      throw new Error(
        "O contato não está sincronizado ou o vínculo do paciente diverge. Confira os IDs no Jornada AI.",
      );
    throw new Error(
      "Jornada AI não confirmou o evento. Confira a configuração e o histórico antes de repetir.",
    );
  }
  let receipt: z.infer<typeof receiptSchema>;
  try {
    receipt = receiptSchema.parse(await response.json());
  } catch {
    throw new Error("Resposta inválida do Jornada AI. Confira o histórico antes de repetir.");
  }
  if (receipt.event_id !== event.event_id)
    throw new Error("Jornada AI não confirmou o evento solicitado.");
  return receipt;
}
