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

import { approveJourney, approvedSnapshotHtml, contentHash, patchJourney } from "./core.server";
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
  it("recusa aprovação com hash forjado", async () => {
    await expect(approveJourney(userClient(), OWNER, ID, 3, "hash-falso")).rejects.toThrow(/conteúdo mudou/i);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("recusa aprovação com versão forjada", async () => {
    await expect(
      approveJourney(userClient(), OWNER, ID, 99, String(journeyRow["content_hash"])),
    ).rejects.toThrow(/conteúdo mudou/i);
    expect(adminRpc).not.toHaveBeenCalled();
  });

  it("quando aprova, fá-lo pela função de servidor", async () => {
    await approveJourney(userClient(), OWNER, ID, 3, String(journeyRow["content_hash"]));
    expect(adminRpc).toHaveBeenCalledWith("aprovar_jornada", expect.objectContaining({ _jornada_id: ID }));
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

  it("serve o snapshot aprovado quando o hash confere", async () => {
    approvalRow = {
      version: 3,
      content_hash: journeyRow["content_hash"],
      approved_by: OWNER,
      approved_at: "2026-09-11T10:00:00Z",
      snapshot: {
        patientName: journeyRow["patient_name"],
        anamnese: fixtureAnamnese,
        bio: fixtureBio,
        protocolo: fixtureProtocolo,
        html: "<!doctype html><html><body>ok</body></html>",
      },
    };
    const html = await approvedSnapshotHtml(userClient(), OWNER, journeyFromRow());
    expect(html).toContain("ok");
  });

  it("recusa snapshot adulterado em base", async () => {
    approvalRow = {
      version: 3,
      content_hash: journeyRow["content_hash"],
      approved_by: OWNER,
      approved_at: "2026-09-11T10:00:00Z",
      snapshot: {
        patientName: "Outro Paciente",
        anamnese: fixtureAnamnese,
        bio: fixtureBio,
        protocolo: fixtureProtocolo,
        html: "<!doctype html><html><body>adulterado</body></html>",
      },
    };
    await expect(approvedSnapshotHtml(userClient(), OWNER, journeyFromRow())).rejects.toThrow(
      /não corresponde/i,
    );
  });
});
