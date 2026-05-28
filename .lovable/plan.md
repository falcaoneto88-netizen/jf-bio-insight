## Objetivo
Encurtar drasticamente o fluxo quando o paciente já tem relatório anterior: reabrir do histórico, pré-preencher dados clínicos e de bioimpedância, e gerar PDF que **destaca a evolução** (deltas) em relação ao último exame.

Sem backend, sem auth — tudo via `localStorage`, mantendo o padrão atual.

---

## Fase A — Persistir snapshot completo no histórico

Hoje `report-history.ts` salva só metadados (nome, data, objetivo, classificação, nome do arquivo). Para reabrir, precisamos do estado completo.

**Modificado:** `src/lib/report-history.ts`
- Adicionar campos opcionais ao `ReportHistoryEntry`:
  - `bodyComposition: BodyCompositionData`
  - `clinicalData: ClinicalData`
  - `prescription: PrescriptionDraft | null` (já existe da Fase 1)
- Manter compat: entradas antigas sem esses campos continuam aparecendo no `/history`, mas sem botão "Reabrir".

**Modificado:** `src/routes/review.tsx` (no `handleDownload`)
- Ao chamar `addReportToHistory`, incluir `bodyComposition`, `clinicalData`, `prescription` no payload.

---

## Fase B — Reabrir paciente a partir do histórico

**Modificado:** `src/routes/history.tsx`
- Nova coluna "Ações" com botão **"Nova consulta"** (ícone `RefreshCw`) em cada linha que tenha snapshot completo.
- Ao clicar:
  1. Carregar `bodyComposition` + `clinicalData` no `useReportStore`
  2. Guardar referência ao exame anterior: `setPreviousExam(entry)` (novo no store)
  3. Navegar para `/upload` com flag `?return=1` (ou direto para `/clinical-form` — ver decisão abaixo)

**Decisão de fluxo:** pular `/upload` e ir direto para `/body-composition` em modo edição. O usuário ainda pode subir um novo arquivo de bioimpedância depois pelo botão "Trocar arquivo", mas o caminho padrão é: **conferir bioimpedância → conferir clínico → revisar → gerar**.

---

## Fase C — Estado de "exame anterior" no store

**Modificado:** `src/store/report-store.ts`
- Adicionar:
  - `previousExam: ReportHistoryEntry | null`
  - `setPreviousExam(entry)`
  - `clearPreviousExam()`
- Incluir em `persist` (sobrevive a refresh).
- `reset()` também limpa `previousExam`.

---

## Fase D — Indicador visual "Consulta de retorno"

**Novo:** `src/components/ReturnVisitBadge.tsx`
- Badge dourado discreto: "Consulta de retorno · último exame em DD/MM/AAAA"
- Exibido no topo de: `/body-composition`, `/clinical-form`, `/review` quando `previousExam !== null`.
- Botão pequeno "Sair do modo retorno" → `clearPreviousExam()` + toast.

---

## Fase E — Comparativo de evolução no PDF (alto impacto)

**Modificado:** `src/lib/pdf/ReportDocument.tsx`
- Aceitar prop opcional `previousExam: ReportHistoryEntry | null`.
- Se presente, adicionar **bloco "Evolução desde a última consulta"** logo após o resumo de bioimpedância:
  - Tabela compacta com 4 colunas: Indicador | Anterior (DD/MM) | Atual | Δ
  - Indicadores: Peso, % Gordura, Massa Magra Esquelética, Gordura Visceral, IMC
  - Setas direcionais textuais (`v` para baixo, `^` para cima) + cor (verde quando alinhado ao objetivo, âmbar quando contrário). Helvetica não tem ▼▲ — usar caracteres ASCII.
  - Lógica de "alinhado ao objetivo" em `src/lib/evolution-analyzer.ts` (novo, puro), que recebe `mainGoal` + delta e retorna `"positive" | "negative" | "neutral"`.

**Novo:** `src/lib/evolution-analyzer.ts`
- Função pura `compareExams(current, previous, goal)` retornando array de `{ label, previous, current, delta, deltaPct, direction, alignment }`.
- Testável isoladamente, sem dependência de React/PDF.

**Modificado:** `src/routes/review.tsx`
- Passar `previousExam` do store para `<ReportDocument />` e para `pdf().toBlob()`.

---

## Fase F — Ajustes finos no formulário clínico (opcional, dentro do escopo)

**Modificado:** `src/routes/clinical-form.tsx`
- Quando `previousExam` existe, mostrar bloco "Atualizar desde a última consulta" no topo com 3 campos rápidos:
  - "Mudou alguma medicação?" (textarea curta)
  - "Aderência à dieta anterior" (radio: alta/média/baixa)
  - "Aderência ao treino anterior" (radio: alta/média/baixa)
- Esses campos vão para `additionalNotes` (concatenados) — sem mudar o schema de `ClinicalData`.

---

## Arquivos

**Novos:**
- `src/components/ReturnVisitBadge.tsx`
- `src/lib/evolution-analyzer.ts`

**Modificados:**
- `src/lib/report-history.ts` — snapshot completo
- `src/store/report-store.ts` — `previousExam` + setters
- `src/routes/history.tsx` — botão "Nova consulta"
- `src/routes/body-composition.tsx` — badge de retorno
- `src/routes/clinical-form.tsx` — badge + bloco de atualização
- `src/routes/review.tsx` — badge + passar `previousExam` ao PDF + salvar snapshot
- `src/lib/pdf/ReportDocument.tsx` — bloco de evolução

**Não tocados:** IA, `diet-base.ts`, `diet-adjuster.ts`, `body-classifier.ts`, upload, `prescription-data.ts`, autenticação, backend.

---

## Verificação
- Reabrir paciente do `/history` carrega bioimpedância e clínico corretamente
- Badge "Consulta de retorno" aparece nas 3 telas e some ao sair do modo
- PDF mostra bloco de evolução com 5 indicadores e setas corretas (`v`/`^`)
- Verde quando delta alinhado ao objetivo (ex: peso ↓ em "emagrecimento"), âmbar quando contrário
- Entradas antigas do histórico (sem snapshot) continuam visíveis, sem botão "Nova consulta"
- Sair → reset() limpa `previousExam`
- Refresh no meio do fluxo preserva o modo retorno (persist)

---

## Ordem de entrega sugerida
1. Fases A + C (snapshot + store) — base, sem UI ainda
2. Fase B (botão reabrir no histórico) — fluxo funcional ponta a ponta
3. Fase E (comparativo no PDF) — **maior valor clínico**
4. Fase D (badge visual)
5. Fase F (campos de atualização) — opcional, se quiser fechar o ciclo

Posso ir entregando fase por fase para você validar, ou tudo de uma vez. Como prefere?
