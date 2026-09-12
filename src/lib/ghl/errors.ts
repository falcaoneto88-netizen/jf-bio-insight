// Only messages authored here may cross the server/client boundary.
export type GhlErrorCode = "configuration" | "transport" | "response" | "invalid_response";

export class GhlError extends Error {
  constructor(
    public readonly code: GhlErrorCode,
    public readonly status?: number,
  ) {
    super(
      code === "configuration"
        ? "Integração GoHighLevel não configurada. Contacte o administrador."
        : code === "transport"
          ? "Não foi possível contactar o GoHighLevel. Verifique o resultado antes de repetir um envio."
          : code === "invalid_response"
            ? "O GoHighLevel devolveu uma resposta inválida. Verifique o resultado antes de repetir um envio."
            : "O GoHighLevel recusou a operação. Contacte o administrador.",
    );
    this.name = "GhlError";
  }
}

export function ghlErrorMessage(error: unknown): string {
  return error instanceof GhlError
    ? error.message
    : "Não foi possível concluir a operação no GoHighLevel. Verifique o resultado antes de repetir um envio.";
}
