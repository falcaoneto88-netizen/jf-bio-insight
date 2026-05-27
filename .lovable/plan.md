## Patch de segurança e consistência visual — JF BioReport

Aplicar as 5 alterações já discutidas, sem refator e sem tocar em lógica de IA/PDF/diet-adjuster/prescription.

### 1. Tokens semânticos de sucesso — `src/styles.css`
- Em `@theme inline`: adicionar `--color-success`, `--color-success-foreground`, `--color-success-soft`.
- Em `:root`: adicionar `--success`, `--success-foreground`, `--success-soft` em `oklch` (verde-clínico dessaturado, alinhado ao tema).
- Em `.dark`: equivalentes para tema escuro.

### 2. Substituir `emerald-*` hardcoded
- `src/routes/upload.tsx` (linhas 215-216): trocar `border-emerald-500/40 bg-emerald-500/10` por `border-success/40 bg-success/10`; `text-emerald-600` → `text-success`.
- `src/routes/body-composition.tsx` (linhas 111-112): mesma substituição.

### 3. Disclaimer em `/review`
Em `src/routes/review.tsx`, inserir um bloco visual logo antes do `<div>` que contém o botão "Gerar relatório" (linha 384), com texto:
> "Conduta sugerida — este relatório deve ser revisado e validado por um profissional antes de ser enviado ao paciente."

Estilo: caixa com borda `gold/40`, fundo `gold-soft/20`, ícone discreto, copy em `text-foreground`.

### 4. Disclaimer no PDF (página 5)
Em `src/lib/pdf/ReportDocument.tsx`, adicionar um `<View>` + `<Text>` após o `.map` de `FINAL_GUIDELINES` (antes de `</Page>` da página 5), usando `styles.paragraphMuted` reduzido, com texto:
> "Relatório gerado como apoio à conduta clínica. As orientações devem ser revisadas e validadas por profissional habilitado antes da entrega ao paciente."

Sem nova fonte, sem novo estilo, sem alterar `PageChrome`, contrato `ReportInput` ou paleta.

### 5. Persistência do Zustand
Em `src/store/report-store.ts`, envolver o `create<ReportState>` com o middleware `persist` de `zustand/middleware`:
- chave: `jf-bioreport-draft`
- storage: `localStorage`
- persistir apenas `file`, `bodyComposition`, `clinicalData`
- `reset()` continua a limpar (o `persist` reescreve automaticamente).

Sem nova dependência — `zustand` já está instalado.

### Arquivos alterados
1. `src/styles.css`
2. `src/routes/upload.tsx`
3. `src/routes/body-composition.tsx`
4. `src/routes/review.tsx`
5. `src/lib/pdf/ReportDocument.tsx`
6. `src/store/report-store.ts`

### Fora do escopo
Nada além disso: sem mexer em rotas, sem Supabase, sem auth, sem refator, sem alterar `bioimpedance.functions.ts`, `diet-adjuster.ts`, `prescription-data.ts`, `body-classifier.ts`, `report-history.ts`.