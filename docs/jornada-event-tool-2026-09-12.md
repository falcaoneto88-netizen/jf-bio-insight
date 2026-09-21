# Ferramentas BioReport → Jornada AI

Estado em 12/09/2026: implantação concluída e verificada em produção. Os patches foram incorporados nos dois projetos, as duas publicações foram solicitadas via `deploy_project` e `get_project` retorna `is_published=true` em ambos. A migração foi aplicada e a rota pública do Jornada responde 401 sem assinatura, como esperado. A transmissão ainda NÃO está ativada: falta a configuração privada da chave. Nenhum paciente, contato, mensagem ou workflow de produção foi alterado.

## Implantação verificada (12/09/2026)

- Patches incorporados nos dois projetos (BioReport a partir do código publicado em `6f46c30`; Jornada AI a partir do commit `eb4f167f9ee42d814bb2457b3c9a04a0cf4caad3`), preservando alterações remotas posteriores.
- As duas publicações foram solicitadas via `deploy_project`; `get_project` retorna `is_published=true` para BioReport e Jornada AI.
- Migração `20260912160000_bioreport_events.sql` aplicada pelo operador em transação e registrada no `schema_migrations`. As três tabelas têm RLS; anon e authenticated não leem a chave e não têm INSERT direto em eventos.
- Rota pública `/api/public/bioreport-event` do Jornada verificada em produção: `POST {}` sem assinatura respondeu HTTP 401 `{"error":"unauthorized"}`.
- MCP do BioReport em produção recusou `initialize` sem token com o mesmo 401 esperado.
- Manifestos remotos conferidos: BioReport com 12 ferramentas (v0.4.0) e Jornada AI com 7 ferramentas (v0.2.0).
- Banco conferido: zero chaves, zero eventos.
- O conector Jornada existente retornou `[]` ao listar automações — nenhuma automação configurada.
- IMPORTANTE: transmissão NÃO está ativada, porque falta a configuração privada da chave. Chamadas autenticadas das novas ferramentas e o teste completo continuam pendentes.
- A autorização já existe. O bloqueio é operacional — o Chrome não responde e não existe transferência segura de secrets entre projetos na API — não falta de permissão.
- Nenhum paciente, mensagem, contato ou workflow foi alterado por esta implantação.

## Uso após ativação

1. No BioReport, `jornada_preview_consultation` recebe `consultationId` (o parâmetro `id` da URL da Consulta do paciente) e mostra o paciente, os IDs e as datas das anamneses confirmadas e relatórios salvos. Retorna até dez de cada, com indicação de truncamento.
2. Confira o contato existente usando `ghl_find_contact` e confirme com o operador a associação entre paciente, consulta e contato. Não identificar pacientes apenas pelo nome.
3. `jornada_sync_consultation` recebe `consultationId`, `recordId`, `eventType` (`anamnese_recebida` ou `relatorio_disponivel`), `ghlContactId` e `confirm: true`. O servidor valida administrador, consulta e registro persistido antes de enviar.
4. No Jornada AI, `list_bioreport_events` consulta o recebimento por `contact_id`, `consultation_id` e `limit` (1–50). Só administradores da organização leem os eventos.

O envio usa o endpoint fixo `https://jornada-ai-conecta.lovable.app/api/public/bioreport-event`. A confirmação retorna `received` ou `duplicate`, o ID do evento/contato e `messages_sent: 0`. Uma repetição do mesmo registro não cria outro evento, inclusive sob concorrência.

## Dados e segurança

O corpo tem uma lista fechada de 14 campos: versão, origem, destino, identificação pública da chave, organização, location, tipo/ID do evento, consulta, paciente, registro de origem, contato HighLevel e datas. Não inclui nome, telefone, e-mail, respostas, medidas, diagnósticos ou texto do relatório. A identificação da chave não é a chave secreta.

HMAC-SHA256 assina o corpo exato no servidor. A assinatura circula apenas no cabeçalho entre os servidores e não é devolvida pelas ferramentas. O PostgreSQL valida a assinatura novamente, incluindo chamadas diretas pela API. A validade é de cinco minutos, com tolerância de um minuto para relógio adiantado. A chave é um texto hexadecimal minúsculo de 64 caracteres, tratado como texto UTF-8 em ambos os lados.

O receptor usa somente a chave pública/anon do Supabase. Uma função SQL com `SECURITY DEFINER`, escopo fixo e assinatura obrigatória insere o evento; não há service role no caminho novo. As tabelas mantêm RLS, sem escrita direta para anon/authenticated. A chave fica em esquema privado, sem acesso via API. O contato precisa existir, ser real e pertencer à organização/location vinculada. Vínculos de paciente/consulta não são substituídos silenciosamente. Auditoria e evento são atômicos.

Referência do algoritmo: [PostgreSQL pgcrypto — hmac](https://www.postgresql.org/docs/18/pgcrypto.html).

## Estado da ativação

Concluído na implantação de 12/09/2026:

1. Patches revisados incorporados aos dois projetos, preservando alterações remotas posteriores.
2. Migração `20260912160000_bioreport_events.sql` aplicada no Jornada AI (em transação, registrada no `schema_migrations`). `pgcrypto` confirmado no esquema `extensions`.
3. Os dois projetos publicados; descoberta das ferramentas MCP atualizada e manifestos remotos conferidos: BioReport 12 ferramentas (v0.4.0), Jornada AI 7 (v0.2.0).
4. Recusa de pedido sem assinatura verificada em produção (HTTP 401 na rota pública; 401 no MCP sem token).

Pendente (transmissão ainda não ativada):

5. Criar uma chave aleatória exclusiva de 32 bytes, codificada em hexadecimal, em um ambiente privado. Não usar chave GHL/Supabase, não colocar em Git, mensagens, logs, argumentos de linha de comando ou variáveis `VITE_*`.
6. No backend BioReport configurar `BIOREPORT_JORNADA_SIGNING_SECRET`, `BIOREPORT_JORNADA_KEY_ID`, `JORNADA_AI_ORGANIZATION_ID` e o `GHL_LOCATION_ID` existente. Organização/location verificadas: `f07ab3be-7419-4779-a901-ef71c5fc27f0` / `ok2UHC2QMZsd8UHsAgEa`.
7. Cadastrar a mesma chave/identificação no banco do Jornada usando `scripts/configure-bioreport-integration.mjs --apply`, executado pelo operador com variáveis privadas e conexão `JORNADA_DATABASE_URL`. O script usa parâmetros SQL, TLS verificado em produção, não imprime credenciais e não substitui uma chave divergente. O receptor também precisa da URL e chave pública Supabase já usadas pelo projeto.
8. Validar primeiro a consulta de eventos vazia e a recusa de pedido sem assinatura por um chamador autenticado. Só transmitir um evento real após confirmar o paciente/contato com o operador.

O script privado de configuração e os passos restantes acima são preservados como estão. O bloqueio atual é operacional (transferência segura da chave entre projetos), não de autorização.

Não foi adicionado disparo automático ao salvar a anamnese. Esta entrega cria o canal confirmado de eventos e seu histórico. Executar mensagens, mover etapas ou ativar workflows é uma etapa separada; `received` não significa que uma automação foi executada. O fluxo `/jornada` de protocolos continua separado da Consulta do paciente.

## Verificação local

- 10 testes novos no BioReport: confirmação, autorização antes de queries, minimização, consulta prévia, assinatura e erros sanitizados.
- 11 testes novos no Jornada AI: acesso administrativo, tamanho do corpo, assinatura ausente, encaminhamento exato e erros sanitizados.
- 30 verificações em PostgreSQL descartável com todas as migrações reais: HMAC, prazo, RLS, isolamento por organização, vínculo imutável, auditoria atômica, concorrência e revogação da chave.
- 53 testes Node e 33 Vitest preexistentes do BioReport passaram.
- TypeScript e builds dos dois projetos passaram. ESLint dos arquivos novos/alterados passou; `git diff --check` passou.
- O lint geral do BioReport falha com 875 erros e 6 avisos anteriores, em 55 arquivos cujos bytes são iguais ao HEAD de origem. Não foram corrigidos nesta entrega.
- Rotas e manifestos gerados foram atualizados pelas ferramentas oficiais; nenhum arquivo AUTO-GENERATED foi editado manualmente.

Reprodução: BioReport `node --test tests/jornada-events.test.mjs`; Jornada `npx vitest run src/lib/bioreport-events.test.ts src/lib/mcp/tools/list-bioreport-events.test.ts`. Para o teste SQL, instalar `npm install --prefix test/bioreport-runtime` e executar `node test/bioreport-events.db.mjs`. O teste cria e encerra seu próprio PostgreSQL local, com dados fictícios.

## Revalidação em 21/09/2026 — configuração bloqueia o envio operacional

Esta seção atualiza o estado observado; as notas anteriores permanecem como histórico. Não recriar nem rotacionar a chave existente.

### Revisões e alcance
- BioReport original: fonte inicial `1897a788a4f75cb2ff1e51e47c8abd95bf7e721c`; correção mínima na prévia `1b905e4d500550c7b49c0506666d54e17bba10f4`.
- Jornada original: fonte/receptor testados em `16491d9db3b9cfeae11c9e142d92f952f2e488fc`. O corpo da função SQL `receive_bioreport_event` no banco efetivo foi comparado e coincide com a migração dessa fonte.
- SHA realmente publicado: não disponível nos metadados acessíveis. Não confundir `is_published` ou a etiqueta estática de build com prova do commit implantado.
- A consulta de diagnóstico do Lovable introduziu um upgrade automático de dependência; a dependência do BioReport foi restaurada e o diff conferido contém apenas a correção e seu teste. Restauração equivalente solicitada no Jornada, sem publicação.

### MCP autenticado e catálogo
- `list_reports({limit:1})` funcionou no MCP nativo `bioreport` deste Codex e no plugin BioReport. Os dois retornaram o mesmo primeiro identificador, sem reproduzir dados clínicos no relatório.
- `jornada_preview_consultation` funcionou pelo MCP nativo e confirmou uma anamnese aceita no registro de teste já autorizado. O vínculo foi conferido pela cadeia convite → consulta → submissão → contato GHL, não por nome.
- MCP BioReport: 12 ferramentas disponíveis. O manifesto atual do Jornada contém 8, incluindo `list_bioreport_events` e `list_opportunities`; o plugin nesta sessão continua expondo apenas 6. `list_automations` respondeu, o que não equivale a testar a leitura de eventos.
- A tentativa de recarregar pelo protocolo local suportado `config/mcpServer/reload` não alcançou o servidor: socket de controle local ausente. O controle do Chrome também expirou ao selecionar o editor. Atualização do catálogo no cliente permanece pendente; nenhuma credencial foi removida ou renovada.

### Configuração e causa comprovada
- Presença dos quatro nomes de configuração confirmada no cofre dos dois projetos; os valores não foram exibidos. Isso, sozinho, não prova compatibilidade.
- Banco Jornada: uma chave ativa, uma associação de localização da mesma organização; zero eventos. `anon` e `authenticated` não têm SELECT na tabela privada.
- Uma única tentativa operacional `anamnese_recebida` foi feita com `confirm:true` e os identificadores do teste previamente autorizado. Resultado: erro de validação `invalid_format`, formato `uuid`, caminho vazio, antes do envio HTTP.
- Os identificadores da consulta, do paciente e da submissão foram verificados como UUIDs válidos. No código vigente, a outra validação UUID nesse ponto é `JORNADA_AI_ORGANIZATION_ID`. A configuração carregada pelo backend publicado precisa ser corrigida ou atualizada no runtime; não há evidência de falha OAuth atual nem motivo para rotacionar a assinatura.
- Correção de código: `safeParse` mantém a validação estrita e retorna orientação em português, sem JSON técnico do Zod nem o valor inválido. Teste confirma zero chamadas de rede quando a organização é inválida.
- Registro de teste: consulta `97507e74-f997-4e45-b8d4-764a44e347c6`, submissão `207af4c2-33d8-43d9-a90d-a265659bf8ee`; o contato exato permanece conferível no convite persistido. Não há relatório salvo nessa consulta.
- Nenhum recibo `received` foi obtido; `duplicate` operacional não foi tentado depois dessa falha determinística. Eventos persistidos continuam zero.

### Validação isolada
- 28 testes Node no BioReport (11 de eventos e 17 de regressão MCP), executados sobre os arquivos da revisão da correção.
- 18 testes Vitest do receptor/cadastro/leitura de eventos.
- 43 verificações em PostgreSQL descartável com dados sintéticos e migrações da fonte fixada: HMAC sobre corpo exato, assinatura inválida, expiração, organização/location, associação, RLS, revogação, auditoria atômica, concorrência e repetição `duplicate` com uma única gravação.
- TypeScript e ESLint do core alterado aprovados. Nenhum arquivo AUTO-GENERATED alterado manualmente.
- Nenhuma mensagem, alteração comercial, execução de workflow ou envio automático ao salvar anamnese foi introduzido.

### Estado separado
| Item | Estado em 21/09 |
| --- | --- |
| Pronto no código | Canal existente; erro de configuração corrigido e testado na prévia |
| Publicado | Aplicações respondem; correção desta sessão não publicada, SHA de produção não comprovado |
| Configurado | Chave ativa preservada; ID da organização no runtime BioReport impede o envio; compatibilidade da assinatura entre backends ainda não demonstrada |
| Verificado de ponta a ponta | Pendente: nenhum evento recebido; duplicação comprovada apenas no ambiente isolado |

### Próximo passo privado
No projeto original BioReport, abrir Cloud → Secrets e revisar somente `JORNADA_AI_ORGANIZATION_ID`. Usar o UUID da organização já vinculada à chave ativa no Jornada, sem aspas, rótulo, URL ou espaços. Conferir no painel privado do Jornada/documentação de configuração existente; não enviar o valor nem a chave por chat. Preservar os demais valores, sobretudo a chave funcional. Se o cofre já estiver correto, atualizar o backend publicado para carregar a configuração vigente, com publicação autorizada.

Depois, repetir o preview e o mesmo evento autorizado. Somente após `received`, repetir os mesmos IDs para obter `duplicate`, conferir uma linha e uma auditoria, e comparar mensagens/execuções/etapa com o estado anterior. Atualizar o catálogo Jornada pelo cliente e validar `list_bioreport_events`. Não usar service role, não relaxar RLS e não reenviar respostas clínicas.

## Retomada após salvar a configuração — 21/09/2026

O operador informou que salvou JORNADA_AI_ORGANIZATION_ID e o histórico do Lovable confirmou o cadastro no cofre. O valor e a chave de assinatura não foram lidos nesta retomada.

O preview MCP autenticado voltou a confirmar a mesma consulta de teste e a mesma submissão aceita. A cadeia convite/submissão/consulta/contato foi revalidada no banco. Uma tentativa após o salvamento ainda retornou o erro antigo do Zod (invalid_format, uuid, path vazio) no endpoint público; nenhum recibo foi emitido. Não repetir até atualizar a implantação.

Isso não demonstra que o operador salvou um valor incorreto: a configuração vigente no cofre e o runtime publicado são estados distintos. O site ainda não foi republicado nesta entrega. A ação restante é publicar a prévia revisada para aplicar a configuração e então verificar received/duplicate com os mesmos IDs autorizados.

Linha de base revalidada: zero eventos, zero auditorias de recebimento, zero mensagens de saída, zero execuções de automação do contato, etapa novo_lead. Nenhuma mensagem, alteração comercial ou evento persistido. Sem rotação de chave.

Durante o cadastro no Lovable a dependência de build foi novamente atualizada automaticamente. Antes de publicar, a prévia deve manter @lovable.dev/vite-tanstack-config 2.13.1, já testada. O diff funcional deve continuar limitado à sanitização dos erros do canal de eventos e seu teste; os demais arquivos alterados são documentos.
