# Aviso automático `anamnese_recebida` ao Jornada AI — fila persistente

Data: 20/09/2026 · Estado: **implementado na prévia, desativado**. Nada publicado; nenhum evento real enviado nesta implementação.

## O que faz

Quando uma anamnese é **definitivamente confirmada** (`anamnesis_submissions.accepted = true`), um gatilho no banco coloca na fila um aviso administrativo. Um trabalhador no servidor envia ao Jornada AI o mesmo envelope assinado de 14 campos já usado pela ferramenta manual (`anamnese_recebida`). Nenhuma resposta clínica, medida, exame, e-mail ou telefone é enviado. Nenhuma mensagem é disparada ao paciente, nenhuma etapa/oportunidade/campanha é alterada e nenhum contato é criado.

## Componentes

| Camada | Objeto |
| --- | --- |
| Fila | schema privado `jornada_events` (`config`, `outbox`), sem acesso para visitantes ou utilizadores autenticados |
| Enfileiramento | `public.jornada_enqueue_anamnese()` + gatilho AFTER INSERT em `anamnesis_submissions` (sem rede, falhas engolidas para nunca bloquear o salvamento) |
| Reserva/conclusão | `jornada_outbox_claim` e `jornada_outbox_complete` (somente `service_role`), com lease, fencing por token e recuo exponencial 60 s → 3600 s, até 8 tentativas |
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
