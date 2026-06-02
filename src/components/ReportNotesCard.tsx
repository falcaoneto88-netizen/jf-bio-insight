import { Lock, MessageSquare, Send } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useReportStore } from "@/store/report-store";

const MAX_LEN = 2000;

export function ReportNotesCard() {
  const clinicalNotes = useReportStore((s) => s.reportOptions.clinicalNotes);
  const patientNotes = useReportStore((s) => s.reportOptions.patientNotes);
  const patientNotesOn = useReportStore(
    (s) => s.reportOptions.sections.patientNotes,
  );
  const setClinicalNotes = useReportStore((s) => s.setClinicalNotes);
  const setPatientNotes = useReportStore((s) => s.setPatientNotes);
  const setReportSection = useReportStore((s) => s.setReportSection);

  const patientTrimmed = patientNotes.trim();
  const willPrint = patientNotesOn && patientTrimmed.length > 0;

  return (
    <Card className="border-gold/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <MessageSquare className="h-4 w-4 text-gold" />
          Observações e notas
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Use estes campos para notas internas e para a mensagem final ao
          paciente.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Observações clínicas — internas */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label
              htmlFor="clinical-notes"
              className="flex items-center gap-2 text-sm font-medium text-foreground"
            >
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              Observações clínicas
            </Label>
            <span className="rounded-sm border border-dashed border-muted-foreground/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Somente interno
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Visível apenas para você nesta tela. Nunca aparece no PDF.
          </p>
          <Textarea
            id="clinical-notes"
            value={clinicalNotes}
            onChange={(e) => setClinicalNotes(e.target.value.slice(0, MAX_LEN))}
            placeholder="Ex: rever vitamina D em 60 dias, paciente relatou refluxo após jejum prolongado…"
            className="min-h-[110px] resize-y"
            maxLength={MAX_LEN}
          />
          <p className="text-right text-[10px] text-muted-foreground">
            {clinicalNotes.length}/{MAX_LEN}
          </p>
        </div>

        {/* Notas finais ao paciente — vai ao PDF */}
        <div className="space-y-2 border-t border-border/60 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <Label
                htmlFor="patient-notes"
                className="flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <Send className="h-3.5 w-3.5 text-gold" />
                Notas finais ao paciente
              </Label>
              <p className="text-xs text-muted-foreground">
                Quando ativado e preenchido, sai como página final do PDF.
              </p>
            </div>
            <Switch
              id="patient-notes-toggle"
              checked={patientNotesOn}
              onCheckedChange={(v) => setReportSection("patientNotes", v)}
              aria-label="Incluir notas finais ao paciente no PDF"
            />
          </div>
          <Textarea
            id="patient-notes"
            value={patientNotes}
            onChange={(e) => setPatientNotes(e.target.value.slice(0, MAX_LEN))}
            placeholder="Ex: parabéns pelo comprometimento. Mantenha o foco em sono e hidratação nas próximas 4 semanas…"
            className="min-h-[130px] resize-y"
            maxLength={MAX_LEN}
            disabled={!patientNotesOn}
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>
              {willPrint ? (
                <span className="text-gold">Será impresso como página do PDF.</span>
              ) : patientNotesOn ? (
                "Adicione um texto para que esta página seja impressa."
              ) : (
                "Toggle desligado — não sai no PDF."
              )}
            </span>
            <span>
              {patientNotes.length}/{MAX_LEN}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
