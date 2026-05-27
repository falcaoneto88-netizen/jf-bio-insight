## Patch mínimo — corrigir erro na geração do PDF

Escopo cirúrgico, sem refator, sem alterar IA/dieta/prescrição/rotas/upload.

### 1. `src/lib/pdf/ReportDocument.tsx`
- Remover os dois blocos `Font.register` (Inter e PlayfairDisplay) e o `import { Font }`.
- Substituir `fontFamily: "Inter"` → `fontFamily: "Helvetica"` no estilo `page`.
- Substituir `fontFamily: "PlayfairDisplay"` → `fontFamily: "Helvetica-Bold"` em todos os estilos que usam (`brandName`, `pageTitle`, `sectionTitle`, `mealTitle`, `guidelineTitle`).
- Trocar `"kg/m²"` por `"kg/m2"` no DataRow do IMC (linha 506) — Helvetica não tem o glyph `²`.
- Preservar todo o restante: paleta, espaçamentos, hierarquia, bordas, layout das 5 páginas, disclaimer da página 5.

### 2. `src/store/report-store.ts`
- Adicionar `version: 1` à config do `persist`.
- Adicionar `migrate: (persistedState, version) => version < 1 ? { file: null, bodyComposition: null, clinicalData: null } : persistedState` para descartar drafts antigos incompatíveis.
- Normalizar `partialize` para garantir que arrays históricos nunca sejam `undefined` ao reidratar (defensivo).

### 3. Fallbacks defensivos mínimos
- Em `src/routes/review.tsx` linhas 292-294: trocar `bc.weightHistory.length` etc. por `(bc.weightHistory ?? []).length` (guarda contra drafts legados antes do migrate rodar).
- No PDF, a função `fmt()` já trata `null/undefined` retornando `"—"`. Mantida.

### 4. Não tocar
- `handleGenerate` em `review.tsx` (mantém try/catch atual).
- `diet-adjuster.ts`, `prescription-data.ts`, `diet-base.ts`, `body-classifier.ts`.
- `bioimpedance.functions.ts`, `report-history.ts`.
- Rotas, BrandHeader, Stepper, tokens em `styles.css`.
- Estrutura das 5 páginas do PDF.

### Arquivos alterados (final)
1. `src/lib/pdf/ReportDocument.tsx`
2. `src/store/report-store.ts`
3. `src/routes/review.tsx` (apenas 3 linhas defensivas)

### Observação visual
Com Helvetica, os títulos perdem o serif do Playfair — o PDF fica "clínico limpo" em vez de "editorial premium". Patch focado em destravar a geração; se quiser recuperar o serif depois, abrimos segundo patch empacotando `.ttf` local em `src/assets/fonts/`.

### Após aplicar
Limpar `localStorage.removeItem('jf-bioreport-draft')` no navegador uma vez para descartar qualquer draft persistido antes do migrate.