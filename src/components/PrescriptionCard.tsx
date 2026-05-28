import { useEffect } from "react";
import { Pill, Info, ExternalLink, ShieldCheck, FlaskConical, Plus, Trash2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  ADVANCED_PROTOCOL_ITEMS,
  FINAL_GUIDELINES,
  MANDATORY_SUPPLEMENTS,
  TRUSTED_SHOPS,
  buildDefaultPrescription,
  makeGuidelineItem,
  makePrescriptionItem,
  type GuidelineItem,
  type PrescriptionData,
  type PrescriptionItem,
} from "@/lib/prescription-data";
import { useReportStore } from "@/store/report-store";

export function PrescriptionCard() {
  const prescription = useReportStore((s) => s.prescription);
  const setPrescription = useReportStore((s) => s.setPrescription);

  // Initialise from defaults on first mount
  useEffect(() => {
    if (!prescription) {
      setPrescription(buildDefaultPrescription());
    }
  }, [prescription, setPrescription]);

  const data: PrescriptionData = prescription ?? buildDefaultPrescription();

  const update = (patch: Partial<PrescriptionData>) =>
    setPrescription({ ...data, ...patch });

  const updateItem = (
    bucket: "mandatory" | "advanced",
    id: string,
    patch: Partial<PrescriptionItem>,
  ) =>
    update({
      [bucket]: data[bucket].map((i) => (i.id === id ? { ...i, ...patch } : i)),
    } as Partial<PrescriptionData>);

  const removeItem = (bucket: "mandatory" | "advanced", id: string) =>
    update({
      [bucket]: data[bucket].filter((i) => i.id !== id),
    } as Partial<PrescriptionData>);

  const addItem = (bucket: "mandatory" | "advanced") =>
    update({
      [bucket]: [...data[bucket], makePrescriptionItem()],
    } as Partial<PrescriptionData>);

  const resetBucket = (bucket: "mandatory" | "advanced") => {
    const source =
      bucket === "mandatory" ? MANDATORY_SUPPLEMENTS : ADVANCED_PROTOCOL_ITEMS;
    update({
      [bucket]: source.map((s) => ({ ...makePrescriptionItem(), ...s })),
    } as Partial<PrescriptionData>);
  };

  const updateGuideline = (id: string, patch: Partial<GuidelineItem>) =>
    update({
      guidelines: data.guidelines.map((g) =>
        g.id === id ? { ...g, ...patch } : g,
      ),
    });

  const removeGuideline = (id: string) =>
    update({ guidelines: data.guidelines.filter((g) => g.id !== id) });

  const addGuideline = () =>
    update({ guidelines: [...data.guidelines, makeGuidelineItem()] });

  const resetGuidelines = () =>
    update({
      guidelines: FINAL_GUIDELINES.map((g) => ({ ...makeGuidelineItem(), ...g })),
    });

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
            checked={data.advancedEnabled}
            onCheckedChange={(v) => update({ advancedEnabled: v })}
            aria-label="Incluir protocolo avançado"
          />
        </label>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* Mandatory */}
        <BucketEditor
          icon={<ShieldCheck className="h-3 w-3 text-gold" />}
          title="Suplementos — Obrigatórios"
          items={data.mandatory}
          badge="Obrigatório"
          onChange={(id, patch) => updateItem("mandatory", id, patch)}
          onRemove={(id) => removeItem("mandatory", id)}
          onAdd={() => addItem("mandatory")}
          onReset={() => resetBucket("mandatory")}
        />

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

        {/* Advanced */}
        {data.advancedEnabled && (
          <div className="border-t border-border/60 pt-6">
            <BucketEditor
              icon={<FlaskConical className="h-3 w-3 text-gold" />}
              title="Prescrição clínica avançada"
              hint="Protocolo complementar — deve ser personalizado conforme exames laboratoriais."
              items={data.advanced}
              onChange={(id, patch) => updateItem("advanced", id, patch)}
              onRemove={(id) => removeItem("advanced", id)}
              onAdd={() => addItem("advanced")}
              onReset={() => resetBucket("advanced")}
            />
          </div>
        )}

        {/* Final guidelines */}
        <div className="border-t border-border/60 pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Orientações finais
            </p>
            <button
              type="button"
              onClick={resetGuidelines}
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" />
              Repor padrão
            </button>
          </div>
          <ul className="mt-3 space-y-3">
            {data.guidelines.map((g) => (
              <li
                key={g.id}
                className="rounded-sm border border-border/70 bg-background/60 p-3"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={g.title}
                      onChange={(e) => updateGuideline(g.id, { title: e.target.value })}
                      placeholder="Título"
                      className="h-8 font-medium"
                      maxLength={80}
                    />
                    <Textarea
                      value={g.text}
                      onChange={(e) => updateGuideline(g.id, { text: e.target.value })}
                      placeholder="Texto"
                      rows={2}
                      maxLength={500}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeGuideline(g.id)}
                    aria-label="Remover orientação"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addGuideline}
            className="mt-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar orientação
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BucketEditor({
  icon,
  title,
  hint,
  items,
  badge,
  onChange,
  onRemove,
  onAdd,
  onReset,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  items: PrescriptionItem[];
  badge?: string;
  onChange: (id: string, patch: Partial<PrescriptionItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onReset: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {icon}
          {title}
        </p>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" />
          Repor padrão
        </button>
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
      <ul className="mt-3 space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-sm border border-border/70 bg-background/60 p-3"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <div className="grid gap-2 sm:grid-cols-[1fr,1fr]">
                  <Input
                    value={item.name}
                    onChange={(e) => onChange(item.id, { name: e.target.value })}
                    placeholder="Nome do suplemento"
                    className="h-8 font-medium"
                    maxLength={80}
                  />
                  <Input
                    value={item.dose}
                    onChange={(e) => onChange(item.id, { dose: e.target.value })}
                    placeholder="Dose / posologia"
                    className="h-8"
                    maxLength={120}
                  />
                </div>
                <Textarea
                  value={item.note ?? ""}
                  onChange={(e) => onChange(item.id, { note: e.target.value })}
                  placeholder="Observação (opcional)"
                  rows={1}
                  maxLength={240}
                  className="min-h-[36px]"
                />
                {badge && (
                  <span className="inline-block rounded-sm border border-gold bg-gold/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-gold">
                    {badge}
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => onRemove(item.id)}
                aria-label="Remover item"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onAdd}
        className="mt-3"
      >
        <Plus className="h-3.5 w-3.5" />
        Adicionar item
      </Button>
    </div>
  );
}
