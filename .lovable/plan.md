# Prompt para o Codex: varredura e ligação ao MCP

Copie o bloco abaixo e cole no Codex (ou noutro assistente com acesso ao repositório).

```text
Contexto
Trabalho na app "BioReport Studio" (TanStack Start + React + Lovable Cloud/Supabase).
A app já publica um servidor MCP próprio em https://jf-bio-insight.lovable.app/mcp
protegido por OAuth 2.1 (Supabase como authorization server) e restrito a
utilizadores com o papel "admin".

Objetivo
1) Fazer uma varredura completa da implementação MCP do repositório.
2) Ligar-te a esse servidor MCP e confirmar que as ferramentas funcionam.

Parte 1 — Varredura (apenas leitura, não alteres nada ainda)
Analisa e reporta, com referências ficheiro:linha:
- src/lib/mcp/index.ts — nome, título, versão, instruções e configuração de auth
  (issuer deve ser https://<project-ref>.supabase.co/auth/v1, construído a partir de
  import.meta.env['VITE_SUPABASE_PROJECT_ID'], nunca de process.env nem de um URL .lovable.cloud).
- src/lib/mcp/supabase.ts — resolução de env, cliente com bearer token do utilizador,
  e a verificação de admin (has_role). Confirma que nenhuma ferramenta usa service role.
- src/lib/mcp/tools/*.ts — list_reports, get_report, patient_evolution,
  ghl_find_contact, ghl_push_report. Para cada uma verifica:
  * validação de input com zod e limites sensatos;
  * verificação de autenticação/admin antes de qualquer query;
  * anotações corretas (readOnlyHint / destructiveHint / openWorldHint);
  * mensagens de erro claras em português;
  * ghl_push_report exige confirm: true e nunca escreve sem confirmação.
- src/routes/[.]lovable.oauth.consent.tsx — o ecrã de consentimento trata sessão
  ausente, erros do provider e aprovar/negar.
- vite.config.ts — mcpPlugin() está presente; não existem rotas MCP escritas à mão
  (src/routes/mcp.ts e src/routes/[.well-known]/oauth-protected-resource.ts são gerados).
- .lovable/mcp/manifest.json — está sincronizado com as ferramentas atuais.
- Segredos: GHL_API_KEY e GHL_LOCATION_ID só podem ser lidos dentro de handlers no
  servidor; nunca no cliente, nunca em logs.
Entrega um relatório com: o que está correto, riscos de segurança, e uma lista
priorizada de correções mínimas. Não faças alterações sem eu aprovar.

Parte 2 — Ligação ao MCP
Adiciona o servidor MCP remoto à tua configuração:
- URL: https://jf-bio-insight.lovable.app/mcp
- Transporte: Streamable HTTP
- Autenticação: OAuth (descoberta automática via
  https://jf-bio-insight.lovable.app/.well-known/oauth-protected-resource)
- No fluxo de login usa a conta Google falcaoneto88@gmail.com (é a conta admin)
  e aprova o pedido no ecrã de consentimento.

Verificações depois de ligar:
1. Lista as ferramentas disponíveis e confirma que aparecem as cinco esperadas.
2. Chama list_reports com limit 3 e mostra o resultado.
3. Chama get_report em modo summary para um dos ids devolvidos.
4. Chama patient_evolution para um paciente com mais de um exame.
5. NÃO chames ghl_push_report — é uma ferramenta de escrita.
Se algum passo devolver 401 ou "acesso restrito", indica o passo exato que falhou e
o corpo da resposta, sem revelar tokens.

Regras
- Nunca imprimas, registes ou partilhes tokens, chaves ou segredos.
- Não alteres ficheiros gerados automaticamente com o banner AUTO-GENERATED.
- Não relaxes RLS nem uses service role para contornar permissões.
```
