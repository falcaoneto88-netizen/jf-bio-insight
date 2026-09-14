import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  changeIntakeSettings,
  loadIntakeSettings,
  revokeIntakeLink,
} from "@/lib/intake-invitations/functions";
export function GhlIntakeSettings({ consultationId }: { consultationId?: string }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [state, setState] = useState<{
    enabled: boolean;
    secretConfigured: boolean;
    calendarConfigured: boolean;
  } | null>(null);
  const [confirmed, setConfirmed] = useState(false),
    [confirmRevoke, setConfirmRevoke] = useState(false);
  async function load() {
    setOpen(true);
    setBusy(true);
    try {
      const r = await loadIntakeSettings();
      if (r.ok) {
        setState(r.data);
        setMessage("");
      } else setMessage(r.message);
    } catch {
      setMessage("Não foi possível conferir a integração.");
    } finally {
      setBusy(false);
    }
  }
  async function change(enabled: boolean) {
    setBusy(true);
    try {
      const r = await changeIntakeSettings({ data: { enabled, confirm: true } });
      if (r.ok) {
        setState((s) => (s ? { ...s, enabled } : s));
        setConfirmed(false);
        setMessage(
          enabled
            ? "Recebimento habilitado. A automação no GHL ainda precisa estar configurada."
            : "Recebimento desativado. Os links ficam indisponíveis enquanto a integração estiver desativada.",
        );
      } else setMessage(r.message);
    } catch {
      setMessage("Não foi possível alterar a integração.");
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    if (!consultationId) return;
    setBusy(true);
    try {
      const r = await revokeIntakeLink({ data: { consultationId, confirm: true } });
      setMessage(
        r.ok
          ? "Convite desta consulta revogado. As respostas já recebidas foram preservadas."
          : r.message,
      );
      setConfirmRevoke(false);
    } catch {
      setMessage("Não foi possível revogar o convite.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => (open ? setOpen(false) : void load())}
      >
        Anamnese pelo GHL
      </Button>
      {open && (
        <div className="space-y-3 text-sm">
          <p>Pré-Procedimento Harmonização Glutea · convites individuais sem login no Google.</p>
          <p>
            Endereço do webhook:{" "}
            <code className="break-all">
              https://jf-bio-insight.lovable.app/api/public/ghl-anamnese
            </code>
          </p>
          <p>
            A mensagem deve usar o link retornado pelo webhook em cada execução. O valor global
            “Link da Anamnese” não deve guardar um convite de paciente.
          </p>
          {state && (
            <>
              <p>
                Recebimento: <strong>{state.enabled ? "habilitado" : "desativado"}</strong>.
              </p>
              {!state.secretConfigured && (
                <p>
                  Cadastre BIOREPORT_GHL_INTAKE_SECRET nos Secrets do BioReport e a mesma chave no
                  campo de autenticação Bearer do webhook no GHL. Não coloque a chave na mensagem ou
                  no link do paciente.
                </p>
              )}
              {!state.calendarConfigured && (
                <p>
                  Defina BIOREPORT_GHL_PROCEDURE_CALENDAR_ID com o ID do calendário do procedimento.
                  A integração aceita somente agendamentos confirmados nesse calendário, com data e
                  hora futuras.
                </p>
              )}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Confirmo a {state.enabled ? "desativação" : "ativação"} do recebimento por convite
                individual.
              </label>
              <Button
                disabled={
                  busy ||
                  !confirmed ||
                  (!state.enabled && (!state.secretConfigured || !state.calendarConfigured))
                }
                onClick={() => void change(!state.enabled)}
              >
                {state.enabled ? "Desativar recebimento" : "Ativar recebimento"}
              </Button>
            </>
          )}
          {consultationId && (
            <div className="space-y-2 border-t pt-3">
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  disabled={busy}
                  checked={confirmRevoke}
                  onChange={(e) => setConfirmRevoke(e.target.checked)}
                />
                Quero revogar o convite desta consulta.
              </label>
              <Button
                variant="outline"
                disabled={busy || !confirmRevoke}
                onClick={() => void revoke()}
              >
                Revogar convite
              </Button>
            </div>
          )}
          {message && <p role="status">{message}</p>}
        </div>
      )}
    </section>
  );
}
