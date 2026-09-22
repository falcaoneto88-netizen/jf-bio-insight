# Roadmap

## Concluído (fluxo legado)

- [x] Marcar falcaoneto88@gmail.com como administrador (tabela de papéis + atribuição no primeiro login)
- [x] Publicar o site
- [x] Guiar a ligação do assistente ao /mcp com login Google, com regra de acesso segura (só administradores)
- [x] Integração GoHighLevel em dois sentidos
- [x] Ferramentas do assistente: evolução do paciente, contactos GHL, envio de relatório
- [x] Melhorias em list_reports e get_report

## Nova jornada clínica (Agente Clínico Dr. João Falcão)

- [x] Tabelas isoladas jornadas_clinicas + jornada_aprovacoes com RLS admin+owner e aprovação atómica no servidor
- [x] Regras versionadas do agente: schemas, prompts, formatação, evolução, HTML premium
- [x] Server functions autenticadas (admin + owner + expectedVersion)
- [x] Ferramentas MCP novas: consultar_jornada, organizar_anamnese, extrair_bioimpedancia, preparar_protocolo, exportar_protocolo_html
- [x] UI: rotas /jornada (lista) e /jornada/$id (6 etapas), home com "Iniciar atendimento"
- [x] Etapas 4 (protocolo), 5 (aprovação) e 6 (HTML) na interface

## Correções pedidas na revisão do Codex (11/09/2026)

- [x] Formatação por campo/unidade: TMB inteiro (1365 → "1.365"), nunca "1,365"; preservar casas originais de PGC e peso
- [x] dateSortKey deve validar calendário real (rejeitar 31/02, tratar ano bissexto), sem alterar datas por fuso
- [x] Evolução: separar transcrição literal normalizada dos cálculos, sem perder precisão exibida
- [x] Histórico com duas linhas da mesma data: preencher células em falta sem perder dados e sinalizar conflitos
- [x] Escritas por service_role só após auth/admin/owner + expectedVersion; não devolver grants de escrita ao cliente
- [x] Aprovação humana: rejeitar tokens OAuth delegados e exigir confirmações + objetivo/modelo válido e protocolo não vazio
- [x] Export final: usar o snapshot exato aprovado (jornada_aprovacoes), sem recomputar a data
- [x] UI e MCP partilham a mesma preparação de resumo da bioimpedância
- [x] Limitar uso de IA por utilizador; concluir remoção de logs em bruto e auth das funções legadas
- [x] Migrations idempotentes dos grants/policies já aplicados
- [x] Fixture sintético no repo + script de export HTML para WeasyPrint
- [x] docs/JORNADA_CLINICA.md e docs/VALIDACAO_JORNADA.md

## Por fazer

- [ ] Validação manual na aplicação com dados sintéticos (lista em docs/VALIDACAO_JORNADA.md)
- [ ] Conversão WeasyPrint verificada fora do sandbox (não há WeasyPrint disponível aqui)
- [ ] Publicação, só depois da revisão do proprietário

## Geração do protocolo pela OpenAI (16/09/2026, só prévia)

- [x] Cálculo energético determinístico revisável (Cunningham, MLG do exame ou derivada)
- [x] Geração completa do plano alimentar pela Responses API, sem fallback para outro fornecedor
- [x] Mesmo serviço na aplicação e no assistente MCP, com quota, versão e aprovação humana
- [x] Bloqueio de aprovação por refeições/quantidades/substituições em falta
- [x] Imprimir / Salvar PDF da versão aprovada dentro da jornada
- [x] /review identificado como gerador antigo (secundário)
- [ ] Cadastrar OPENAI_API_KEY em Project Settings → Secrets (sem ela não há chamada real)
- [ ] Validação manual na prévia e publicação, só depois da revisão do proprietário

## Correção 16/09/2026 (prévia, sem publicar)

- [x] Patch do renderer html.ts: título "Protocolo avançado de X", campos ausentes, objetivo único, rodapé por página, sem logo final repetido em impressão; legado byte a byte.
- [x] Contexto da IA preserva idade/nascimentoOuIdade (sem nome/telefone/email).
- [x] Testes: layout/escaping CSS, impressão obsoleta, preflight/permissão/fonte, revalidação, marcador, regeneração.
- [x] Docs com limites reais (chave OpenAI ausente: chamadas reais pendentes).

## Revisão f7cf9c99 (16/09/2026) — concluída na prévia

- [x] Integridade centralizada em patchJourney (marcador, null/reset, guardrails)
- [x] Prescrições estruturadas como fonte única em save e prévia
- [x] Deteção de regeneração obrigatória, não removível por patch
- [x] measuresForExam falha claro quando a data do exame não está no histórico
- [x] Impressão fail-closed (hash ausente) e carregamento com limite finito
- [x] Testes comportamentais novos (233 Vitest, 76 Node), tipos, lint e build
- [ ] Chamada real à OpenAI (pendente: OPENAI_API_KEY ausente)
- [ ] Publicação (aguarda revisão visual do proprietário)

## Refinamento visual e de navegação (17/09/2026, somente prévia)

- [x] Reorganizar a lista e o detalhe de consultas com uma única próxima ação baseada nos estados existentes
- [x] Refinar o atendimento e representar conclusão persistida no progresso
- [x] Preservar ferramentas antigas e históricos numa área secundária expansível
- [x] Cobrir estados prioritários e conclusão do progresso com testes comportamentais
- [x] Validar teclado, contraste e layouts 390/768/1440 com dados sintéticos
- [x] Executar TypeScript e testes relevantes; não publicar
- [x] Entregar a prévia concreta após validação, sem nova pausa de aprovação

## Aviso automático ao Jornada AI (20/09/2026, prévia, desativado)

- [x] Fila persistente `jornada_events` com gatilho após confirmação da anamnese, chave única e recuo exponencial
- [x] Trabalhador no servidor com reserva/lease, fencing, idempotência e erros sanitizados
- [x] Endereço interno autenticado pela credencial do cofre do banco; verificação periódica criada desativada
- [x] Validação estrita do vínculo (contato único da subconta, convite correspondente) com pendência visível
- [x] Controles de administrador em /agendamentos: ativar/pausar, situação por consulta, recolocar na fila
- [x] 22 testes sintéticos novos, suíte completa (300 Vitest + Node), tipos, lint e build
- [x] docs/jornada-outbox-2026-09-20.md com ativação, reversão e limites reais
- [ ] Publicação e teste autorizado ponta a ponta (aguarda confirmação do proprietário)
