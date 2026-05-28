## Aviso importante antes de avançar

Escolheu **sem login / acesso partilhado**. Isto significa que qualquer pessoa com o link da app consegue ler, criar e apagar todos os pacientes e relatórios (incluindo nome, idade, dados clínicos e bioimpedância). Para dados clínicos isto **não é recomendado** — se mais tarde quiser ativar login por utilizador, basta pedir e eu adapto as policies. Vou avançar como pediu.

## O que vai mudar

Hoje o histórico vive só em `localStorage` (`src/lib/report-history.ts`). Vou movê-lo para a base de dados da Lovable Cloud, mantendo `localStorage` como cache local e fallback offline.

## Estrutura da base de dados

Uma única tabela `public.reports` (auto-contida, sem joins, simples de consultar):

```text
reports
├── id              uuid (pk)
├── patient_name    text
├── exam_date       text (DD/MM/YYYY como já é guardado)
├── generated_at    timestamptz
├── main_goal       text
├── body_classification text
├── pdf_file_name   text
├── body_composition jsonb   -- snapshot completo
└── clinical_data    jsonb   -- snapshot completo
```

RLS ativo com policies permissivas (`USING (true)` / `WITH CHECK (true)`) para `anon` e `authenticated`, conforme a escolha de acesso partilhado. Grants à Data API para `anon`, `authenticated`, `service_role`.

## Camada de dados

Novo ficheiro `src/lib/report-history.ts` (reescrito) com a mesma API pública atual, mas a falar com a cloud:

- `getReportHistory()` → `select * order by generated_at desc limit 200`
- `addReportToHistory(entry)` → `insert` e devolve a linha
- `clearReportHistory()` → `delete from reports`

A API mantém-se igual, por isso `src/routes/history.tsx` e `src/routes/review.tsx` não precisam de alterações de lógica — só passam a ser `async` onde já são.

## Migração do histórico local

Helper `migrateLocalHistoryToCloud()` chamado uma vez ao abrir `/history`:

1. Lê as entradas atuais de `localStorage` (chave `jf-bioreport-history`).
2. Faz `insert` em bloco na tabela `reports` (idempotente por `id`, usando `upsert on conflict do nothing`).
3. Marca em `localStorage` uma flag `jf-bioreport-history-migrated=true` para não repetir.
4. Mantém os dados antigos em `localStorage` (não apaga) como backup.

## Ficheiros tocados

- **Migração SQL** — criar tabela `reports`, GRANTs, RLS, policies abertas.
- `src/lib/report-history.ts` — reescrito para usar `supabase` em vez de `localStorage`; mesma assinatura pública (com `Promise<...>`).
- `src/lib/migrate-local-history.ts` (novo) — função de migração one-shot.
- `src/routes/history.tsx` — `useEffect` passa a `await getReportHistory()`; chama migração antes; loading state já existe.
- `src/routes/review.tsx` — `addReportToHistory(...)` passa a ser `await`.

## Não tocado

- `prescription-data.ts`, IA, PDF, dieta, formulários clínicos, store zustand, autenticação (continua sem login).
- O resto da app continua a funcionar offline com os dados em memória/zustand; só o histórico passa a ser cloud.

## Verificação

1. Gerar relatório → aparece em `/history` mesmo depois de fechar o browser e abrir noutro dispositivo.
2. Abrir `/history` num browser que já tinha entradas em `localStorage` → entradas antigas aparecem (migradas) e ficam disponíveis para "Nova consulta".
3. "Limpar histórico" remove de toda a gente (acesso partilhado).
4. Sem regressões no fluxo upload → review → success.

Posso avançar com a migração e o código?