# Horários de refeições editáveis

Hoje cada template (Jejum / Alta Performance / Recomposição) traz horários fixos (ex.: Café 08:00). Vou permitir que o nutricionista edite o horário de cada refeição diretamente no card "Editar itens da dieta", mantendo o horário base como fallback.

## Mudanças

### 1. `src/store/report-store.ts`
- Novo estado `mealTimeOverrides: Record<string, string>` (chave = `mealId`, valor = `"HH:MM"`).
- Ações: `setMealTime(mealId, time)` e `resetMealTime(mealId)`; incluído no `resetAllDietCustomization` e no reset geral do store.
- Bump da versão de persistência → 7 com migração trivial (default `{}`).
- Persistido junto com o restante do relatório (mesmo padrão de `dietCustomization` e `extraMeals`).

### 2. `src/lib/diet-customization.ts`
- Helper `applyMealTimeOverrides(base, overrides)` que devolve um novo `DietBase` com `meal.time` substituído quando houver override válido (`HH:MM`). Não muta a base.
- Validação reaproveita regex de `extra-meals.ts` (extrair para util compartilhado `isValidTime`).

### 3. `src/components/DietEditorCard.tsx`
- Para cada refeição da dieta base, renderizar ao lado do nome um `<Input type="time">` (mesmo estilo dos extras), ligado a `mealTimeOverrides[meal.id] ?? meal.time`.
- Ao editar, chama `setMealTime`. Botão pequeno "restaurar" aparece quando há override.
- "Restaurar dieta base" também limpa overrides de horário (já incluso no reset geral).

### 4. Consumo nos demais lugares
- `DietPlanCard` e `src/lib/pdf/ReportDocument.tsx`: aplicar `applyMealTimeOverrides` antes de renderizar (mesmo ponto onde já se aplica `applyDietCustomization`).
- `review.tsx` / `success.tsx`: passar `mealTimeOverrides` para o snapshot salvo no histórico (`report-history.ts`) para que PDFs antigos mantenham os horários escolhidos.

### 5. Refeições extras
- Já têm horário editável próprio — sem mudança.

## Fora de escopo
- Não mexer na lógica de ajuste de gramas (`diet-adjuster.ts`).
- Não alterar as `generalRules` (ex.: regra de janela do jejum permanece textual).
- Não tornar o nome da refeição editável (só o horário, como pedido).
