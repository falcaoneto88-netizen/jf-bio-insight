import { z } from "zod";
import { ANALYSIS_PROMPT } from "./prompt.server";
import { analysisOutputSchema, type AnalysisOutput } from "./schema";

export class AnalysisFailure extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export function readAnalysisConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.OPENAI_API_KEY?.trim();
  const model = env.OPENAI_CLINICAL_MODEL?.trim() || "gpt-5.4";
  if (!apiKey || !/^[a-zA-Z0-9._:-]{1,100}$/.test(model))
    throw new AnalysisFailure("configuration");
  return { apiKey, model };
}

export async function requestAnalysis(
  context: unknown,
  config: { apiKey: string; model: string },
  fetcher: typeof fetch = fetch,
): Promise<AnalysisOutput> {
  const input = JSON.stringify(context);
  if (new TextEncoder().encode(input).length > 70000) throw new AnalysisFailure("invalid_response");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      // workerd só aceita "follow"/"manual"; nunca seguimos redireção com a credencial.
      redirect: "manual",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        store: false,
        instructions: ANALYSIS_PROMPT,
        input: [{ role: "user", content: input }],
        max_output_tokens: 6000,
        text: {
          format: {
            type: "json_schema",
            name: "clinical_analysis",
            strict: true,
            schema: z.toJSONSchema(analysisOutputSchema, { target: "draft-7" }),
          },
        },
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new AnalysisFailure(
        response.status === 401 || response.status === 403
          ? "credentials"
          : response.status === 429
            ? "quota"
            : response.status >= 300 && response.status < 500
              ? "rejected"
              : "unavailable",
      );
    }
    // Bound successful bodies too; never include provider error bodies or clinical
    // output in logs/exceptions returned to the browser.
    const reader = response.body?.getReader();
    if (!reader) throw new AnalysisFailure("invalid_response");
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 180000) {
        await reader.cancel();
        throw new AnalysisFailure("invalid_response");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    let payload: {
      status?: string;
      output?: { type?: string; role?: string; content?: { type?: string; text?: string }[] }[];
    };
    try {
      payload = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new AnalysisFailure("invalid_response");
    }
    if (payload.status !== "completed" || !Array.isArray(payload.output))
      throw new AnalysisFailure("invalid_response");
    const content = payload.output
      .filter((item) => item.type === "message" && item.role === "assistant")
      .flatMap((item) => (Array.isArray(item.content) ? item.content : []));
    if (content.some((item) => item.type === "refusal"))
      throw new AnalysisFailure("invalid_response");
    const text = content
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("");
    try {
      const output = analysisOutputSchema.parse(JSON.parse(text));
      if (new TextEncoder().encode(JSON.stringify(output)).length > 30000)
        throw new AnalysisFailure("invalid_response");
      return output;
    } catch {
      throw new AnalysisFailure("invalid_response");
    }
  } catch (error) {
    if (error instanceof AnalysisFailure) throw error;
    throw new AnalysisFailure(controller.signal.aborted ? "timeout" : "unavailable");
  } finally {
    clearTimeout(timer);
  }
}
