# MCP Codex — BioReport → Jornada AI

Atualizado em 21/09/2026. Projetos originais: BioReport `26a42c4a-b53d-4fa2-b737-3b14bf0e0665` e Jornada `36345211-2616-42f7-bb9e-e78a9d00ca22`.

## O que está comprovado
MCP nativo BioReport autenticado neste Codex: `list_reports` e `jornada_preview_consultation` passaram. A configuração local aponta a `https://jf-bio-insight.lovable.app/mcp` com Streamable HTTP/OAuth. Não foi preciso refazer login. O plugin também leu relatórios. Isso não valida outro computador nem todas as ferramentas.

O receptor Jornada já tem uma chave ativa no registro privado e associação à organização/location. Não recriar a chave. SELECT de `anon`/`authenticated` nessa tabela é negado. A rotina SQL efetiva coincide com a fonte testada.

## Bloqueio atual
Tentativa única no teste previamente autorizado: erro UUID antes de HTTP. IDs da consulta/paciente/submissão são válidos; `JORNADA_AI_ORGANIZATION_ID` carregada no runtime BioReport é a validação que falta. Nenhum recibo emitido e nenhum evento persistido. Não tratar isso como 401, falha de login ou assinatura incompatível comprovada.

Código de erro agora sanitizado na prévia BioReport `1b905e4d500550c7b49c0506666d54e17bba10f4`. Fonte inicial `1897a788a4f75cb2ff1e51e47c8abd95bf7e721c`; receptor testado `16491d9db3b9cfeae11c9e142d92f952f2e488fc`. A correção não foi publicada. SHA de produção indisponível; `is_published` não basta.

## Ação privada indispensável
1. No [cofre do BioReport](https://lovable.dev/projects/26a42c4a-b53d-4fa2-b737-3b14bf0e0665?view=more&subview=cloud&section=secrets), revisar apenas `JORNADA_AI_ORGANIZATION_ID`.
2. Copiar privadamente o UUID da organização já vinculada à chave ativa no Jornada; a documentação de configuração existente contém a referência. Não colar chave/valores no chat, código, SQL registrado ou arquivos de entrega. Não reutilizar token GHL/Supabase.
3. Manter a chave existente. Caso o valor já esteja certo no cofre, uma revisão antiga do runtime pode estar carregando configuração anterior; atualizar a implantação com autorização e verificar o backend efetivo.
4. Informar apenas que o campo foi revisado. Nunca enviar o valor para o assistente.

O conector confirmou presença dos nomes, mas não conseguiu aplicar a correção privada. Duas tentativas de comando específico retornaram erro de serialização sem ação concluída. O navegador expirou ao abrir/selecionar o editor; não foi possível concluir pela UI.

## Retomada operacional segura
- Refazer `jornada_preview_consultation` com a consulta de teste `97507e74-f997-4e45-b8d4-764a44e347c6`.
- Submissão confirmada: `207af4c2-33d8-43d9-a90d-a265659bf8ee`. Conferir o contato exato no convite persistido. Não ligar pessoas por nome nem escolher outro paciente.
- Enviar somente `anamnese_recebida` com `confirm:true`. O outro evento permitido é `relatorio_disponivel`, mas essa consulta não tem relatório salvo; não inventar um.
- Após `received`, repetir o mesmo evento/registro/contato e esperar `duplicate`. Conferir uma linha em `bioreport_events` e uma auditoria verificada, sem nova gravação.
- Linha de base: 0 eventos, 0 auditorias de recebimento, 0 mensagens de saída da organização, 0 execuções de automação do contato; etapa `novo_lead`. Comparar de novo, sem atribuir outras atividades concorrentes ao teste.

## Descoberta das ferramentas
O manifesto Jornada declara 8 ferramentas; o plugin desta sessão expõe 6. Faltam `list_bioreport_events` e `list_opportunities`. Não chamar ferramenta inexistente nem declarar catálogo atualizado.

Tentativa suportada via `codex app-server proxy` / `config/mcpServer/reload` falhou porque o socket de controle não existe neste ambiente. O [procedimento oficial de MCP](https://learn.chatgpt.com/docs/extend/mcp) orienta salvar/reiniciar o servidor no cliente. Para o plugin Jornada, atualizar sua conexão/catalogação no gerenciador de plugins e iniciar nova sessão; confirmar a lista recebida antes de declarar sucesso. Nenhuma remoção/reinstalação ou revogação foi feita.

## Testes e limites
- BioReport: 28 testes Node na fonte corrigida.
- Jornada: 18 testes Vitest e 43 verificações PostgreSQL sintéticas.
- TypeScript e lint do core alterado passaram.
- Duplicação, assinatura inválida e ausência de efeitos comerciais comprovadas no banco isolado; E2E real continua pendente da configuração.
- Não chamar `ghl_push_report`, mover etapas, ativar workflows ou enviar mensagens. Salvar anamnese continua sem disparo automático.
- Nenhuma alteração clínica, aprovação, versão de protocolo, documento ou integração Ads/Meta/Google.

Detalhes e histórico: [jornada-event-tool-2026-09-12.md](jornada-event-tool-2026-09-12.md).
