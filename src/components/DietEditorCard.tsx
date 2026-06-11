import { useMemo, useState } from "react";
import { Plus, RotateCcw, Trash2, UtensilsCrossed, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DIETA_BASE_DR_JOAO } from "@/lib/diet-base";
import {
  applyDietCustomization,
  MAX_CUSTOM_ITEM_LABEL,
  makeBlockKey,
  newCustomItemId,
  type DietBlockKey,
} from "@/lib/diet-customization";
import {
  MAX_EXTRA_MEALS,
  MAX_EXTRA_MEAL_NAME,
  newExtraItemId,
} from "@/lib/extra-meals";
import { useReportStore } from "@/store/report-store";


export function DietEditorCard() {
  const customization = useReportStore((s) => s.dietCustomization);
  const removeDietItem = useReportStore((s) => s.removeDietItem);
  const addDietItem = useReportStore((s) => s.addDietItem);
  const resetAllDietCustomization = useReportStore(
    (s) => s.resetAllDietCustomization,
  );
  const extraMeals = useReportStore((s) => s.extraMeals);
  const addExtraMeal = useReportStore((s) => s.addExtraMeal);
  const removeExtraMeal = useReportStore((s) => s.removeExtraMeal);
  const updateExtraMeal = useReportStore((s) => s.updateExtraMeal);
  const addExtraMealItem = useReportStore((s) => s.addExtraMealItem);
  const removeExtraMealItem = useReportStore((s) => s.removeExtraMealItem);

  const merged = useMemo(
    () => applyDietCustomization(DIETA_BASE_DR_JOAO, customization),
    [customization],
  );

  const hasAnyOverride =
    Object.values(customization).some(
      (o) => (o?.removedIds.length ?? 0) > 0 || (o?.added.length ?? 0) > 0,
    ) || extraMeals.length > 0;

  const canAddExtra = extraMeals.length < MAX_EXTRA_MEALS;

  return (
    <Card className="border-gold/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 font-serif text-lg">
            <UtensilsCrossed className="h-4 w-4 text-gold" />
            Editar itens da dieta
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Remova ou adicione opções por bloco. Refeições, horários e regras
            gerais permanecem fixos.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!hasAnyOverride}
          onClick={resetAllDietCustomization}
          className="shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restaurar dieta base
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {merged.meals.map((meal) => (
          <div key={meal.id} className="border-l-2 border-gold/60 pl-4">
            <h4 className="font-serif text-base text-foreground">
              {meal.name} <span className="text-gold">– {meal.time}</span>
            </h4>
            <div className="mt-3 space-y-4">
              {meal.blocks.map((block) => {
                const key = makeBlockKey(meal.id, block.id);
                if (!key) return null;
                return (
                  <BlockEditor
                    key={block.id}
                    blockKey={key}
                    title={block.title}
                    options={block.options.map((o) => ({
                      id: o.id,
                      label: o.label,
                      isCustom: o.category === "free" && o.id.startsWith("custom_"),
                    }))}
                    onRemove={(id) => removeDietItem(key, id)}
                    onAdd={(label) =>
                      addDietItem(key, { id: newCustomItemId(), label })
                    }
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* Refeições adicionais */}
        <div className="space-y-4 border-t border-border/60 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
                Refeições adicionais (opcional)
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Até {MAX_EXTRA_MEALS} refeições extras com nome, horário e itens
                livres. Entram no plano alimentar e no PDF.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addExtraMeal}
              disabled={!canAddExtra}
              className="shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar refeição
            </Button>
          </div>

          {extraMeals.length === 0 ? (
            <p className="text-xs italic text-muted-foreground">
              Nenhuma refeição extra. Use o botão acima para adicionar.
            </p>
          ) : (
            extraMeals.map((meal, idx) => (
              <ExtraMealEditor
                key={meal.id}
                index={idx}
                name={meal.name}
                time={meal.time}
                items={meal.items}
                onChangeName={(v) => updateExtraMeal(meal.id, { name: v })}
                onChangeTime={(v) => updateExtraMeal(meal.id, { time: v })}
                onRemove={() => removeExtraMeal(meal.id)}
                onAddItem={(label) =>
                  addExtraMealItem(meal.id, { id: newExtraItemId(), label })
                }
                onRemoveItem={(itemId) => removeExtraMealItem(meal.id, itemId)}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type ExtraMealEditorProps = {
  index: number;
  name: string;
  time: string;
  items: { id: string; label: string }[];
  onChangeName: (v: string) => void;
  onChangeTime: (v: string) => void;
  onRemove: () => void;
  onAddItem: (label: string) => void;
  onRemoveItem: (id: string) => void;
};

function ExtraMealEditor({
  index,
  name,
  time,
  items,
  onChangeName,
  onChangeTime,
  onRemove,
  onAddItem,
  onRemoveItem,
}: ExtraMealEditorProps) {
  const [value, setValue] = useState("");
  const ordinal = 4 + index; // 4ª, 5ª, 6ª

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAddItem(trimmed.slice(0, MAX_CUSTOM_ITEM_LABEL));
    setValue("");
  };

  return (
    <div className="rounded-sm border border-gold/30 bg-gold/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="font-serif text-sm text-foreground">
          {ordinal}ª Refeição{" "}
          <span className="text-xs font-sans text-muted-foreground">
            (extra)
          </span>
        </p>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-sm p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remover refeição extra"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px]">
        <Input
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          maxLength={MAX_EXTRA_MEAL_NAME}
          placeholder="Nome (ex.: Lanche da tarde)"
          className="h-8 text-sm"
        />
        <Input
          type="time"
          value={time}
          onChange={(e) => onChangeTime(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
          Itens (livre)
        </p>
        {items.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {items.map((opt) => (
              <li
                key={opt.id}
                className="inline-flex items-center gap-1 rounded-sm border border-gold/60 bg-gold/10 px-2 py-1 text-xs text-foreground"
              >
                <span>{opt.label}</span>
                <button
                  type="button"
                  onClick={() => onRemoveItem(opt.id)}
                  className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`Remover ${opt.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs italic text-muted-foreground">
            Nenhum item ainda — adicione abaixo.
          </p>
        )}

        <div className="mt-2 flex gap-2">
          <Input
            value={value}
            onChange={(e) =>
              setValue(e.target.value.slice(0, MAX_CUSTOM_ITEM_LABEL))
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            maxLength={MAX_CUSTOM_ITEM_LABEL}
            placeholder="Adicionar item..."
            className="h-8 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAdd}
            disabled={!value.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>
      </div>
    </div>
  );
}


type BlockEditorProps = {
  blockKey: DietBlockKey;
  title: string;
  options: { id: string; label: string; isCustom: boolean }[];
  onRemove: (id: string) => void;
  onAdd: (label: string) => void;
};

function BlockEditor({ title, options, onRemove, onAdd }: BlockEditorProps) {
  const [value, setValue] = useState("");

  const handleAdd = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed.slice(0, MAX_CUSTOM_ITEM_LABEL));
    setValue("");
  };

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gold">
        {title}
      </p>

      {options.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {options.map((opt) => (
            <li
              key={opt.id}
              className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs ${
                opt.isCustom
                  ? "border-gold/60 bg-gold/10 text-foreground"
                  : "border-border bg-background text-foreground"
              }`}
            >
              <span>{opt.label}</span>
              <button
                type="button"
                onClick={() => onRemove(opt.id)}
                className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Remover ${opt.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs italic text-muted-foreground">
          Bloco vazio — adicione pelo menos um item ou restaure a dieta base.
        </p>
      )}

      <div className="mt-2 flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_CUSTOM_ITEM_LABEL))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          maxLength={MAX_CUSTOM_ITEM_LABEL}
          placeholder="Adicionar item..."
          className="h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!value.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
