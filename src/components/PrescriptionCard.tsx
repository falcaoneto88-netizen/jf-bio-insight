import { useState } from "react";
import { Pill, Info, ExternalLink, ShieldCheck, FlaskConical } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

type SupplementItem = {
  name: string;
  dose: string;
  note?: string;
};

const MANDATORY_SUPPLEMENTS: SupplementItem[] = [
  {
    name: "Creatina monohidratada",
    dose: "5 g junto com uma refeição",
  },
  {
    name: "Ômega-3 (EPA/DHA)",
    dose: "2 g na 1ª refeição + 2 g na 3ª refeição",
  },
  {
    name: "Whey Protein",
    dose: "Sempre que indicado no plano alimentar",
  },
  {
    name: "Vitamina D3 + K2 MK7",
    dose: "6.000 UI de D3 + 200 mcg de K2",
  },
  {
    name: "Electrolyte Powder",
    dose: "8 g às 09:00",
    note: "Optimum Nutrition",
  },
  {
    name: "Magnésio bisglicinato",
    dose: "300 a 400 mg à noite",
  },
];

const TRUSTED_SHOPS: { label: string; url: string }[] = [
  { label: "prozis.com/be/fr", url: "https://www.prozis.com/be/fr" },
  { label: "optimumnutrition.com", url: "https://www.optimumnutrition.com" },
];

const ADVANCED_PROTOCOL_ITEMS: SupplementItem[] = [
  {
    name: "Berberina",
    dose: "500 mg antes das refeições principais",
    note: "Suporte glicêmico — avaliar interação com medicamentos.",
  },
  {
    name: "Inositol (Myo + D-Chiro)",
    dose: "2 g pela manhã",
    note: "Sensibilidade à insulina e equilíbrio hormonal.",
  },
  {
    name: "Coenzima Q10 (ubiquinol)",
    dose: "100 mg/dia com refeição",
    note: "Função mitocondrial e energia.",
  },
  {
    name: "Colágeno hidrolisado + Vitamina C",
    dose: "10 g + 500 mg/dia",
    note: "Pele, articulações e tecido conjuntivo.",
  },
  {
    name: "Probiótico multicepa",
    dose: "10–20 bilhões UFC/dia",
    note: "Eixo intestino-metabolismo.",
  },
];

export function PrescriptionCard() {
  const [advanced, setAdvanced] = useState(false);

  return (
    <Card className="border-gold/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <Pill className="h-4 w-4 text-gold" />
          Prescrição e Suplementação
        </CardTitle>
        <label className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <span>Protocolo avançado</span>
          <Switch
            checked={advanced}
            onCheckedChange={setAdvanced}
            aria-label="Incluir protocolo avançado"
          />
        </label>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Suplementos obrigatórios */}
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <ShieldCheck className="h-3 w-3 text-gold" />
            Suplementos — Obrigatórios
          </p>
          <ul className="mt-3 space-y-3">
            {MANDATORY_SUPPLEMENTS.map((s) => (
              <li
                key={s.name}
                className="border-l-2 border-gold/60 pl-3"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className="text-sm text-foreground">— {s.dose}</span>
                  <span className="rounded-sm border border-gold bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-gold">
                    Obrigatório
                  </span>
                </div>
                {s.note && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Aviso de compra */}
        <div className="rounded-sm border border-gold/40 bg-gold/5 px-4 py-3">
          <p className="flex items-start gap-2 text-sm text-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
            <span>
              <span className="font-medium">Atenção:</span> estes suplementos devem
              ser adquiridos exclusivamente em lojas especializadas e confiáveis.
            </span>
          </p>
          <div className="mt-3 space-y-1.5 pl-6">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Sites recomendados
            </p>
            <ul className="space-y-1">
              {TRUSTED_SHOPS.map((shop) => (
                <li key={shop.url}>
                  <a
                    href={shop.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline-offset-4 hover:text-gold hover:underline"
                  >
                    {shop.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Protocolo avançado (opcional) */}
        {advanced && (
          <div className="border-t border-border/60 pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <FlaskConical className="h-3 w-3 text-gold" />
              Prescrição clínica avançada
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Protocolo complementar — deve ser personalizado conforme exames
              laboratoriais e acompanhamento clínico individual.
            </p>
            <ul className="mt-3 space-y-3">
              {ADVANCED_PROTOCOL_ITEMS.map((s) => (
                <li key={s.name} className="border-l-2 border-border pl-3">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-foreground">{s.name}</span>
                    <span className="text-sm text-foreground">— {s.dose}</span>
                  </div>
                  {s.note && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
