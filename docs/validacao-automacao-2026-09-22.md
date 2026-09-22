# Validação independente do aviso automático — 22/09/2026

## Escopo e destino

Projeto existente BioReport Studio, `26a42c4a-b53d-4fa2-b737-3b14bf0e0665`, domínio `https://jf-bio-insight.lovable.app`. Subconta configurada `ok2UHC2QMZsd8UHsAgEa`. O evento administrativo usa o receptor existente do Jornada AI. Nenhum resumo clínico é enviado ao CRM e a confirmação manual das ferramentas MCP foi preservada.

## Implementação revisada

- Confirmação persistida enfileira identificadores na mesma transação, por gatilho. Rascunhos não enfileiram. Falhas da fila não abortam a anamnese; reconciliação recupera confirmações elegíveis ausentes.
- Marca da primeira ativação evita reprocessar histórico; pausa preserva registros e a marca. Retomada inclui pendências elegíveis desde essa primeira ativação.
- Reserva concorrente usa bloqueio de linha, lease, limite de tentativas e backoff. Queda na última tentativa vira intervenção, com reenvio administrativo preservando o mesmo identificador de evento.
- O despertador não contém identificadores de pacientes nem credencial permanente. Só uma prova distinta do servidor autoriza reserva, renovação e conclusão, com finalidade, escopo, prazo e nonce único.
- Lotes limitados a dois envios de até 15 segundos, para caber na chamada periódica de 55 segundos. Sucesso só é contado após o recibo persistido na origem.
- A tela Agendamentos separa recebimento clínico da sincronização e inclui “Envios administrativos”, independente dos filtros e da disponibilidade da agenda GHL.

## Evidência local independente

321 verificações Vitest e 78 verificações Node passaram. Dois testes complementares executaram as migrações reais em PostgreSQL local isolado: 27 verificações da fila e 21 da cadeia worker/receptor. Somente as interfaces de cron, HTTP e vault foram substituídas; as funções SQL, worker TypeScript, assinatura e receptor foram executados de fato. Isso não equivale a prova do cron ou HTTP no ambiente publicado.

Cobertura: confirmação/rollback/rascunho, repetição da mesma confirmação, concorrência, acesso admin, isolamento entre subcontas e organizações, prova vencida/repetida/de finalidade trocada, wake-up incapaz de ler IDs, indisponibilidade, reserva abandonada, queda na última tentativa, reconciliação, recuperação manual e timeout depois da gravação no receptor. O último cenário terminou com um evento, uma auditoria, zero mensagens e zero execuções de automação no receptor.

Artefatos locais da revisão ficam em `.auto-anamnese-20260922/qa` no workspace de trabalho: `outbox-database.test.mjs`, `worker-receiver.test.mjs`, seus resultados JSON e `build.log`. A fixture é inteiramente sintética.

## Operação e recuperação

Em **Agendamentos → Aviso automático ao Jornada AI**, verificar situação, configuração e execução periódica. Em **Envios administrativos**, abrir a consulta indicada para conferir os IDs persistidos. Vínculo ausente/ambíguo exige correção verificada, nunca aproximação por nome. Depois da correção ou recuperação do destino, usar **Recolocar na fila**. Falhas transitórias recebem tentativas automáticas; “precisa de intervenção” não promete novas tentativas até ação do administrador.

O job nativo `jornada-outbox-tick` executa `select public.jornada_outbox_tick();` a cada cinco minutos. A fila não depende de navegador aberto. Não usar a ferramenta de envio clínico ao GHL para destravar esta integração.

## Reversão sem apagar dados

1. Pausar o aviso na tela; se a tela estiver indisponível, operador autorizado pode definir `enabled=false` na linha singleton de `jornada_events.config`.
2. Desativar o job `jornada-outbox-tick` se for necessário interromper também a reconciliação técnica.
3. Restaurar no Lovable a versão publicada anterior à mudança (`adca99a5031726553d9069fb78f7ed50eaf00eb7`) e publicar essa versão.
4. Preservar migrações aditivas, outbox, recibos, pacientes e anamneses. Não apagar filas nem redefinir a marca da primeira ativação. Antes de retomar, verificar configuração e reativar o job; o identificador estável evita novo efeito de eventos já recebidos.

## Limites de evidência e plataforma

A extensão pg_net instalada segue redirects e possui permissões técnicas administradas pela plataforma. Não se baseia a proteção no sigilo da fila HTTP: o corpo do despertador contém somente uma prova curta de despertar, sem poder de consulta/reserva. A entrega do evento clínico-administrativo recusa redirects e valida o recibo esperado.

Publicação, ativação e validação do fluxo pela interface devem ser registradas separadamente no relatório de execução; aprovação de testes locais não comprova esses passos.
