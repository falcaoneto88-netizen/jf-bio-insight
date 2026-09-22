# Aviso automático `anamnese_recebida` ao Jornada AI — fila persistente

Data: 22/09/2026 · Estado: **implementado na prévia, desativado**. Nada publicado; nenhum evento real enviado nesta implementação.

## O que faz

Quando uma anamnese é **definitivamente confirmada** (`anamnesis_submissions.accepted = true`), um gatilho no banco coloca na fila um aviso administrativo. Um trabalhador no servidor envia ao Jornada AI o mesmo envelope assinado de 14 campos já usado pela ferramenta manual (`anamnese_recebida`). Nenhuma resposta clínica, medida, exame, e-mail ou telefone é enviado. Nenhuma mensagem é disparada ao paciente, nenhuma etapa/oportunidade/campanha é alterada e nenhum contato é criado.

## Componentes

| Camada | Objeto |
| --- | --- |
| Fila | schema privado `jornada_events` (`config`, `outbox`), sem acesso para visitantes ou utilizadores autenticados |
| Enfileiramento | `public.jornada_enqueue_anamnese()` + gatilho AFTER INSERT em `anamnesis_submissions` (sem rede, falhas engolidas para nunca bloquear o salvamento) |
| Reserva/conclusão | `jornada_outbox_claim_signed`, `jornada_outbox_renew_signed` e `jornada_outbox_complete_signed` (assinatura de finalidade, uso único, 2 min; bilhete de reserva curto renovado a cada envio; sem `service_role`), com fencing por token e recuo exponencial 60 s → 3600 s, até 8 tentativas; esgotadas viram `exhausted` |
| Reconciliação | `jornada_events.reconcile` chamada por `jornada_outbox_tick`: recupera confirmações elegíveis desde a **primeira ativação** na mesma clínica e devolve à fila reservas `sending` vencidas; nunca alcança histórico anterior |
| Trabalhador | `src/lib/jornada-events/outbox.server.ts` + `src/lib/jornada-events/outbox.ts` (núcleo puro) |
| Endereço interno | `POST /api/public/hooks/jornada-outbox`, autenticado por credencial guardada no cofre do banco (`vault`), verificada por `jornada_worker_auth` |
| Batida periódica | `jornada_outbox_tick()` — só chama o trabalhador quando o aviso está ativo **e** existe item vencido na fila |
| Administração | `obterAvisoJornada`, `configurarAvisoJornada`, `reenviarAvisoJornada` (admin autenticado) e coluna de sincronização em `/agendamentos` |

Chave única `(event_type, record_id, scope_location_id)`: uma anamnese gera no máximo um aviso. O `event_id` enviado é sempre `anamnese_recebida:<record_id>`; repetir é idempotente e o Jornada AI responde `duplicate`, que a fila trata como confirmado.

## Regras de vínculo (nenhuma adivinhação)

O envio só ocorre com a cadeia persistida completa: submissão confirmada → consulta → paciente com identificador válido → **exatamente um** contato vinculado na subconta configurada → convite correspondente (quando a resposta veio por convite), não revogado e do mesmo contato/consulta. Qualquer divergência vira **pendência de vínculo** (`blocked`), visível ao administrador, sem envio e sem apagar registros.

## Ativação

1. Confirmar `Anamnese pelo GHL` ativo (define a subconta).
2. Em `/agendamentos`, usar **Ativar aviso automático**. A ativação só vale para anamneses confirmadas a partir daquele instante — pacientes históricos nunca são reprocessados.
3. Ativar a batida periódica: `update cron.job set active = true where jobname = 'jornada-outbox-tick';` (criada desativada).

## Reversão

- Pausar: **Pausar aviso automático** na página (a fila é preservada).
- Parar a batida: `update cron.job set active = false where jobname = 'jornada-outbox-tick';`
- Parada total: `alter table public.anamnesis_submissions disable trigger jornada_enqueue_anamnese_trigger;`

Nada é apagado em nenhum desses passos.

## Verificação executada

- 22 testes sintéticos novos (`src/lib/jornada-events/outbox.test.ts`): cadeia válida com e sem convite; bloqueio por rascunho, registro ausente, consulta ausente, vínculo ausente/ambíguo, vínculo de outra subconta, contato divergente, convite revogado/ausente/de outra consulta, escopo divergente; idempotência do `event_id`; envelope com 14 campos e sem conteúdo clínico; recibo duplicado tratado como confirmado; destino indisponível e recibo inválido viram falha sanitizada (`envio_indisponivel`); falha de leitura vira retentativa; reserva vazia não reprocessa; reserva malformada ignorada; lote limitado; mapeamento das situações exibidas.
- Suíte completa: 300 testes Vitest + 6 arquivos de testes Node, TypeScript e lint sem erros.
- Linter de segurança do banco: nenhum aviso novo introduzido; a função do gatilho deixou de ser chamável por visitantes e por utilizadores autenticados.

## Limites reais

- Não houve execução end-to-end: o aviso está desativado, a batida está inativa e nenhum evento foi enviado nesta implementação.
- Os testes usam dados sintéticos e substitutos do banco; não comprovam os privilégios reais nem o comportamento do gatilho em produção.
- Verificação de gatilho, reserva concorrente e recuo no banco real fica para o teste autorizado após a publicação.

---

# Revisão independente — 22/09/2026 (correção do risco de redirect)

## Achado aceito

`pg_net` 0.20.3 define `CURLOPT_FOLLOWLOCATION = true` (`src/core.c`, linha 97): o despertador do banco **segue redirects**. Verificar o status 3xx da resposta depois do `net.http_post` não impede o reenvio do corpo e dos cabeçalhos ao destino do redirect. Por isso a credencial fixa no cabeçalho `Authorization` foi eliminada.

## O que mudou

1. **Despertador sem credencial e sem IDs de pacientes.** `public.jornada_outbox_tick()` não envia mais cabeçalho de autorização. O corpo passa a ser `{ts, nonce, sig}`, onde `sig = HMAC-SHA256("jornada-outbox-wakeup|<epoch>|<nonce>")` com a chave interna já existente no cofre do banco (`jornada_outbox_worker`) — **nenhuma chave nova é exigida** e o destinatário do evento permanece o mesmo.
2. **Assinatura de finalidade exclusiva, curta e de uso único.** `jornada_events.wakeup_valid()` exige formato, janela de ±120 s, prefixo de finalidade fixo e grava o nonce em `jornada_events.wakeup_nonce` (chave primária) — repetição é recusada. Pior caso de um redirect hostil: o terceiro recebe uma assinatura que só serve para uma reserva, por até 2 minutos, sem nenhuma resposta clínica.
3. **Trabalhador sem service role.** `POST /api/public/hooks/jornada-outbox` usa apenas a chave pública do servidor e duas rotinas estreitas: `jornada_outbox_claim_signed` (verifica a assinatura, reserva com lease/fencing e devolve só a cadeia administrativa) e `jornada_outbox_complete_signed` (autenticada pelo bilhete de reserva, com validação de estado/código/recibo). O trabalhador não lê tabelas diretamente, não guarda segredos e não registra cabeçalhos, corpo ou requisições.
4. **Credencial fixa removida do banco.** `public.jornada_worker_auth(text)` foi apagada.
5. **ACL dos recursos novos.** `jornada_events` continua sem `USAGE` para visitantes/autenticados; `wakeup_nonce` e `wakeup_valid` sem qualquer permissão pública. As duas rotinas assinadas foram revogadas de `public`/`authenticated` e concedidas somente a `anon`, porque a autenticação delas é a assinatura/bilhete, não o perfil.
6. **Envio real inalterado.** O worker continua usando `sendJornadaEvent` (`fetch` com `redirect: "manual"`), que recusa qualquer 3xx.

## Provas executadas (22/09/2026)

- Banco, dados sintéticos: assinatura válida = aceita; **reuso do mesmo nonce = recusado**; assinatura adulterada = recusada; carimbo de 10 min atrás = recusado; mesma chave com outra finalidade = recusada.
- Permissões reais consultadas no catálogo: `anon` **não** pode executar a reserva privilegiada `jornada_outbox_claim`; `authenticated` **não** pode executar as rotinas assinadas; `anon` não tem acesso a `jornada_events.wakeup_nonce`.
- Chamada externa real com a chave pública e assinatura inválida → `42501 DESPERTADOR_INVALIDO` (nenhuma linha reservada).
- Redirects: 5 testes (301/302/303/307/308) confirmam `redirect: "manual"`, uma única requisição por tentativa, recusa do 3xx e nenhuma mensagem com o destino do redirect.
- Fila: 22 testes sintéticos atualizados, incluindo "reserva assinada sem service role e sem leitura direta de tabelas" e "assinatura recusada interrompe o ciclo sem enviar nada". Suíte: 300 Vitest + 78 Node, tipos e compilação sem erros.

## Limite real que permanece

As tabelas técnicas do `net` (`http_request_queue`, `_http_response`) mantêm os `GRANT` a `PUBLIC` criados pela própria extensão. O perfil `postgres` do projeto **não** é membro do dono (`supabase_admin`), então o `REVOKE` não tem efeito — verificado. Mitigação comprovada: o esquema `net` não está exposto na API (`PGRST106 — Only the following schemas are exposed: public, graphql_public`), portanto não é alcançável com a chave pública. O item fica registrado como pendência de plataforma.

Continua valendo: nada publicado, aviso desativado, batida periódica inativa, nenhum evento enviado, nenhum paciente histórico reprocessado, nenhum contato/CRM/mensagem alterado. Pin `@lovable.dev/vite-tanstack-config` restaurado em 2.13.1 (package.json e lockfile).


## Revisão de 22/09/2026 — correções das regressões apontadas

- `jornada_outbox_claim` só reserva com a configuração ativa e no escopo fixado da clínica; escopo divergente é recusado.
- `jornada_outbox_tick` reconcilia ausências e recupera reservas vencidas **sempre**, mesmo quando não há nenhuma linha pendente — uma única linha travada por queda do trabalhador volta a ser processada.
- A conclusão exige reserva viva: bilhete igual **e** prazo vigente.
- O gatilho continua sem derrubar o salvamento da anamnese; qualquer aviso perdido é recuperado pela reconciliação, e a contagem `missing` mostra confirmações elegíveis fora da fila.
- A lista de vínculos usa a contagem completa feita em SQL: lista truncada vira `vinculo_indisponivel`, nunca vínculo único.
- O convite precisa apontar exatamente para a resposta gravada e registrar a confirmação correspondente.
- O painel separa **pausado** de **configuração indisponível** e avisa quando a verificação periódica está desligada.
- Tentativas esgotadas aparecem como falha que exige intervenção, sem prometer nova tentativa programada.

Limites reais: as tabelas técnicas da extensão de rede mantêm o `GRANT PUBLIC` criado pela própria extensão e não podem ser revogadas com o perfil do projeto; o esquema não está exposto na API. Nada foi publicado, ativado ou enviado.
