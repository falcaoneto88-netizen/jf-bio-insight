## Objetivo

Adicionar logs de diagnóstico antes da chamada `pdf()` para confirmar o conteúdo de `reportOptions.sections` no momento da geração do PDF. **Apenas logs, zero mudança de comportamento.**

## Mudanças

### 1. `src/routes/success.tsx`
Logo antes do `await pdf(...)` (atualmente após o log de `m1.proteina`), adicionar:

```ts
console.log("[PDF] options.sections:", JSON.stringify(reportOptions?.sections));
console.log("[PDF] patientNotes len:", reportOptions?.patientNotes?.length ?? 0);
```

### 2. `src/routes/review.tsx`
Localizar a(s) chamada(s) a `pdf(<ReportDocument ... />)` (linhas ~116 e ~147 segundo diagnóstico anterior) e inserir os mesmos dois `console.log` imediatamente antes de cada uma.

## Validação

1. Recarregar `/success`, clicar "Baixar PDF".
2. Conferir no console o conteúdo de `options.sections`:
   - Se vier com vários `false` → toggles estão desligados no `/review` (não é bug). Fix: re-ligar ou clicar "Gerar novo relatório" (`reset()`).
   - Se vier tudo `true` mas o PDF continuar em branco → bug real em `ReportDocument`, abrir investigação separada.
3. Mesmo teste em `/review` para confirmar paridade entre os dois call sites.

## Não faz parte deste plano

- Nenhuma alteração em `ReportDocument.tsx`, store, ou lógica de toggles.
- Os logs ficam até a causa raiz ser confirmada; remoção será feita em passo posterior.
