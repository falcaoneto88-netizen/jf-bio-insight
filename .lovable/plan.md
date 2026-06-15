## Objetivo

Reduzir os objetivos para 3 e fazer com que **a dieta gerada mude automaticamente conforme o objetivo selecionado** no formulário clínico.

| Objetivo selecionado | Template de dieta carregado |
|---|---|
| Jejum Intermitente | 3 refeições (Quebra do jejum + 2) |
| Alta Performance | 6 refeições (Pré, Pós, Almoço, Lanche, Jantar, Ceia) |
| Recomposição Corporal | 5 refeições (Café, Lanche manhã, Almoço, Lanche tarde, Jantar) |

Edição manual de itens, adição de refeições extras, escalonamento por peso, PDF e histórico continuam funcionando exatamente como hoje.

## Abordagem

**Templates como dados estáticos**, não skills de IA. Cada objetivo vira um arquivo `DietBase` em `src/lib/diet/`. O `adjustDiet` lê o `mainGoal` e escolhe o template — o motor de escalonamento (peso, gordura visceral, baixa massa, etc.) é o mesmo de hoje.

## Mudanças

### 1. `src/store/report-store.ts`
- `MainGoal` passa a `"" | "jejum_intermitente" | "alta_performance" | "recomposicao"`.
- `migrate` (bump `version` → 6): `emagrecimento` / `manutencao` → `recomposicao`; `ganho_massa` → `alta_performance`.

### 2. `src/routes/clinical-form.tsx`
- `<Select>` de objetivo com 3 itens: Jejum Intermitente, Alta Performance, Recomposição Corporal.

### 3. Novos arquivos em `src/lib/diet/`
- `shared-foods.ts` — opções reutilizáveis (frango, tilápia, patinho, arroz, batata-doce, aveia, banana, whey, ovos, iogurte, brócolis, tomate, abobrinha, azeite, etc.) com `baseGrams`/densidades.
- `diet-jejum.ts` — 3 refeições conforme template enviado. Inclui campos `protocol` (default 16/8) e `eatingWindow` (default 12:00–20:00).
- `diet-recomposicao.ts` — 5 refeições. Almoço com bloco carboidrato `pick: "multi"` (escolher 2).
- `diet-alta-performance.ts` — 6 refeições. Horários de pré/pós derivados de `trainingTime` quando preenchido. Hidratação 45–50 ml/kg.

Todos exportam `DietBase` no mesmo formato já consumido pelo `DietEditorCard`, `DietPlanCard` e `ReportDocument`.

### 4. `src/lib/diet-base.ts`
- Vira reexport fino para compatibilidade: `DIETA_BASE_DR_JOAO` aponta para `diet-recomposicao` (snapshots antigos do histórico continuam carregando).
- Adiciona `PickMode = "one" | "all" | "free" | "multi"` e `pickCount?: number` em `MealBlock`.
- `Meal.id` passa de `"m1"|"m2"|"m3"` para `string` (suportar `pre_treino`, `pos_treino`, `cafe`, etc.).

### 5. `src/lib/diet-adjuster.ts`
- Nova `getDietBaseForGoal(goal: MainGoal): DietBase` (default → recomposição).
- `adjustDiet(ctx, extras?)` lê `ctx.mainGoal` e escolhe o template automaticamente.
- Mesmo motor de escalonamento — sem mudança de fórmula.

### 6. `src/components/DietEditorCard.tsx` e `DietPlanCard.tsx`
- Iteram `diet.meals` — sem mudança estrutural.
- Suporte ao `pick: "multi"`: renderizar checkboxes (em vez de radio) com validação leve "escolher N".

### 7. `src/routes/review.tsx` e `src/routes/success.tsx`
- Passam `mainGoal` para `adjustDiet`. Sem outras mudanças.

### 8. Sub-objetivo do jejum (Emagrecimento / Recomposição / Manutenção) + protocolo (12/12…18/6)
- Editáveis dentro do `DietEditorCard` **apenas quando** `mainGoal = jejum_intermitente`.
- Persistidos em `dietCustomization.jejum = { subGoal, protocol, windowStart, windowEnd }`.
- Não adiciona campos no formulário clínico.

## Compatibilidade

- Histórico antigo: snapshots salvam o `diet` final, não o template — continua válido.
- Objetivos removidos do `<Select>` são migrados no rehydrate, sem perda de dados.

## Não inclui

- Skills de IA por objetivo (templates são determinísticos).
- Campos novos no formulário clínico.
- Mudanças em PDF, auth, upload de bioimpedância, histórico.
