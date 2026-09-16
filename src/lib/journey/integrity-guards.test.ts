/**
 * Guardas de leitura e de impressão, com dados fictícios:
 * - data do exame ausente do histórico não vira medida atual silenciosa;
 * - impressão fecha em falha quando não há hash do servidor ou calculadora SHA;
 * - carregamento do iframe tem limite finito e limpa-se sempre.
 */
import { describe, expect, it, vi } from "vitest";

import { measuresForExam } from "./energy";
import { htmlBytesMismatch, printHtmlDocument, type PrintFrame } from "./print";
import { emptyBio } from "./types";

const bio = (over: Partial<typeof emptyBio>) => ({ ...emptyBio, ...over });

describe("medidas do exame atual", () => {
  const historico = [
    { data: "01/03/2026", pesoKg: "90,0", musculoEsqueleticoKg: "38,0", pgc: "30,0" },
    { data: "01/06/2026", pesoKg: "88,0", musculoEsqueleticoKg: "38,4", pgc: "28,0" },
  ];

  it("usa as medidas da mesma data do exame", () => {
    const r = measuresForExam(bio({ dataHoraExame: "01/06/2026 09:00", historico }));
    expect(r.pesoKg).toBe("88,0");
    expect(r.pgc).toBe("28,0");
    expect(r.issues).toEqual([]);
  });

  it("data do exame fora do histórico não usa um exame antigo", () => {
    const r = measuresForExam(bio({ dataHoraExame: "15/09/2026 09:00", historico }));
    expect(r.pesoKg).toBe("");
    expect(r.pgc).toBe("");
    expect(r.issues.join(" ")).toContain("não existe no histórico");
  });

  it("sem exame não calcula nada", () => {
    const r = measuresForExam(bio({ semExame: true, historico }));
    expect(r.pesoKg).toBe("");
    expect(r.issues).toEqual([]);
  });
});

describe("verificação do documento antes de entregar", () => {
  it("sem hash do servidor, recusa", () => {
    expect(htmlBytesMismatch("abc", undefined)).toContain("identificador");
  });

  it("sem calculadora SHA no navegador, recusa", () => {
    expect(htmlBytesMismatch(null, "abc")).toContain("verificar");
  });

  it("hashes diferentes, recusa", () => {
    expect(htmlBytesMismatch("abc", "def")).toContain("não corresponde");
  });

  it("hashes iguais, permite", () => {
    expect(htmlBytesMismatch("abc", "abc")).toBeNull();
  });
});

describe("impressão", () => {
  const frame = (over: Partial<PrintFrame> = {}): PrintFrame & { removed: () => number } => {
    let removed = 0;
    return {
      load: async () => {},
      waitReady: async () => {},
      print: () => {},
      remove: () => {
        removed += 1;
      },
      removed: () => removed,
      ...over,
    };
  };

  it("um iframe que nunca carrega falha por tempo e é removido", async () => {
    vi.useFakeTimers();
    const f = frame({ load: () => new Promise<void>(() => {}) });
    const promise = printHtmlDocument("<html></html>", f, () => true, 50);
    await vi.advanceTimersByTimeAsync(60);
    await expect(promise).resolves.toBe("blocked");
    expect(f.removed()).toBe(1);
    vi.useRealTimers();
  });

  it("troca de paciente ou versão durante o carregamento cancela a impressão", async () => {
    let atual = true;
    const printed = vi.fn();
    const f = frame({
      load: async () => {
        atual = false;
      },
      print: printed,
    });
    await expect(printHtmlDocument("<html></html>", f, () => atual)).resolves.toBe("stale");
    expect(printed).not.toHaveBeenCalled();
    expect(f.removed()).toBe(1);
  });

  it("documento atual pede o diálogo uma vez", async () => {
    const printed = vi.fn();
    const f = frame({ print: printed });
    await expect(printHtmlDocument("<html></html>", f, () => true)).resolves.toBe("requested");
    expect(printed).toHaveBeenCalledTimes(1);
  });
});
