## Objetivo

Permitir escolher quais secções entram no PDF e adicionar dois blocos de texto editáveis na revisão. Implementação em **2 steps** com paragem entre eles.

O PDF é gerado via `@react-pdf/renderer` (`pdf().toBlob()` → download). **Não é `window.print()` do DOM**, portanto a visibilidade é controlada por *flags* passadas ao `ReportDocument`, e o painel de seleção fica apenas na UI da revisão — nunca chega ao PDF.

---

## Decisões finais

- **"Observações clínicas" → NOTA INTERNA APENAS.** Aparece só no card da revisão, nunca renderiza no PDF. Não tem toggle de inclusão. Persistida no store para o médico reutilizar entre sessões da mesma revisão.
- **"Notas finais ao paciente" → vai para o PDF** como `<Page>` adicional quando o toggle estiver ligado **e** o texto não estiver vazio.
- **Numeração "Página X de N"** é calculada dinamicamente sobre todas as páginas efetivamente renderizadas (incluindo a de `patientNotes` quando ativa).
- Ideia "Treino → Performance" descartada.

---

## Estado (tipado) — adicionado em `src/store/report-store.ts`

```ts
export type ReportSectionKey =
  | "bioimpedance"
  | "analysis"
  | "dietPlan"
  | "prescription"
  | "finalGuidelines"
  | "patientNotes";

export type ReportOptions = {
  sections: Record<ReportSectionKey, boolean>;
  clinicalNotes: string;   // interno — nunca no PDF
  patientNotes: string;    // sai como <Page> se sections.patientNotes && texto
};

export const defaultReportOptions: ReportOptions = {
  sections: {
    bioimpedance: true, analysis: true, dietPlan: true,
    prescription: true, finalGuidelines: true,
    patientNotes: false,
  },
  clinicalNotes: "",
  patientNotes: "",
};
```

Actions: `setReportSection`, `setAllReportSections`, `setClinicalNotes`, `setPatientNotes`, `resetReportOptions`. Incluído em `partialize`. Migração estendida (`version: 2 → 3`) preenche `reportOptions = defaultReportOptions` quando ausente. `reset()` repõe o default.

---

## Step 1 — Toggles de secções + numeração dinâmica + guarda

**Ficheiros**
- `src/store/report-store.ts` — adicionar `reportOptions` + actions + migração v3 (com a shape completa acima; campos de notas ficam dormentes no Step 1).
- `src/components/ReportSectionsCard.tsx` (novo) — apenas a lista de toggles, sem Textareas ainda.
- `src/lib/pdf/ReportDocument.tsx` — aceitar `options?: ReportOptions` (default = tudo true para `history.tsx` não partir); envolver cada `<Page>` num `{options.sections.<x> && ( … )}`; calcular `total = enabledSections.length` e `index` por ordem; substituir `"Página X de 5"` hardcoded por `"Página ${i} de ${total}"`. Não criar ainda a página de `patientNotes`.
- `src/routes/review.tsx` — montar `<ReportSectionsCard />` logo abaixo do `Stepper`/`ReturnVisitBadge`; ler `reportOptions` e passar ao `ReportDocument`; antes de chamar `pdf()`, se nenhuma secção estiver ligada → `toast.error("Selecione pelo menos uma secção do relatório")` e abortar.

**shadcn usado**: `Card`, `Switch`, `Label`, `Button` (todos já instalados). Ícone `ListChecks` de `lucide-react`.

**PARAR aqui para revisão.**

---

## Step 2 — Blocos de texto livre

**Ficheiros**
- `src/components/ReportSectionsCard.tsx` — acrescentar duas secções:
  - "Observações clínicas (nota interna)" — `Textarea` ligado a `setClinicalNotes`. Sem toggle. Microcopy: "Não aparece no PDF."
  - "Notas finais ao paciente" — `Switch` ligado a `sections.patientNotes` + `Textarea` ligado a `setPatientNotes` (desativado quando o switch está off). Microcopy: "Renderizada como página final do PDF."
- `src/lib/pdf/ReportDocument.tsx` — adicionar a `<Page>` opcional de `patientNotes` no fim da `Document`, com `pageEyebrow`/`pageTitle` "Notas finais" e parágrafos quebrados por `\n`. A numeração dinâmica do Step 1 já a incluirá automaticamente. Só renderiza se `options.sections.patientNotes && options.patientNotes.trim() !== ""`.

**shadcn adicionado**: `Textarea`, `Separator`.

**PARAR aqui para revisão.**

---

## Componentes shadcn (resumo)

`Card`, `CardHeader`, `CardTitle`, `CardContent`, `Switch`, `Label`, `Button` (Step 1) + `Textarea`, `Separator` (Step 2). Todos já presentes no projeto.

---

## "Esconder no print"

Não aplicável: o PDF é construído programaticamente pelo `@react-pdf/renderer`, não a partir do DOM. O `ReportSectionsCard` vive só na revisão e nunca é serializado para o PDF.

---

## Riscos

1. **`history.tsx` regerar PDFs antigos** sem `options` → mitigado pelo default "tudo ligado" no `ReportDocument`.
2. **Numeração dinâmica** substitui strings hardcoded em 5 sítios → fácil regressão visual; validar com vários combos.
3. **Migração v2 → v3** tem de preservar `prescription`; estender, não reescrever.
4. **Gerar com 0 secções** quebraria `@react-pdf/renderer` → bloqueado pela guarda.
5. **Persistência entre pacientes**: `reset()` (botão "Começar novo relatório") repõe `reportOptions` para o default, incluindo os textos livres.

---

## Validação

- Desligar cada secção → não sai no PDF, "Página X de N" bate certo.
- Toggle de "Notas finais" + texto → aparece como última página, N incrementa.
- Toggle ligado mas texto vazio → não cria página fantasma.
- Desligar tudo → toast de erro, sem download.
- "Observações clínicas" preenchidas → nunca aparecem no PDF.
- Recarregar a página → tudo persiste; "Começar novo relatório" repõe o default.

Aguardo passagem para **build mode** para implementar o Step 1.
