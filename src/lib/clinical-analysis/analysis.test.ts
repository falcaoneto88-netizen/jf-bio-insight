import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyAnamnesis } from "@/lib/anamnesis/form";
import { prepareAnalysisContext } from "./context.server";
import { AnalysisFailure, readAnalysisConfig, requestAnalysis } from "./provider.server";
import { generateAnalysis, listAnalyses, analysisDatabaseMessage } from "./service.server";
import { analysisOutputSchema, ANALYSIS_RULES_VERSION, type AnalysisRequest } from "./schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const request: AnalysisRequest = {
  requestId: id(40),
  consultationId: id(20),
  expectedVersion: 1,
  goal: "analise",
  professionalInstructions: "",
  confirm: true,
};
const output = {
  synthesis: "Síntese fictícia.",
  correlations: [],
  missingInformation: [],
  pointsForReview: [],
  professionalDraft: "Nota fictícia para revisão.",
};
function source() {
  return {
    consultation: {
      id: id(20),
      patient_id: id(10),
      patient_name: "Paciente Teste",
      consultation_date: "2026-09-14",
    },
    anamnesis: {
      id: id(30),
      accepted: true,
      confirmed_at: "2026-09-14T10:00:00Z",
      answers: {
        ...emptyAnamnesis(),
        patientName: "Paciente Teste",
        age: "35",
        consultationDate: "2026-09-14",
        wakeTime: "07:00",
        sleepTime: "23:00",
        hasChildren: "Não",
        hasConditions: "Não",
        takesMedication: "Não",
        medications: "",
        hasDrugAllergies: "Não sei",
        hasFoodAllergies: "Não",
        trains: "Sim",
        trainingFrequency: "3",
        trainingType: "Natação",
        waterLiters: "2,5",
        drinksAlcohol: "Não",
        smokes: "Não",
        sleepQuality: "Bom",
        takesSupplements: "Não",
        mainComplaint: "Exemplo fictício",
        treatmentGoal: "Objetivo fictício",
      },
    },
    draft: {
      version: 1,
      anamnesis_id: id(30),
      clinical_data: {
        patientName: "Paciente Teste",
        email: "ficticio@example.test",
        phone: "0000000",
        medications: "",
      },
      body_composition: {
        patientName: "Paciente Teste",
        examDateTime: "2026-09-14T10:00",
        age: "35",
        height: "170",
        weight: "70",
        skeletalMuscleMass: "30",
        bodyFatPercentage: "25",
        bodyFatHistory: [] as { date: string; value: string }[],
      },
    },
  };
}
function record() {
  return {
    id: request.requestId,
    consultation_id: request.consultationId,
    anamnesis_id: id(30),
    source_version: 1,
    source_hash: "a".repeat(64),
    model: "test-model",
    prompt_version: ANALYSIS_RULES_VERSION,
    goal: "analise",
    professional_instructions: "",
    status: "pending",
    result: null as unknown,
    error_code: null as unknown,
    created_at: "2026-09-14T10:00:00Z",
    completed_at: null as string | null,
  };
}
const config = () => ({ apiKey: "test-only-placeholder", model: "test-model" });
function client(
  options: {
    admin?: boolean;
    expired?: boolean;
    duplicate?: boolean;
    changed?: boolean;
    roleRevoked?: boolean;
  } = {},
) {
  const calls: string[] = [];
  let roles = 0;
  const db = {
    auth: {
      getUser: vi.fn(async () => {
        calls.push("auth");
        return { data: { user: options.expired ? null : { id: id(1) } }, error: null };
      }),
    },
    rpc: vi.fn(async (name: string) => {
      calls.push(name);
      if (name === "has_role")
        return {
          data: options.admin !== false && !(options.roleRevoked && ++roles > 1),
          error: null,
        };
      if (name === "clinical_analysis_source") return { data: source(), error: null };
      if (name === "list_consultation_analyses")
        return {
          data: [{ ...record(), status: "draft", result: output, is_current: true }],
          error: null,
        };
      if (name === "begin_consultation_analysis")
        return {
          data: { created: !options.duplicate, analysis: record(), source: source() },
          error: null,
        };
      throw Error("Unexpected RPC");
    }),
    from: vi.fn(() => {
      calls.push("write");
      let patch: Record<string, unknown> = {};
      const chain = {
        update: (value: Record<string, unknown>) => {
          patch = value;
          return chain;
        },
        eq: () => chain,
        select: () => chain,
        maybeSingle: async () => ({
          data: {
            ...record(),
            ...patch,
            completed_at: "2026-09-14T10:01:00Z",
            ...(options.changed ? { status: "stale", result: null, error_code: "stale" } : {}),
          },
          error: null,
        }),
      };
      return chain;
    }),
  };
  return { db: db as unknown as SupabaseClient, calls, raw: db };
}

describe("clinical context", () => {
  it("removes structured contact identifiers and hidden conditional answers", () => {
    const s = source();
    s.anamnesis.answers.medications = "Detalhe oculto";
    const prepared = prepareAnalysisContext(s, request);
    expect(JSON.stringify(prepared.context)).not.toContain("Paciente Teste");
    expect(JSON.stringify(prepared.context)).not.toContain("ficticio@example.test");
    expect(JSON.stringify(prepared.context)).not.toContain("Detalhe oculto");
    expect(prepared.missing.join(" ")).toContain("Massa livre de gordura");
    expect(prepared.context.evolucaoCalculada.comparavel).toBe(false);
  });
  it("rejects mismatched patient or consultation before generation", () => {
    const s = source();
    s.draft.body_composition.patientName = "Outro Paciente";
    expect(() => prepareAnalysisContext(s, request)).toThrow(/identidade/);
    expect(() => prepareAnalysisContext(source(), { ...request, consultationId: id(99) })).toThrow(
      /alterada/,
    );
  });
  it("rejects a different saved version or missing linked record", () => {
    expect(() => prepareAnalysisContext(source(), { ...request, expectedVersion: 2 })).toThrow(
      /alterada/,
    );
    const s = source();
    s.draft.anamnesis_id = id(99);
    expect(() => prepareAnalysisContext(s, request)).toThrow(/alterada/);
  });
  it("rejects implausible numeric values and an ambiguous height unit", () => {
    const s = source();
    s.draft.body_composition.height = "1,70";
    expect(() => prepareAnalysisContext(s, request)).toThrow(/centímetros/);
    s.draft.body_composition.height = "170";
    s.draft.body_composition.bodyFatPercentage = "120";
    expect(() => prepareAnalysisContext(s, request)).toThrow(/percentual/);
    s.draft.body_composition.bodyFatPercentage = "25";
    s.draft.body_composition.weight = "-70";
    expect(() => prepareAnalysisContext(s, request)).toThrow(/números/);
  });
  it("keeps percentage-point evolution deterministic and disables conflicting history", () => {
    const s = source();
    s.draft.body_composition.bodyFatHistory = [{ date: "2026-08-14", value: "28" }];
    expect(prepareAnalysisContext(s, request).context.evolucaoCalculada.resumo.join(" ")).toContain(
      "−3,0 p.p.",
    );
    s.draft.body_composition.bodyFatHistory.push({ date: "2026-09-14", value: "26" });
    const p = prepareAnalysisContext(s, request);
    expect(p.context.evolucaoCalculada.comparavel).toBe(false);
    expect(p.context.evolucaoCalculada.resumo).toEqual([]);
    expect(p.issues.length).toBeGreaterThan(0);
  });
});

describe("authorization and persistence", () => {
  it("checks live admin access before clinical queries or reading provider configuration", async () => {
    const c = client({ admin: false });
    const getConfig = vi.fn(config);
    await expect(
      generateAnalysis(c.db, request, { config: getConfig, generate: vi.fn() }),
    ).rejects.toThrow(/administradores/);
    expect(getConfig).not.toHaveBeenCalled();
    expect(c.calls).toEqual(["auth", "has_role"]);
  });
  it("returns an explicit expired-session error", async () => {
    const c = client({ expired: true });
    await expect(listAnalyses(c.db, id(20))).rejects.toThrow(/sessão expirou/);
    expect(c.calls).toEqual(["auth"]);
  });
  it("requires confirmation and rejects injected request fields", async () => {
    const c = client();
    const generate = vi.fn();
    expect(
      (await generateAnalysis(c.db, { ...request, confirm: false }, { config, generate })).ok,
    ).toBe(false);
    expect(
      (await generateAnalysis(c.db, { ...request, patient_id: id(999) }, { config, generate })).ok,
    ).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });
  it("reports missing configuration without reserving a request", async () => {
    const c = client();
    const reply = await generateAnalysis(c.db, request, {
      config: () => readAnalysisConfig({}),
      generate: vi.fn(),
    });
    expect(reply).toMatchObject({ ok: false, message: expect.stringContaining("OPENAI_API_KEY") });
    expect(c.calls).toEqual(["auth", "has_role"]);
  });
  it("saves a draft with deterministic missing information after the provider responds", async () => {
    const c = client();
    const reply = await generateAnalysis(c.db, request, {
      config,
      generate: vi.fn(async () => output),
    });
    expect(reply).toMatchObject({ ok: true, data: { status: "draft", is_current: true } });
    if (reply.ok)
      expect(reply.data.result?.missingInformation.join(" ")).toContain("Não informado");
    expect(c.calls.indexOf("begin_consultation_analysis")).toBeLessThan(c.calls.indexOf("write"));
  });
  it("does not call the provider twice for a repeated request", async () => {
    const c = client({ duplicate: true });
    const generate = vi.fn();
    expect((await generateAnalysis(c.db, request, { config, generate })).ok).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(c.raw.from).not.toHaveBeenCalled();
  });
  it("honors stale results and role revocation during generation", async () => {
    const c = client({ changed: true });
    expect(
      await generateAnalysis(c.db, request, { config, generate: vi.fn(async () => output) }),
    ).toMatchObject({ ok: true, data: { status: "stale", result: null, is_current: false } });
    const revoked = client({ roleRevoked: true });
    await expect(
      generateAnalysis(revoked.db, request, { config, generate: vi.fn(async () => output) }),
    ).rejects.toThrow(/administradores/);
    expect(revoked.raw.from).not.toHaveBeenCalled();
  });
  it("stores failure codes without raw provider errors", async () => {
    const c = client();
    const secretMessage = "do-not-expose-test-value";
    const reply = await generateAnalysis(c.db, request, {
      config,
      generate: vi.fn(async () => {
        throw new Error(secretMessage);
      }),
    });
    expect(reply).toMatchObject({
      ok: true,
      data: { status: "failed", result: null, error_code: "invalid_response" },
    });
    expect(JSON.stringify(reply)).not.toContain(secretMessage);
    expect(analysisDatabaseMessage({ code: "42P01" })).toContain("migração");
  });
});

describe("Responses API", () => {
  const response = (overrides = {}) =>
    new Response(
      JSON.stringify({
        status: "completed",
        output: [
          { type: "reasoning" },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: JSON.stringify(output) }],
          },
        ],
        ...overrides,
      }),
    );
  it("uses a fixed HTTPS endpoint, bounded structured output, no tools and store:false", async () => {
    const fetcher = vi.fn(async (_url: unknown, _options: unknown) => response());
    expect(
      await requestAnalysis({ clinical: "fictional" }, config(), fetcher as typeof fetch),
    ).toEqual(output);
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(options.body));
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options.redirect).toBe("error");
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.additionalProperties).toBe(false);
  });
  it("does not accept refusals, incomplete responses or unexpected output keys", async () => {
    for (const payload of [
      { status: "incomplete" },
      { output: [{ type: "message", role: "assistant", content: [{ type: "refusal" }] }] },
    ])
      await expect(
        requestAnalysis(
          {},
          config(),
          vi.fn(async () => response(payload)),
        ),
      ).rejects.toMatchObject({ code: "invalid_response" });
    expect(analysisOutputSchema.safeParse({ ...output, prescription: "unexpected" }).success).toBe(
      false,
    );
  });
  it("sanitizes authentication, quota and upstream errors", async () => {
    for (const [status, code] of [
      [401, "credentials"],
      [429, "quota"],
      [503, "unavailable"],
    ] as const)
      await expect(
        requestAnalysis(
          {},
          config(),
          vi.fn(async () => new Response("private-error", { status })),
        ),
      ).rejects.toMatchObject({ code });
  });
  it("rejects excessive response bodies", async () => {
    await expect(
      requestAnalysis(
        {},
        config(),
        vi.fn(async () => new Response("x".repeat(180001))),
      ),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("aborts requests after the time limit", async () => {
    vi.useFakeTimers();
    try {
      const promise = requestAnalysis(
        {},
        config(),
        vi.fn(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
            }),
        ) as typeof fetch,
      );
      const assertion = expect(promise).rejects.toEqual(new AnalysisFailure("timeout"));
      await vi.advanceTimersByTimeAsync(90000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
