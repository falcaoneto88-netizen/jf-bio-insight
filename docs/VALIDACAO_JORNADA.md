# Validação da Jornada Clínica

Estado: **implementação completa em revisão**. Nada foi publicado.

## Automático (neste repositório)

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Tipos | `bunx tsgo --noEmit` | passa |
| Testes da jornada | `bunx vitest run` | 32 testes, todos a passar |
| HTML do fixture | `bun run scripts/export-jornada-html.ts /tmp/jornada-sintetica.html` | 12.469 bytes gerados |

### Achados da revisão anterior, agora cobertos por teste

1. `decimalComma("1.365")` → `1.365` (milhar preservado). TMB usa `integerValue`:
   `1365` → `1.365`, nunca `1,365`. `70,0` e `34,0` mantêm as casas originais.
2. `dateSortKey` rejeita `31/02/2026`, `31/04/2026` e `29/02/2025`, e aceita `29/02/2024`.
3. A tabela de evolução imprime a transcrição literal (`literal.peso`, etc.); os números
   convertidos servem apenas para calcular variações.
4. Duas linhas da mesma data são fundidas célula a célula; nada é perdido e valores
   divergentes aparecem em `conflicts`.

Testes adicionais garantem que o HTML começa em `<!doctype html>`, declara UTF-8, não contém
`<script>` nem `@import`, e não expõe notas internas nem pendências.

## Conversão para PDF

O sandbox de desenvolvimento não tem WeasyPrint instalado, por isso a paginação A4 não foi
reconfirmada aqui. Para validar localmente:

```
bun run scripts/export-jornada-html.ts /tmp/jornada-sintetica.html
weasyprint /tmp/jornada-sintetica.html /tmp/jornada-sintetica.pdf
```

Verificar: cabeçalho e rodapé em todas as páginas, sem texto cortado e sem forçar um número
fixo de páginas.

## Por validar manualmente na aplicação (dados sintéticos)

- [ ] Criar atendimento, sair e voltar: a lista reabre o atendimento certo depois de recarregar.
- [ ] Colar anamnese, organizar com o agente, editar o resultado e confirmar.
- [ ] Substituir o ficheiro do exame: a extração anterior é limpa e a confirmação invalidada.
- [ ] Identidade divergente entre jornada e exame: a revisão bloqueia o avanço.
- [ ] Editar o protocolo depois de aprovar: a aprovação é invalidada e o HTML volta a RASCUNHO.
- [ ] Descarregar o HTML final duas vezes: conteúdo e data idênticos (snapshot aprovado).
- [ ] Tentar aprovar por um assistente ligado ao `/mcp`: deve ser recusado.
- [ ] Fluxo antigo `/upload` → `/review` → PDF continua a funcionar.

## Notas de segurança

- Escritas exclusivamente pelo backend com service role, após sessão + administrador + dono.
- `expectedVersion` em todas as atualizações; hash de conteúdo verificado na aprovação.
- Limite de 40 pedidos de IA por utilizador e por hora.
- O aviso do linter sobre funções `SECURITY DEFINER` executáveis refere-se a `has_role`, que
  precisa de continuar acessível às políticas de acesso; é intencional e já registado.

## Teste de permissões — 11/09/2026

| Cenário | Resultado |
| --- | --- |
| Anónimo lê relatórios (REST, chave pública) | 401 `permission denied for table reports` |
| Anónimo insere relatório | 401, nenhuma linha criada |
| Anónimo apaga relatórios | 401, os 18 registos existentes mantêm-se |
| Conta autenticada sem papel admin | RLS não devolve linhas e a interface mostra aviso de acesso restrito |
| Conta administradora existente | Acesso ao histórico mantido, sem alterações de papéis |
| Extração antiga por IA sem sessão | Recusada com mensagem clara; preenchimento manual disponível |

Consultas de confirmação: `pg_policies` (zero políticas `public`/`anon`) e `pg_class.relacl`
(sem `anon` em `reports`, `user_roles`, `jornadas_clinicas`, `jornada_aprovacoes`,
`journey_ai_usage`).

## Migração de permissões codificada — 11/09/2026

`supabase/migrations/20260911131740_67befdec-0a83-485f-8ca2-4a029bceba1f.sql` reproduz de forma
idempotente a transação já aplicada no banco: `DROP POLICY IF EXISTS` explícito para os quatro
nomes públicos e para os quatro nomes `Administrators ...` antes de os recriar, `REVOKE ALL` de
`PUBLIC`/`anon` e grants mínimos para `authenticated` e `service_role`. Nenhum registo é alterado
e nenhuma permissão pública é recriada; o administrador existente e as ferramentas MCP mantêm o
acesso através de `service_role` e de `has_role(auth.uid(),'admin')`.

## 11/09/2026 — Permissões de escrita da jornada

Achado: `jornadas_clinicas` e `jornada_aprovacoes` tinham grants amplos (anon/authenticated)
e policy de UPDATE ao dono, permitindo forjar `approved_version`/`approved_hash` pelo REST.

Correção codificada em migration idempotente:
- `REVOKE ALL` em ambas as tabelas para `PUBLIC`, `anon`, `authenticated`; apenas `GRANT SELECT`
  a `authenticated` (RLS admin + dono). Escrita exclusiva de `service_role`.
- Removidas policies de INSERT/UPDATE/DELETE do cliente nessas tabelas.
- `REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.reports FROM authenticated`.
- `aprovar_jornada` e `consume_ai_quota` continuam com EXECUTE apenas para `service_role`.

Verificado em base (aclexplode): sem privilégios `anon`/`PUBLIC`; `authenticated` só com SELECT nas
duas tabelas da jornada; `reports` sem TRUNCATE/REFERENCES/TRIGGER para `authenticated`.

Servidor:
- Todo INSERT/UPDATE passa por `core.server.ts` após auth + admin + dono + `expectedVersion`.
- Qualquer edição limpa `approved_version/hash/by/at` e faz recuar o estado de "aprovado".
- A aprovação recalcula o hash do conteúdo atual e exige o SHA-256 do documento efetivamente
  pré-visualizado (`expectedHtmlHash`); documento diferente do revisto é recusado.
- O documento é gerado com data estável da versão (não "hoje"), por isso prévia e ficheiro final
  coincidem byte a byte.
- `approvedSnapshotHtml` valida versão, hash recalculado da jornada e do snapshot, autor igual ao
  titular autenticado, data válida e coerente, metadados (versão/autor/modelo) e o SHA-256 dos bytes
  exatos do HTML guardado. Aprovações antigas sem essa prova exigem nova aprovação — nada é
  fabricado retroativamente.
- Conflitos de valores na mesma data e datas inválidas com valores bloqueiam a aprovação.

### Natureza de cada teste (importante)

- **Unitários com mocks** (`journey-writes.test.ts`, 15 casos): usam um cliente falso que recusa
  escritas, para verificar o *caminho de código* — escrita só por service-role, aprovação forjada
  recusada, edição invalida aprovação, HTML alterado isoladamente recusado, download repetido
  idêntico. **Não** são prova das permissões SQL reais.
- **Verificação real de permissões**: feita por consulta direta ao catálogo da base
  (`aclexplode`), registada na secção acima. É essa consulta, e não os testes unitários, que
  comprova os grants.
- **Unitários puros** (`journey.test.ts`, 18 casos): formatação, datas, evolução, alinhamento de
  tabelas e estrutura do HTML.

Suite total: 33 testes verdes; typecheck limpo. Sem publicação.

### Verificação independente do revisor (registada, não é a nossa suite)

- Reexecução independente dos 32 testes no commit `cfdfb1c`: verdes.
- Prova externa à suite: 1 caso válido + 8 adulterações (HTML alterado isoladamente, dados atuais
  alterados, autor/data/versão/snapshot/hash em falta) — todas bloqueadas; downloads válidos
  idênticos byte a byte.
- Render visual com WeasyPrint 70 sobre fixture sintético: 7 páginas A4, sem texto fora da página.
- Estes resultados são verificação externa do revisor. Não substituem, nem se confundem com, a
  verificação real de grants por consulta SQL ao catálogo, registada acima.

### Isolamento de sessão e de estado de ecrã

- `/_authenticated` monta uma fronteira de sessão: ao terminar sessão ou trocar de utilizador,
  cancela pedidos em curso, limpa todo o cache de consultas (incluindo `["jornada", id]` e listas)
  e remonta a árvore com `key` da sessão, descartando rascunhos e prévias em memória; no logout
  redireciona para `/auth`. Nada clínico é guardado localmente.
- `/jornada/$id` já remonta por `key={id}`; prévias são limpas por versão e respostas obsoletas
  ignoradas.
- `StepAnamnese` e `StepBio` ignoram respostas tardias após desmontagem/troca e libertam o estado
  ocupado ao cancelar.
- `StepHtml` limpa prévia e invalida pedidos pendentes ao mudar de atendimento, de versão ou ao
  desmontar, e mostra o erro de forma visível no ecrã.

