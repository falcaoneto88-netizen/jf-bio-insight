# Login e proteção de páginas — 11/09/2026

Implementação local, ainda não publicada.

- `/login` oferece entrada com Google usando a integração Lovable existente. O retorno é restrito às páginas clínicas conhecidas, sem redirecionamentos externos. Erros do provedor recebem mensagem controlada.
- Todas as páginas são privadas por padrão, exceto início, login e consentimento OAuth (que mantém seu próprio fluxo). O conteúdo privado só é montado depois de validar o usuário no Supabase e consultar `has_role` com o token da sessão.
- A atribuição automática de admin no evento de login foi removida da raiz. O papel deve estar previamente cadastrado. Não foi acrescentado uso de service role.
- Sessão ausente, expirada, acesso sem admin e indisponibilidade de verificação têm mensagens distintas. Acesso é revalidado no foco da janela, a cada minuto e nos eventos de autenticação. O cache de consultas é limpo ao perder acesso.
- Histórico, inserção, exclusão e importação do histórico local verificam admin antes de consultar o banco. Leitura e exclusão também verificam depois, evitando anunciar resultado vazio/sucesso quando a RLS oculta registros após revogação. Não existe transação atômica entre essas verificações e a query: a proteção efetiva do banco é a RLS.
- Falhas de carregamento do histórico mostram um alerta com opção de tentar novamente, em vez de “nenhum relatório”. Falhas de importação preservam os registros locais e são exibidas.
- A geração só inicia o download e navega para sucesso após a confirmação de gravação. Se falhar, mantém o rascunho e mostra erro persistente. Trabalho assíncrono da revisão é interrompido antes da gravação/download quando a página é desmontada.
- O rascunho já era persistido no navegador. Continua preservado na expiração para retomada com a mesma conta; é limpo no logout explícito ou ao entrar outro admin. Um identificador local associa o rascunho ao usuário, sem armazenar novos tokens. Rascunhos legados sem identificador são associados ao primeiro admin que entrar. Isso não cifra o armazenamento local.

## Validação

- `npm run test:access`: 10 testes isolados com Supabase simulado. Incluem bloqueio antes de queries, sessão inválida, conta sem admin, falhas de rede, recusa RLS, sanitização e redirecionamento seguro.
- `npm run test:mcp`: 17 regressões existentes preservadas.
- TypeScript, ESLint nos arquivos alterados e build de produção.
- Navegador local: histórico sem sessão bloqueado, navegação para login e aviso de sessão expirada.
- O ciclo OAuth real desta nova tela e a navegação autenticada ainda precisam de validação após publicação no domínio autorizado. Não foram feitos novos logins em produção nem gravações de relatórios reais nesta etapa.

## Publicação

Publicar a aplicação e aplicar a migração RLS pendente são ações separadas. O bloqueio visual não substitui a migração `20260910180000_restrict_report_access.sql`. Confirmar que a conta operacional já possui papel admin antes de ativar a restrição. Nenhuma política de produção foi alterada nesta etapa.
