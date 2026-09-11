/**
 * Garantias de escrita da jornada clínica:
 * - o cliente do utilizador nunca escreve (grants revogados em base);
 * - aprovação forjada (versão/hash errados) é recusada;
 * - qualquer edição pelo servidor invalida a aprovação em vigor;
 * - o HTML final valida hash e snapshot no servidor.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const adminUpdate = vi.fn();
const adminRpc = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({
  get supabaseAdmin() {
    return adminClient;
  },
}));

import {
  DOC_TEMPLATE,
  approveJourney,
  approvedSnapshotHtml,
  contentHash,
  finalCandidate,
  getJourney,
  patchJourney,
  sha256Hex,
} from "./core.server";
import { emptyBio, type Journey } from "./types";
import { fixtureAnamnese, fixtureBio, fixtureProtocolo } from "./__fixtures__/jornada-sintetica";

const OWNER = "00000000-0000-0000-0000-0000000000aa";
const ID = "00000000-0000-0000-0000-0000000000bb";

type Row = Record<string, unknown>;
let journeyRow: Row;
let approvalRow: Row | null;

/** Cliente do utilizador: só leitura. Qualquer escrita rebenta como em base (42501). */
function userClient() {
  const denied = () => {
    throw new Error("permission denied for table (grants revogados ao cliente)");
  };
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => ({
        data: table === "jornadas_clinicas" ? journeyRow : approvalRow,
        error: null,
      }),
      single: async () => ({ data: journeyRow, error: null }),
      insert: denied,
      update: denied,
      upsert: denied,
      delete: denied,
    };
    return chain;
  };
  return {
    from: builder,
    rpc: () => {
      throw new Error("permission denied for function aprovar_jornada");
    },
  } as never;
}

/** Cliente service_role usado pelo backend. */
const adminClient = {
  from: () => {
    const chain: Record<string, unknown> = {
      update: (values: Row) => {
        adminUpdate(values);
        journeyRow = { ...journeyRow, ...values };
        return chain;
      },
      eq: () => chain,
      select: () => chain,
      maybeSingle: async () => ({ data: journeyRow, error: null }),
    };
    return chain;
  },
  rpc: async (name: string, args: Row) => {
    adminRpc(name, args);
    return { data: null, error: null };
  },
};

async function baseRow(): Promise<Row> {
  const hash = await contentHash({
    patientName: "Paciente Sintético Um",
    anamnese: fixtureAnamnese,
    bio: fixtureBio,
    protocolo: fixtureProtocolo,
  });
  return {
    id: ID,
    owner_id: OWNER,
    patient_name: "Paciente Sintético Um",
    status: "aprovado",
    version: 3,
    anamnese: fixtureAnamnese,
    bio: fixtureBio,
    protocolo: fixtureProtocolo,
    internal_notes: [],
    confirmations: { anamnese: true, bio: true, revisao: true },
    content_hash: hash,
    approved_version: 3,
    approved_hash: hash,
    approved_by: OWNER,
    approved_at: "2026-09-11T10:00:00Z",
    created_at: "2026-09-01T10:00:00Z",
    updated_at: "2026-09-11T10:00:00Z",
  };
}

beforeEach(async () => {
  adminUpdate.mockClear();
  adminRpc.mockClear();
  journeyRow = await baseRow();
  approvalRow = null;
});

describe("escritas apenas pelo backend", () => {
  it("a edição usa service_role e nunca o cliente do utilizador", async () => {
    await patchJourney(userClient(), OWNER, ID, 3, { patientName: "Paciente Sintético Um B" });
    expect(adminUpdate).toHaveBeenCalledTimes(1);
  });

  it("uma edição invalida a aprovação em vigor", async () => {
    const updated = await patchJourney(userClient(), OWNER, ID, 3, { patientName: "Paciente Sintético Um B" });
    const values = adminUpdate.mock.calls[0]![0] as Row;
    expect(values["approved_version"]).toBeNull();
    expect(values["approved_hash"]).toBeNull();
    expect(values["approved_by"]).toBeNull();
    expect(values["approved_at"]).toBeNull();
    expect(updated.approvedVersion).toBeNull();
    expect(updated.version).toBe(4);
  });

  it("não deixa forjar approved_version pelo patch", async () => {
    await patchJourney(userClient(), OWNER, ID, 3, { bio: { ...emptyBio, semExame: true } });
    const values = adminUpdate.mock.calls[0]![0] as Row;
    expect(values).not.toHaveProperty("approved_by", OWNER);
    expect(values["approved_version"]).toBeNull();
  });

  it("recusa edição com versão desatualizada", async () => {
    await expect(patchJourney(userClient(), OWNER, ID, 2, { patientName: "X" })).rejects.toThrow(
      /alterada/i,
    );
    expect(adminUpdate).not.toHaveBeenCalled();
  });
});

describe("aprovação", () => {
  async function candidato() {
    const jornada = await getJourney(userClient(), OWNER, ID);
    return finalCandidate(jornada);
  }

  it("recusa aprovação com hash forjado", async () => {
    const { htmlHash } = await candidato();
    await expect(approveJourney(userClient(), OWNER, ID, 3, "hash-falso", htmlHash)).rejects.toThrow(
      /conteúdo mudou/i,
    );
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("recusa aprovação com versão forjada", async () => {
    const { htmlHash } = await candidato();
    await expect(
      approveJourney(userClient(), OWNER, ID, 99, String(journeyRow["content_hash"]), htmlHash),
    ).rejects.toThrow(/conteúdo mudou/i);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("recusa aprovação de um documento diferente do pré-visualizado", async () => {
    await expect(
      approveJourney(userClient(), OWNER, ID, 3, String(journeyRow["content_hash"]), "0".repeat(64)),
    ).rejects.toThrow(/documento mudou/i);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("quando aprova, fá-lo pela função de servidor e guarda a prova do documento", async () => {
    const { htmlHash } = await candidato();
    await approveJourney(userClient(), OWNER, ID, 3, String(journeyRow["content_hash"]), htmlHash);
    const args = adminRpc.mock.calls[0]![1] as Row;
    const snapshot = args["_snapshot"] as Row;
    expect(args["_jornada_id"]).toBe(ID);
    expect(snapshot["htmlHash"]).toBe(htmlHash);
    expect((snapshot["meta"] as Row)["approvedBy"]).toBe(OWNER);
  });
});

describe("HTML final", () => {
  function journeyFromRow(): Journey {
    return {
      id: ID,
      patientName: String(journeyRow["patient_name"]),
      status: "aprovado",
      version: 3,
      anamnese: fixtureAnamnese,
      bio: fixtureBio,
      protocolo: fixtureProtocolo,
      internalNotes: [],
      confirmations: { anamnese: true, bio: true, revisao: true },
      contentHash: String(journeyRow["content_hash"]),
      approvedVersion: 3,
      approvedAt: "2026-09-11T10:00:00Z",
      approvedBy: OWNER,
      approvedHash: String(journeyRow["content_hash"]),
      createdAt: "2026-09-01T10:00:00Z",
      updatedAt: "2026-09-11T10:00:00Z",
    } as Journey;
  }

  async function aprovacaoValida(html: string) {
    return {
      version: 3,
      content_hash: journeyRow["content_hash"],
      approved_by: OWNER,
      approved_at: "2026-09-11T10:00:00Z",
      snapshot: {
        patientName: journeyRow["patient_name"],
        anamnese: fixtureAnamnese,
        bio: fixtureBio,
        protocolo: fixtureProtocolo,
        html,
        htmlHash: await sha256Hex(html),
        meta: {
          version: 3,
          approvedBy: OWNER,
          template: DOC_TEMPLATE,
          generatedAt: "11/09/2026",
        },
      },
    } as Row;
  }

  it("serve exatamente o documento aprovado, byte a byte, em downloads repetidos", async () => {
    const { html } = await finalCandidate(journeyFromRow());
    approvalRow = await aprovacaoValida(html);
    const a = await approvedSnapshotHtml(userClient(), OWNER, journeyFromRow());
    const b = await approvedSnapshotHtml(userClient(), OWNER, journeyFromRow());
    expect(a).toBe(html);
    expect(b).toBe(html);
  });

  it("recusa HTML alterado isoladamente, com todos os outros campos intactos", async () => {
    const { html } = await finalCandidate(journeyFromRow());
    approvalRow = await aprovacaoValida(html);
    const snap = (approvalRow!["snapshot"] as Row);
    snap["html"] = html.replace("</body>", "<p>injetado</p></body>");
    await expect(approvedSnapshotHtml(userClient(), OWNER, journeyFromRow())).rejects.toThrow(
      /foi alterado/i,
    );
  });

  it("recusa dados atuais alterados com hash antigo mantido", async () => {
    const { html } = await finalCandidate(journeyFromRow());
    approvalRow = await aprovacaoValida(html);
    const adulterada = { ...journeyFromRow(), patientName: "Outro Paciente Sintético" };
    await expect(approvedSnapshotHtml(userClient(), OWNER, adulterada)).rejects.toThrow(/conteúdo mudou/i);
  });

  it("recusa autor de aprovação diferente do titular autenticado", async () => {
    const { html } = await finalCandidate(journeyFromRow());
    approvalRow = await aprovacaoValida(html);
    (approvalRow as Row)["approved_by"] = "outro-autor";
    await expect(approvedSnapshotHtml(userClient(), OWNER, journeyFromRow())).rejects.toThrow(/autor/i);
  });

  it("recusa data de aprovação inválida", async () => {
    const { html } = await finalCandidate(journeyFromRow());
    approvalRow = await aprovacaoValida(html);
    (approvalRow as Row)["approved_at"] = "data-invalida";
    await expect(approvedSnapshotHtml(userClient(), OWNER, journeyFromRow())).rejects.toThrow(/data/i);
  });

  it("pede nova aprovação quando o registo é antigo e não tem prova do documento", async () => {
    const { html } = await finalCandidate(journeyFromRow());
    approvalRow = await aprovacaoValida(html);
    const snap = (approvalRow!["snapshot"] as Row);
    delete snap["htmlHash"];
    delete snap["meta"];
    await expect(approvedSnapshotHtml(userClient(), OWNER, journeyFromRow())).rejects.toThrow(
      /aprove novamente|anterior à prova/i,
    );
  });

  it("recusa snapshot de dados adulterado em base", async () => {
    const { html } = await finalCandidate(journeyFromRow());
    approvalRow = await aprovacaoValida(html);
    const snap = (approvalRow!["snapshot"] as Row);
    snap["patientName"] = "Outro Paciente";
    await expect(approvedSnapshotHtml(userClient(), OWNER, journeyFromRow())).rejects.toThrow(
      /não corresponde/i,
    );
  });
});

