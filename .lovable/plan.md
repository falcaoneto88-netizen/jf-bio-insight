## Objetivo

Permitir que o usuário acrescente até **3 refeições adicionais opcionais** além das 3 fixas (1ª/2ª/3ª Refeição). Cada extra é **vazia, editável** (nome, horário e itens livres) e entra no plano alimentar visualizado em `/review` **e no PDF final**, sendo persistida junto com o relatório.

## Comportamento

- Botão **"+ Adicionar refeição"** no card "Editar itens da dieta" (`DietEditorCard`), abaixo das 3 refeições base.
- Limite: até 3 extras (botão desabilita ao atingir).
- Cada extra renderiza um sub-card com:
  - Campo **Nome** (texto, ex.: "Lanche da tarde", até 40 caracteres)
  - Campo **Horário** (input `time`, formato HH:MM)
  - Bloco único de itens livres com chips removíveis + input "Adicionar item..." (mesmo padrão do editor atual)
  - Botão **Remover refeição** (lixeira no topo do card)
- As extras aparecem **após** a 3ª refeição tanto no `DietPlanCard` (visualização) quanto no PDF.
- Nada de gramatura/escalonamento — itens são exibidos como rótulo livre (categoria `free`).

## Mudanças por arquivo

### 1. `src/store/report-store.ts`
- Adicionar tipo `ExtraMeal = { id: string; name: string; time: string; items: CustomFoodItem[] }`.
- Novo campo no estado: `extraMeals: ExtraMeal[]` (default `[]`).
- Constante `MAX_EXTRA_MEALS = 3`.
- Ações:
  - `addExtraMeal()` — push de meal vazia (`name: ""`, `time: ""`, `items: []`) se `< MAX`.
  - `removeExtraMeal(id)`
  - `updateExtraMeal(id, patch: Partial<Pick<ExtraMeal,"name"|"time">>)`
  - `addExtraMealItem(id, item)` / `removeExtraMealItem(id, itemId)`
- Persistir em `partialize`, normalizar no `migrate`/`onRehydrateStorage` (bump `version` para 5; migração trata ausência como `[]`).
- Incluir no `reset()`.

### 2. `src/lib/diet-customization.ts` (ou novo `extra-meals.ts`)
- Helper `normalizeExtraMeals(raw): ExtraMeal[]` — valida tipos, limita 3 itens, trunca labels (60), trunca nome (40), valida `time` no padrão `HH:MM`.
- Helper `newExtraMealId()`.

### 3. `src/lib/diet-adjuster.ts`
- Após construir `meals: AdjustedMeal[]`, anexar extras convertidas em `AdjustedMeal` com um único bloco `{ id: "itens", title: "Itens", pick: "free", options: items como AdjustedFoodOption não-escalonáveis }`.
- Assinatura nova: `adjustDiet(base, ctx, extras?: ExtraMeal[])`.
- IDs das extras: `extra-1`, `extra-2`, `extra-3` (não colidem com `m1/m2/m3`). Renderização ignora bloco vazio.

### 4. `src/routes/review.tsx`
- Ler `extraMeals` do store e passar para `adjustDiet`.
- Já é o passo que dispara a renderização do `DietPlanCard` e a geração do PDF — sem outras mudanças.

### 5. `src/components/DietEditorCard.tsx`
- Nova seção "Refeições adicionais" abaixo das 3 fixas:
  - Lista de extras (componente `ExtraMealEditor`)
  - Botão `+ Adicionar refeição` (disabled se `length >= 3`)
- `ExtraMealEditor`:
  - Inputs `name` e `time` ligados ao store
  - Reaproveita o padrão visual do `BlockEditor` para os itens
  - Botão remover (ícone `Trash2`) no header
- `resetAllDietCustomization` deve também limpar `extraMeals` (ou adicionar botão próprio "Remover refeições adicionais"). Decisão: o reset existente passa a chamar também `clearExtraMeals()`.

### 6. `src/components/DietPlanCard.tsx`
- Nenhuma mudança estrutural — itera `diet.meals` e já renderiza qualquer meal extra anexada pelo `adjustDiet`. Validar que `block.pick === "free"` mostra rótulo "(livre)" (já implementado em `pickLabel`).

### 7. `src/lib/pdf/ReportDocument.tsx`
- Nenhuma mudança — a página do plano alimentar itera `diet.meals` e renderiza extras automaticamente. Refeições sem itens ficam ocultas pela checagem `options.length > 0` (a adicionar caso já não exista) para não imprimir cards vazios.

### 8. `src/lib/report-history.ts`
- Incluir `extraMeals` no snapshot salvo do relatório, junto com `dietCustomization`, para que o histórico reflita o plano realmente gerado.

## Validação

- `name`: trim, máx 40 chars
- `time`: regex `^([01]?\d|2[0-3]):[0-5]\d$` (string vazia permitida até o usuário preencher; refeição sem horário exibe apenas o nome)
- `items[].label`: trim, máx 60 chars (mesmo `MAX_CUSTOM_ITEM_LABEL`)
- Máximo 3 refeições extras; máximo 20 itens por refeição extra.

## Fora de escopo

- Sem escalonamento automático de gramas nas extras (são itens livres).
- Sem reordenação/drag-and-drop entre refeições.
- Sem alterar layout das 3 refeições fixas.
- Sem mudanças em autenticação, backend ou RLS.