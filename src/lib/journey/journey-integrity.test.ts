/**
 * Integridade central das gravações (patchJourney), com dados fictícios:
 * - marcador do gerador preservado em edição, em protocolo:null e no save seguinte;
 * - prescrições estruturadas como fonte única da secção do documento;
 * - edição de substância/dose/via/frequência anula a confirmação, mesmo por patch;
 * - mudar objetivo/meta/refeições/energia/instruções depois de gerar exige nova
 *   geração, e o aviso não se remove por patch — só o caminho do servidor o limpa.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminClient;
  },
}));

import { buildHtml, contentHash, patchJourney } from "./core.server";
import {
  REGENERATION_REQUIRED_ISSUE,
  protocolEssentialIssues,
  rebuildPrescriptionSection,
} from "./protocol-quality";
import { protocolSchema, type Journey, type Protocolo } from "./types";
import { fixtureAnamnese, fixtureBio } from "./__fixtures__/jornada-sintetica";

const OWNER = "00000000-0000-0000-0000-0000000000aa";
const ID = "00000000-0000-0000-0000-0000000000bb";

type Row = Record<string, unknown>;
let journeyRow: Row;

const adminClient = {
  from: () => {
    const chain: Record<string, unknown> = {
      update: (values: Row) => {
        journeyRow = { ...journeyRow, ...values };
        return chain;
      },
      eq: () => chain,
      select: () => chain,
      maybeSingle: async () => ({ data: journeyRow, error: null }),
    };
    return chain;
  },
  rpc: async () => ({ data: null, error: null }),
};

function userClient() {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: journeyRow, error: null }),
  };
  return { from: () => chain } as never;
}

function geradoBase(over: Partial<Protocolo> = {}): Protocolo {
  return protocolSchema.parse({
    templateVersion: "modelo-protocolo-v2",
    objetivo: "hipertrofia",
    instrucoes: "Instruções fictícias do profissional.",
    locale: "pt-BR",
    generator: "protocolo-openai-2026-09-16-v1",
    mealCount: 1,
    energy: { method: "cunningham", targetKcal: 2400, lines: [] },
    sections: [
      {
        id: "plano-alimentar",
        title: "Plano alimentar",
        kind: "meals",
        blocks: [
          {
            type: "meal",
            liquid: false,
            foods: [
              { name: "Arroz fictício", quantity: "120 g", category: "carboidrato" },
              { name: "Frango fictício", quantity: "150 g", category: "proteina" },
            ],
            preparation: "Preparo fictício.",
            substitutions: {
              protein: ["150 g de peixe", "150 g de peru", "3 ovos"],
              carbohydrate: ["120 g de batata", "120 g de mandioca", "60 g de aveia"],
              fat: [],
            },
          },
        ],
      },
    ],
    pendencias: [],
    ...over,
  });
}

async function seed(protocolo: Protocolo | null) {
  journeyRow = {
    id: ID,
    owner_id: OWNER,
    patient_name: "Paciente Fictício",
    status: "protocolo",
    version: 3,
    anamnese: fixtureAnamnese,
    bio: fixtureBio,
    protocolo,
    internal_notes: [],
    confirmations: { anamnese: true, bio: true, revisao: true },
    content_hash: await contentHash({
      patientName: "Paciente Fictício",
      anamnese: fixtureAnamnese,
      bio: fixtureBio,
      protocolo,
    }),
    approved_version: null,
    approved_hash: null,
    approved_by: null,
    approved_at: null,
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-16T10:00:00Z",
  };
}

const save = (patch: Parameters<typeof patchJourney>[4], version = 3) =>
  patchJourney(userClient(), OWNER, ID, version, patch);

beforeEach(async () => {
  await seed(geradoBase());
});

describe("marcador do gerador no núcleo", () => {
  it("um patch sem generator não perde a classificação gerada", async () => {
    const semMarcador = protocolSchema.parse({
      ...geradoBase(),
      generator: undefined,
      instrucoes: "Texto editado à mão.",
    });
    const updated = await save({ protocolo: semMarcador });
    expect(updated.protocolo?.generator).toBe("protocolo-openai-2026-09-16-v1");
  });

  it("limpar o protocolo guarda um protocolo vazio COM marcador", async () => {
    const limpa = await save({ protocolo: null });
    expect(limpa.protocolo).not.toBeNull();
    expect(limpa.protocolo?.generator).toBe("protocolo-openai-2026-09-16-v1");
    expect(limpa.protocolo?.sections).toEqual([]);
  });

  it("protocolo:null seguido de protocolo novo continua a aplicar as regras", async () => {
    await save({ protocolo: null });
    await seed(journeyRow["protocolo"] as Protocolo);
    const novo = protocolSchema.parse({
      objetivo: "hipertrofia",
      instrucoes: "Plano escrito à mão, sem refeições.",
      sections: [],
    });
    const updated = await save({ protocolo: novo });
    expect(updated.protocolo?.generator).toBe("protocolo-openai-2026-09-16-v1");
    expect(protocolEssentialIssues(updated.protocolo!)).toEqual(
      expect.arrayContaining([expect.stringContaining("não tem refeições")]),
    );
  });

  it("um protocolo legado sem marcador continua sem marcador", async () => {
    await seed(protocolSchema.parse({ objetivo: "recomposicao", sections: [] }));
    const updated = await save({ protocolo: protocolSchema.parse({ objetivo: "recomposicao" }) });
    expect(updated.protocolo?.generator).toBeUndefined();
    expect(protocolEssentialIssues(updated.protocolo!)).toEqual([]);
  });
});

describe("prescrições como fonte única", () => {
  const completa = {
    substancia: "Substância fictícia",
    dose: "10 mg",
    via: "oral",
    frequencia: "1x/dia",
    observacoes: "",
    confirmada: true,
  };

  it("recria a secção a partir das entradas confirmadas e completas", async () => {
    const updated = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), prescriptions: [completa] }),
    });
    const secao = updated.protocolo!.sections.find((s) => s.kind === "prescription");
    expect(secao?.blocks[0]).toMatchObject({ type: "table" });
    expect(JSON.stringify(secao)).toContain("Substância fictícia");
  });

  it("remover a entrada remove o texto antigo da secção", async () => {
    const comEntrada = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), prescriptions: [completa] }),
    });
    await seed(comEntrada.protocolo);
    const semEntrada = await save({
      protocolo: protocolSchema.parse({ ...comEntrada.protocolo!, prescriptions: [] }),
    });
    expect(semEntrada.protocolo!.sections.some((s) => s.kind === "prescription")).toBe(false);
    expect(JSON.stringify(semEntrada.protocolo)).not.toContain("Substância fictícia");
  });

  it("uma secção de prescrição injetada à parte não sobrevive à gravação", async () => {
    const injetada = protocolSchema.parse({
      ...geradoBase(),
      prescriptions: [],
      sections: [
        ...geradoBase().sections,
        {
          id: "prescricoes",
          title: "Prescrição",
          kind: "prescription",
          blocks: [{ type: "paragraph", text: "Medicação inventada no editor." }],
        },
      ],
    });
    const updated = await save({ protocolo: injetada });
    expect(JSON.stringify(updated.protocolo)).not.toContain("Medicação inventada");
  });

  it("editar a dose por patch direto retira a confirmação", async () => {
    const comEntrada = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), prescriptions: [completa] }),
    });
    await seed(comEntrada.protocolo);
    const editada = await save({
      protocolo: protocolSchema.parse({
        ...comEntrada.protocolo!,
        prescriptions: [{ ...completa, dose: "20 mg" }],
      }),
    });
    expect(editada.protocolo!.prescriptions?.[0]?.confirmada).toBe(false);
    expect(editada.protocolo!.sections.some((s) => s.kind === "prescription")).toBe(false);
    expect(protocolEssentialIssues(editada.protocolo!)).toEqual(
      expect.arrayContaining([expect.stringContaining("por confirmar")]),
    );
  });

  it("confirmada sem dose, via ou frequência bloqueia a aprovação e não é emitida", async () => {
    const incompleta = { ...completa, via: "", frequencia: "" };
    const updated = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), prescriptions: [incompleta] }),
    });
    expect(updated.protocolo!.sections.some((s) => s.kind === "prescription")).toBe(false);
    expect(protocolEssentialIssues(updated.protocolo!)).toEqual(
      expect.arrayContaining([expect.stringContaining("Prescrição incompleta")]),
    );
  });

  it("a prévia do documento recria a mesma secção", () => {
    const protocolo = rebuildPrescriptionSection(
      protocolSchema.parse({ ...geradoBase(), prescriptions: [completa] }),
    );
    const journey = {
      patientName: "Paciente Fictício",
      anamnese: fixtureAnamnese,
      bio: fixtureBio,
      protocolo,
      version: 3,
      updatedAt: "2026-09-16T10:00:00Z",
    } as unknown as Journey;
    expect(buildHtml(journey, "draft")).toContain("Substância fictícia");
  });

  it("protocolos legados mantêm a sua secção de prescrição tal como está", () => {
    const legado = protocolSchema.parse({
      objetivo: "recomposicao",
      sections: [
        {
          id: "prescricoes",
          title: "Prescrição",
          kind: "prescription",
          blocks: [{ type: "paragraph", text: "Texto legado aprovado." }],
        },
      ],
    });
    expect(rebuildPrescriptionSection(legado)).toEqual(legado);
  });
});

describe("regeneração obrigatória depois de mudar as entradas", () => {
  it("mudar o objetivo depois de gerar bloqueia a aprovação", async () => {
    const updated = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), objetivo: "emagrecimento" }),
    });
    expect(updated.protocolo!.regenerationRequired).toBe(true);
    expect(protocolEssentialIssues(updated.protocolo!)).toContain(REGENERATION_REQUIRED_ISSUE);
  });

  it("mudar a meta calórica ou o número de refeições também bloqueia", async () => {
    const meta = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), calorieTarget: "2800 kcal" }),
    });
    expect(meta.protocolo!.regenerationRequired).toBe(true);
    await seed(geradoBase());
    const refeicoes = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), mealCount: 5 }),
    });
    expect(refeicoes.protocolo!.regenerationRequired).toBe(true);
  });

  it("editar só texto não finge regeneração e não limpa o aviso", async () => {
    const marcado = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), instrucoes: "Nova instrução clínica." }),
    });
    expect(marcado.protocolo!.regenerationRequired).toBe(true);
    await seed(marcado.protocolo);
    const tentativa = await save({
      protocolo: protocolSchema.parse({
        ...marcado.protocolo!,
        regenerationRequired: false,
      }),
    });
    expect(tentativa.protocolo!.regenerationRequired).toBe(true);
  });

  it("nova geração pelo caminho do servidor liberta o bloqueio", async () => {
    const marcado = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), objetivo: "emagrecimento" }),
    });
    await seed(marcado.protocolo);
    const regenerado = await save({
      protocolo: protocolSchema.parse({ ...geradoBase(), objetivo: "emagrecimento" }),
      regenerated: true,
    });
    expect(regenerado.protocolo!.regenerationRequired).toBeUndefined();
    expect(protocolEssentialIssues(regenerado.protocolo!)).not.toContain(
      REGENERATION_REQUIRED_ISSUE,
    );
  });

  it("guardar sem mexer nas entradas não inventa bloqueio", async () => {
    const igual = await save({ protocolo: geradoBase() });
    expect(igual.protocolo!.regenerationRequired).toBeUndefined();
  });
});
