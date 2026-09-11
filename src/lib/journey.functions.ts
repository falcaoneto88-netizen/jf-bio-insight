/**
 * Server functions da jornada clínica (UI).
 * Autenticadas, restritas a administradores e sempre limitadas ao dono.
 * O userId vem SEMPRE do token verificado — nunca do cliente.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ACCEPTED_MIMES, MAX_PASTED_TEXT } from "@/lib/journey/agent.server";
import {
  anamneseSchema,
  bioSchema,
  protocolSchema,
  type Anamnese,
  type Bio,
  type Protocolo,
} from "@/lib/journey/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Ctx = { supabase: any; userId: string; claims?: Record<string, unknown> };

/**
 * A aprovação é um ato humano na aplicação autenticada.
 * Tokens emitidos a clientes OAuth delegados (assistentes/MCP) são recusados.
 */
function assertHumanSession(claims: Record<string, unknown> | undefined) {
  const c = claims ?? {};
  const delegado =
    typeof c["client_id"] === "string" ||
    typeof c["azp"] === "string" ||
    typeof c["scope"] === "string" ||
    Array.isArray(c["scopes"]) ||
    c["aud"] !== "authenticated";
  if (delegado) {
    throw new Error("A aprovação só pode ser feita por uma pessoa, dentro da aplicação.");
  }
}

async function assertAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error("Acesso restrito: apenas administradores.");
}

async function core() {
  return import("@/lib/journey/core.server");
}

const idSchema = z.object({ id: z.string().uuid() });
const versionedSchema = z.object({ id: z.string().uuid(), expectedVersion: z.number().int().min(1) });

/* ------------------------------- leitura ------------------------------ */

export const listarJornadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { listJourneys } = await core();
    return { jornadas: await listJourneys(context.supabase, context.userId) };
  });

export const obterJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { getJourney, reviewIssues } = await core();
    const jornada = await getJourney(context.supabase, context.userId, data.id);
    return { jornada, issues: reviewIssues(jornada) };
  });

/* ------------------------------- escrita ------------------------------ */

export const criarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ patientName: z.string().trim().min(1).max(160) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { createJourney } = await core();
    return { jornada: await createJourney(context.supabase, context.userId, data.patientName) };
  });

const patchSchema = versionedSchema.extend({
  patientName: z.string().trim().max(160).optional(),
  anamnese: anamneseSchema.optional(),
  bio: bioSchema.optional(),
  protocolo: protocolSchema.nullable().optional(),
  internalNotes: z.array(z.string().max(1000)).max(60).optional(),
  confirmations: z
    .object({ anamnese: z.boolean(), bio: z.boolean(), revisao: z.boolean() })
    .partial()
    .optional(),
  status: z.string().max(40).optional(),
});

export const guardarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => patchSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { patchJourney, reviewIssues } = await core();
    const { id, expectedVersion, ...patch } = data;
    const jornada = await patchJourney(context.supabase, context.userId, id, expectedVersion, {
      ...patch,
      anamnese: patch.anamnese as Anamnese | undefined,
      bio: patch.bio as Bio | undefined,
      protocolo: patch.protocolo as Protocolo | null | undefined,
    });
    return { jornada, issues: reviewIssues(jornada) };
  });

export const apagarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { deleteJourney } = await core();
    await deleteJourney(context.supabase, context.userId, data.id);
    return { ok: true as const };
  });

/* --------------------------- agente clínico --------------------------- */

export const organizarAnamnese = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), texto: z.string().min(1).max(MAX_PASTED_TEXT) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    await (await core()).consumeAiQuota(context.userId);
    const { getJourney } = await core();
    const jornada = await getJourney(context.supabase, context.userId, data.id);
    const { organizarAnamneseTexto } = await import("@/lib/journey/agent.server");
    return organizarAnamneseTexto(data.texto, jornada.patientName);
  });

export const extrairBioimpedancia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        texto: z.string().max(MAX_PASTED_TEXT).optional(),
        fileBase64: z.string().max(20_000_000).optional(),
        mimeType: z.enum(ACCEPTED_MIMES).optional(),
        fileName: z.string().max(255).optional(),
      })
      .refine((v) => Boolean(v.texto?.trim()) || Boolean(v.fileBase64), {
        message: "Envie um arquivo ou cole o texto do exame.",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    await (await core()).consumeAiQuota(context.userId);
    const { getJourney } = await core();
    const jornada = await getJourney(context.supabase, context.userId, data.id);
    const { extrairBioimpedanciaSource } = await import("@/lib/journey/agent.server");
    const source =
      data.fileBase64 && data.mimeType
        ? ({
            kind: "file" as const,
            fileBase64: data.fileBase64,
            mimeType: data.mimeType,
            fileName: data.fileName ?? "exame",
          })
        : ({ kind: "text" as const, text: data.texto ?? "" });
    return extrairBioimpedanciaSource(source, jornada.patientName);
  });

export const prepararProtocolo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        expectedVersion: z.number().int().min(1),
        objetivo: z.enum(["hipertrofia", "recomposicao"]),
        instrucoes: z.string().max(6000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    await (await core()).consumeAiQuota(context.userId);
    const { getJourney, patchJourney, reviewIssues } = await core();
    const jornada = await getJourney(context.supabase, context.userId, data.id);
    if (!jornada.confirmations.revisao) {
      return { data: null, error: "Confirme a revisão dos dados antes de preparar o protocolo." };
    }

    const { prepararProtocoloRascunho, anamneseParaTexto } = await import("@/lib/journey/agent.server");
    const { computeEvolution } = await import("@/lib/journey/evolution");
    const evolution = computeEvolution(jornada.bio);
    const { bioResumoTexto } = await core();
    const bioResumo = bioResumoTexto(jornada.bio);

    const result = await prepararProtocoloRascunho({
      objetivo: data.objetivo,
      instrucoes: data.instrucoes,
      anamneseResumo: anamneseParaTexto(jornada.anamnese),
      bioResumo,
      evolucaoResumo: evolution.summaryLines.join(" "),
    });
    if (!result.data) return { data: null, error: result.error };

    const protocolo: Protocolo = protocolSchema.parse({
      templateVersion: "modelo-protocolo-v1",
      objetivo: data.objetivo,
      instrucoes: data.instrucoes,
      sections: result.data.sections,
      pendencias: result.data.pendencias,
    });

    const atualizada = await patchJourney(
      context.supabase,
      context.userId,
      data.id,
      data.expectedVersion,
      { protocolo, status: "protocolo" },
    );
    return { data: { jornada: atualizada, issues: reviewIssues(atualizada) }, error: null };
  });

/* ------------------------- aprovação e export ------------------------- */

export const aprovarJornada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        expectedVersion: z.number().int().min(1),
        expectedHash: z.string().min(16).max(128),
        // Confirmação humana explícita, digitada na aplicação.
        confirmacao: z.literal("APROVAR"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    assertHumanSession(context.claims as Record<string, unknown> | undefined);
    await assertAdmin(context as Ctx);
    const { approveJourney, reviewIssues } = await core();
    const jornada = await approveJourney(
      context.supabase,
      context.userId,
      data.id,
      data.expectedVersion,
      data.expectedHash,
    );
    return { jornada, issues: reviewIssues(jornada) };
  });

export const previewHtml = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), tipo: z.enum(["draft", "final"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { getJourney, buildHtml, htmlFileName, approvedSnapshotHtml } = await core();
    const jornada = await getJourney(context.supabase, context.userId, data.id);
    try {
      return {
        html:
          data.tipo === "final"
            ? await approvedSnapshotHtml(context.supabase, context.userId, jornada)
            : buildHtml(jornada, "draft"),
        fileName: htmlFileName(jornada, data.tipo),
        version: jornada.version,
        error: null as string | null,
      };
    } catch (err) {
      return { html: null, fileName: null, version: jornada.version, error: (err as Error).message };
    }
  });
