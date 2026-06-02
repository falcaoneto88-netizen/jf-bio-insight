import { ListChecks } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  useReportStore,
  type ReportSectionKey,
} from "@/store/report-store";

type SectionItem = {
  key: Exclude<ReportSectionKey, "patientNotes">;
  label: string;
  description: string;
};

const SECTIONS: SectionItem[] = [
  {
    key: "bioimpedance",
    label: "Dados da bioimpedância",
    description: "Página 1 — composição corporal aferida.",
  },
  {
    key: "analysis",
    label: "Análise corporal",
    description: "Página 2 — diagnóstico e estratégia.",
  },
  {
    key: "dietPlan",
    label: "Plano alimentar",
    description: "Página 3 — refeições e regras gerais.",
  },
  {
    key: "prescription",
    label: "Prescrição e suplementação",
    description: "Página 4 — suplementos e protocolo.",
  },
  {
    key: "finalGuidelines",
    label: "Orientações finais",
    description: "Página 5 — pilares de adesão.",
  },
];

export function ReportSectionsCard() {
  const sections = useReportStore((s) => s.reportOptions.sections);
  const setReportSection = useReportStore((s) => s.setReportSection);

  return (
    <Card className="border-gold/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <ListChecks className="h-4 w-4 text-gold" />
          Seções do relatório
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Escolha quais páginas serão incluídas no PDF.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {SECTIONS.map((s) => (
            <li
              key={s.key}
              className="flex items-start justify-between gap-4 py-3"
            >
              <div className="space-y-0.5">
                <Label
                  htmlFor={`section-${s.key}`}
                  className="cursor-pointer text-sm font-medium text-foreground"
                >
                  {s.label}
                </Label>
                <p className="text-xs text-muted-foreground">{s.description}</p>
              </div>
              <Switch
                id={`section-${s.key}`}
                checked={sections[s.key]}
                onCheckedChange={(v) => setReportSection(s.key, v)}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
