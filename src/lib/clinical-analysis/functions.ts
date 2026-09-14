import { createServerFn } from "@tanstack/react-start";
import type { AnalysisRecord, AnalysisReply } from "./schema";

// Kept separate from generated auth middleware to return sanitized Portuguese
// errors, including missing/expired credentials, without logging raw exceptions.
export const generateConsultationAnalysis = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }): Promise<AnalysisReply<AnalysisRecord>> => {
    const { withAnalysisSession } = await import("./session.server");
    return withAnalysisSession(async (db) => {
      const { generateAnalysis } = await import("./service.server");
      return generateAnalysis(db, data);
    });
  });

export const getConsultationAnalyses = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => input)
  .handler(async ({ data }): Promise<AnalysisReply<AnalysisRecord[]>> => {
    const { withAnalysisSession } = await import("./session.server");
    return withAnalysisSession(async (db) => {
      const { listAnalyses } = await import("./service.server");
      return { ok: true, data: await listAnalyses(db, data) };
    });
  });
