import {
  UtensilsCrossed,
  Droplets,
  Pill,
  Info,
  AlertTriangle,
  AlertOctagon,
  Stethoscope,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdjustedDiet, DietAlert } from "@/lib/diet-adjuster";
import type { PickMode } from "@/lib/diet-base";

function pickLabel(pick: PickMode, pickCount?: number): string {
  if (pick === "one") return "escolher 1";
  if (pick === "multi") return `escolher ${pickCount ?? 2}`;
  if (pick === "free") return "livre";
  return "todos";
}

function fmtNum(n: number): string {
  return n.toString().replace(".", ",");
}

export function DietPlanCard({ diet }: { diet: AdjustedDiet }) {
  return (
    <Card className="border-gold/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-lg">
          <UtensilsCrossed className="h-4 w-4 text-gold" />
          {diet.base.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Targets / metas */}
        <div className="flex flex-wrap gap-2">
          <Chip label={`Proteína ${fmtNum(diet.targets.proteinGPerKg)} g/kg`} />
          <Chip label={`Carbo ×${fmtNum(diet.targets.carbMultiplier)}`} />
          <Chip label={`Gordura ×${fmtNum(diet.targets.fatMultiplier)}`} />
          <Chip
            label={`${fmtNum(diet.targets.waterLitersPerDay)} L de água/dia`}
            icon={<Droplets className="h-3 w-3" />}
          />
        </div>

        {/* Refeições */}
        <div className="space-y-5">
          {diet.meals.map((meal) => (
            <div key={meal.id} className="border-l-2 border-gold/60 pl-4">
              <div className="flex items-baseline justify-between">
                <h4 className="font-serif text-base text-foreground">
                  {meal.name} <span className="text-gold">– {meal.time}</span>
                </h4>
                <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Obrigatório
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {meal.blocks.map((block) => (
                  <div key={block.id}>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
                      {block.title}{" "}
                      <span className="text-muted-foreground">({pickLabel(block.pick, block.pickCount)})</span>
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {block.options.map((opt) => (
                        <li
                          key={opt.id}
                          className="text-sm leading-relaxed text-foreground"
                        >
                          <span className="text-muted-foreground">— </span>
                          {opt.adjustedDisplay}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Regras gerais */}
        <div className="border-t border-border/60 pt-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Regras gerais
          </p>
          <ul className="mt-2 space-y-1 text-sm text-foreground">
            {diet.generalRules.map((rule, i) => (
              <li key={i}>— {rule}</li>
            ))}
          </ul>
        </div>

        {/* Suplementação */}
        {diet.supplementation.length > 0 && (
          <div className="border-t border-border/60 pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Pill className="h-3 w-3 text-gold" />
              Suplementação
            </p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {diet.supplementation.map((s) => (
                <li key={s.name} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{s.name}</span>
                  <span className="text-foreground">— {s.dose}</span>
                  {s.mandatory && (
                    <span className="rounded-sm border border-gold bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-gold">
                      Obrigatório
                    </span>
                  )}
                  <span className="block w-full text-xs text-muted-foreground">
                    {s.reason}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Alertas clínicos */}
        {diet.alerts.length > 0 && (
          <div className="space-y-2">
            {diet.alerts.map((a, i) => (
              <AlertBox key={i} alert={a} />
            ))}
          </div>
        )}

        {/* Observações digestivas */}
        {diet.digestiveNotes.length > 0 && (
          <div className="border-t border-border/60 pt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <Stethoscope className="h-3 w-3 text-gold" />
              Observações clínicas
            </p>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {diet.digestiveNotes.map((n, i) => (
                <li key={i}>— {n}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Rationale do ajuste */}
        {diet.targets.rationale.length > 0 && (
          <div className="rounded-sm border border-dashed border-border/80 bg-muted/30 px-3 py-2">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Ajuste automático
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {diet.targets.rationale.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
      {icon}
      {label}
    </span>
  );
}

function AlertBox({ alert }: { alert: DietAlert }) {
  const styles = {
    info: {
      icon: <Info className="h-4 w-4 text-muted-foreground" />,
      cls: "border-border bg-muted/30",
    },
    warning: {
      icon: <AlertTriangle className="h-4 w-4 text-gold" />,
      cls: "border-gold/40 bg-gold/5",
    },
    risk: {
      icon: <AlertOctagon className="h-4 w-4 text-gold" />,
      cls: "border-gold bg-gold/10",
    },
  }[alert.severity];
  return (
    <div
      className={`flex items-start gap-2 rounded-sm border px-3 py-2 ${styles.cls}`}
    >
      {styles.icon}
      <p className="text-sm leading-relaxed text-foreground">{alert.message}</p>
    </div>
  );
}
