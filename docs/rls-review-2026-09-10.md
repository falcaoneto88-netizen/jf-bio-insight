# Revisão RLS — BioReport Studio

> Atualização em 12/09/2026: a proteção equivalente já foi aplicada pelo projeto nas migrações `20260911131740` e `20260911132739`. O catálogo remoto foi revisto e confirmou acesso administrativo, sem acesso anônimo, e 18 relatórios preservados. A proposta abaixo é histórica e foi movida para `docs/sql/20260910180000_restrict_report_access.sql`; não é uma migração pendente.

## Estado confirmado em produção

Consulta somente de leitura realizada em 10/09/2026 pelo conector Lovable no projeto `26a42c4a-b53d-4fa2-b737-3b14bf0e0665`.

- RLS habilitada em `public.reports` e `public.user_roles`.
- `reports`: quatro políticas permissivas para PUBLIC, com condições `true`, cobrindo SELECT, INSERT, UPDATE e DELETE.
- `reports` e `user_roles`: anon e authenticated têm SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES e TRIGGER.
- `user_roles`: política SELECT limita as linhas ao próprio utilizador; não foram encontradas políticas de escrita.
- `has_role`: função SECURITY DEFINER, search_path fixo em public; EXECUTE concedido a authenticated e não a PUBLIC/anon.

Não foram realizadas leituras anónimas de dados clínicos nem operações de escrita em produção. Os resultados acima são do catálogo PostgreSQL. Não foi usado service role para contornar autorização de ferramentas MCP.

## Correção preparada

Base Git: `5ee53c8c192625e24f3475089453a798b46a39a7`.
Branch local: `codex/restrict-report-access`.

`supabase/migrations/20260910180000_restrict_report_access.sql`:

1. Remove todos os privilégios de PUBLIC/anon/authenticated nas duas tabelas.
2. Devolve apenas SELECT/INSERT/UPDATE/DELETE de reports a authenticated, sujeitos à política admin.
3. Devolve apenas SELECT de user_roles a authenticated, preservando a política de leitura do próprio papel.
4. Substitui as quatro políticas públicas de reports por uma política que exige `has_role(auth.uid(), 'admin')` para linhas existentes e novas.

A transação não altera relatórios nem papéis. Não modifica a função has_role, os privilégios de service_role, ficheiros gerados ou configuração OAuth. A migração não foi aplicada nem enviada ao GitHub.

## Impacto e dependência antes de aplicar

A aplicação atual acede ao histórico diretamente com o cliente Supabase do navegador. Não há entrada normal de login fora da tela de consentimento OAuth. Após aplicar a migração:

- visitante sem sessão não poderá ler nem guardar relatórios;
- utilizador autenticado sem admin não poderá ler nem guardar relatórios;
- admin autenticado continuará autorizado no banco;
- a atribuição inicial de admin mantém o fluxo já existente na aplicação.

Antes da aplicação em produção, preparar uma entrada de login explícita e mensagens de sessão/acesso negado no histórico e na gravação. A restrição a admins foi escolhida conforme o requisito original. Não usar políticas públicas como fallback de compatibilidade.

Confirmar novamente as políticas imediatamente antes de aplicar, pois uma nova política permissiva criada entretanto pode ampliar acesso. Não aplicar automaticamente este ficheiro num ambiente com políticas divergentes sem revisão.

## Validação local

22 verificações passaram com PostgreSQL em memória (PGlite 0.3.14), migrações reais do repositório e três utilizadores fictícios. O teste reproduz os grants observados em produção antes de aplicar a correção.

Cobertura: leitura pública antes da correção; bloqueio anónimo de CRUD; invisibilidade e bloqueio de escrita para não-admin e identidade ausente; CRUD de admin; leitura do próprio papel; bloqueio da autoatribuição de admin; ausência de TRUNCATE; funcionamento de has_role; preservação dos dados iniciais.

O teste simula auth.uid() a partir de uma variável de sessão; não valida emissão de JWT, transporte HTTP, UI nem políticas adicionais fora das duas tabelas. Não substitui a validação integrada após publicação.

Para reproduzir sem instalar dependências na aplicação, a partir da raiz do repositório:

```sh
validation_dir=$(mktemp -d /private/tmp/bioreport-rls.XXXXXX)
npm install --prefix "$validation_dir" --no-audit --no-fund --ignore-scripts @electric-sql/pglite@0.3.14
cp supabase/tests/report-access.mjs "$validation_dir/verify.mjs"
node "$validation_dir/verify.mjs" "$PWD"
```

## Consulta de revisão (somente leitura)

```sql
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('reports', 'user_roles');

SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('reports', 'user_roles')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated');
```

Etapas independentes implementadas localmente após autorização: identificação/deduplicação na evolução, sanitização de erros GHL e reforço do Zod. Não foram publicadas e não fazem parte desta migração RLS. Consulte `docs/mcp-hardening-2026-09-10.md` para mudanças de contrato e validação.
