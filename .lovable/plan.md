# Plano semanal com horários por dia

Nova página "Plano da semana" que mostra, de segunda a domingo, todas as refeições do plano do paciente (incluindo as refeições extras) com os horários editáveis dia a dia — sem precisar de abrir o ecrã de revisão.

## O que muda para si

- Novo separador/página `/semana` acessível a partir do menu e do ecrã de revisão.
- Sete dias lado a lado (em telemóvel: um dia por vez, com setas). Cada dia lista as refeições pela ordem do plano, com nome, horário e os itens já personalizados.
- O horário de cada refeição pode ser alterado só naquele dia (ex.: sábado o pequeno-almoço às 10h00). Um botão restaura o horário padrão da refeição.
- Um botão "Aplicar a todos os dias" copia os horários de um dia para a semana inteira.
- Os itens da dieta continuam a ser editados no ecrã de revisão; aqui só se ajustam horários (evita duplicar lógica).
- No PDF: nova secção opcional "Plano da semana" (ligada/desligada nos toggles das secções), que só imprime quando existe pelo menos um horário diferente do padrão, ou sempre que estiver ligada — por omissão desligada.

## Estrutura de dados

- Nova chave na store: `weeklyMealTimes: Partial<Record<Weekday, Record<string, string>>>` onde `Weekday = "seg" | "ter" | "qua" | "qui" | "sex" | "sab" | "dom"` e a chave interna é o id da refeição (inclui refeições extras).
- Resolução de horário: `weeklyMealTimes[dia]?.[mealId]` → `mealTimeOverrides[mealId]` → horário base do template. Nada existente muda de significado.
- Ações novas: `setWeeklyMealTime(day, mealId, time)`, `resetWeeklyMealTime(day, mealId)`, `copyDayToWeek(day)`, `resetWeeklyMealTimes()`.
- Persistência: bump para versão 8, migração aditiva (v7 → v8 apenas acrescenta `weeklyMealTimes: {}`), com normalização defensiva de horários (`isValidTime`).

## Ficheiros

Criar
- `src/lib/weekly-plan.ts` — tipo `Weekday`, rótulos, `normalizeWeeklyMealTimes`, `resolveMealTime(...)`, `buildWeeklyPlan(diet, weeklyMealTimes)` que devolve os 7 dias já resolvidos e ordenados por hora.
- `src/routes/semana.tsx` — página com `head()` próprio, monta o plano com o mesmo encadeamento já usado em `/review`: `getDietBaseForGoal` → `applyDietCustomization` → `applyMealTimeOverrides` → `adjustDiet`.
- `src/components/WeeklyPlanGrid.tsx` — grelha dos dias, cartões por refeição, `Input type="time"`, botões de restaurar e "aplicar a todos os dias" (shadcn Card, Input, Button, Tabs para a vista móvel).
- `src/lib/pdf/WeeklyPlanPage.tsx` — a `<Page>` do plano semanal (tabela dia × refeição), no mesmo estilo tipográfico das páginas existentes.

Alterar
- `src/store/report-store.ts` — novo campo, ações, versão 8 + migração.
- `src/components/ReportSectionsCard.tsx` — novo toggle "Plano da semana".
- `src/lib/pdf/ReportDocument.tsx` — nova página opcional, condicionada ao toggle; entra na contagem dinâmica "Página X de N".
- `src/routes/review.tsx` e `src/routes/success.tsx` — passar `weeklyMealTimes` ao `ReportDocument` para que ambos os botões gerem o mesmo PDF.
- `src/routes/__root.tsx` / `Stepper` — ligação para a nova página.

## Notas técnicas

- Um único cálculo do plano ajustado é partilhado entre ecrã e PDF através de `buildWeeklyPlan`, evitando divergência entre `/review` e `/success` (problema já encontrado antes).
- `weekly-plan.ts` não importa de `diet-customization.ts` nem de `extra-meals.ts` de forma cruzada — usa apenas tipos de `diet-base.ts` — para não repetir o ciclo de importação que causou o erro `applyMealTimeOverrides is not a function`.
- Sem alterações a refeições, itens, regras gerais, ajuste de gramas ou às páginas de PDF já existentes.

## Riscos

- A tabela semanal em PDF pode ficar apertada com 7 dias; mitigação: colunas por refeição e linhas por dia, com fonte reduzida e quebra automática de página.
- Migração da store: se `weeklyMealTimes` vier corrompido do armazenamento local, é descartado silenciosamente e volta a `{}`.
