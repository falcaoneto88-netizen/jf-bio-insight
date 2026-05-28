## Objetivo
Três correções pequenas e isoladas para deixar o app pronto para teste, sem tocar em IA, dieta, upload, formulário clínico ou lógica de prescrição.

## 1. Normalizar glifos não suportados no `ReportDocument.tsx`

O PDF usa Helvetica (fonte padrão do `@react-pdf/renderer` após removermos as Google Fonts). Helvetica **não** contém vários caracteres comuns no relatório clínico, o que causa glifos faltando ou erro silencioso.

Ação: auditar `src/lib/pdf/ReportDocument.tsx` inteiro e substituir:
- `²` → `2` (ex.: `kg/m²` → `kg/m2`) — já feito no IMC, replicar em qualquer outra ocorrência
- `³` → `3`
- `≥` → `>=`
- `≤` → `<=`
- `–` (en-dash) e `—` (em-dash) → `-`
- `→` → `->`
- `•` (bullet U+2022) → manter apenas se já estiver renderizando; caso contrário trocar por `-`
- Aspas tipográficas `" " ' '` → `" "` / `'`

Sem alterar conteúdo clínico — apenas a forma do caractere.

## 2. Corrigir hidratação em `/history`

`src/routes/history.tsx` lê `localStorage` durante o render inicial, causando o mesmo SSR mismatch do `/success`.

Ação: aplicar o mesmo padrão já usado no `/success`:
- Estado inicial `useState<ReportHistoryEntry[] | null>(null)`
- `useEffect(() => { setEntries(getReportHistory()); }, [])`
- Enquanto `entries === null`, renderizar skeleton/placeholder neutro (mesma estrutura do estado vazio) para evitar mismatch

Sem alterar `src/lib/report-history.ts` nem o layout visual da página.

## 3. Fallback robusto no botão "Baixar PDF" (`/success`)

Hoje, se `pdf().toBlob()` falhar, o usuário só vê `toast.error("Falha ao baixar o PDF")` genérico.

Ação em `src/routes/success.tsx`:
- Capturar a mensagem real do erro e exibir no toast (ex.: `toast.error("Falha ao gerar PDF", { description: err?.message })`)
- Manter o botão habilitado após falha para o usuário poder tentar novamente
- Adicionar `disabled` quando `generatedAt === null` (evita clique no primeiro frame antes do `useEffect`)

Sem alterar a função `handleDownload` em `review.tsx` nem o fluxo de geração.

## Escopo / não-escopo
- **Modificados:** `src/lib/pdf/ReportDocument.tsx`, `src/routes/history.tsx`, `src/routes/success.tsx`
- **Não tocados:** IA, `diet-adjuster.ts`, `diet-base.ts`, `body-classifier.ts`, upload, `clinical-form.tsx`, `review.tsx`, store, rotas de API, autenticação

## Verificação final
- Build passa
- Console sem warnings de hidratação em `/history` e `/success`
- PDF gerado abre sem retângulos pretos ou glifos faltando
- Toast de erro mostra mensagem útil se o download falhar
