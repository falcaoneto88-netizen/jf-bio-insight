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
- [ ] UI: rotas /jornada (lista) e /jornada/$id (6 etapas), home com "Iniciar atendimento"
- [ ] Etapas 4 (protocolo), 5 (aprovação) e 6 (HTML) na interface

## Correções pedidas na revisão do Codex (11/09/2026)
- [ ] Formatação por campo/unidade: TMB inteiro (1365 → "1.365"), nunca "1,365"; preservar casas originais de PGC e peso
- [ ] dateSortKey deve validar calendário real (rejeitar 31/02, tratar ano bissexto), sem alterar datas por fuso
- [ ] Evolução: separar transcrição literal normalizada dos cálculos, sem perder precisão exibida
- [ ] Histórico com duas linhas da mesma data: preencher células em falta sem perder dados e sinalizar conflitos
- [ ] Escritas por service_role só após auth/admin/owner + expectedVersion; não devolver grants de escrita ao cliente
- [ ] Aprovação humana: rejeitar tokens OAuth delegados e exigir confirmações + objetivo/modelo válido e protocolo não vazio
- [ ] Export final: usar o snapshot exato aprovado (jornada_aprovacoes), sem recomputar a data
- [ ] UI e MCP devem partilhar a mesma preparação de resumo da bioimpedância
- [ ] Limitar uso de IA por utilizador; concluir remoção de logs em bruto e auth das funções legadas
- [ ] Migrations idempotentes dos grants/policies já aplicados
- [ ] Fixture sintético no repo + script de export HTML para WeasyPrint
- [ ] docs/JORNADA_CLINICA.md e docs/VALIDACAO_JORNADA.md
