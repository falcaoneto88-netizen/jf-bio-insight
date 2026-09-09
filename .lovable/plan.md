# Marcar falcaoneto88@gmail.com como administrador

Objetivo: registar a sua conta como administrador da aplicação, sem mudar ainda quem vê o quê. Nada no ecrã de relatórios, no PDF ou na dieta muda.

## Como vai funcionar

1. Cria-se um registo de "quem é administrador" na base de dados (separado dos dados de paciente).
2. O seu email fica numa lista fixa de administradores autorizados.
3. Na primeira vez que entrar com o Google usando falcaoneto88@gmail.com, a marcação de administrador é atribuída automaticamente à sua conta.
4. Fica disponível uma verificação simples "sou administrador?" para usar mais tarde, quando quiser restringir acessos.

Como ainda não entrou na aplicação com esse email, a marcação aplica-se assim que fizer o primeiro login.

## Detalhes técnicos

Migração SQL:
- `create type public.app_role as enum ('admin','user')`
- `public.user_roles (id uuid pk, user_id uuid references auth.users on delete cascade, role app_role, unique(user_id, role))`
- `grant select on public.user_roles to authenticated; grant all to service_role;`
- RLS ativa: política SELECT `auth.uid() = user_id` (cada um vê apenas o seu papel). Sem INSERT/UPDATE/DELETE para clientes — atribuição só pelo servidor.
- `public.has_role(_user_id uuid, _role app_role)` security definer, `set search_path = public`, stable.

Código:
- `src/lib/admin.functions.ts`
  - `claimAdminRole`: server function com `requireSupabaseAuth`; compara o email das claims com a lista fixa `['falcaoneto88@gmail.com']` (case-insensitive); se corresponder, faz upsert de `admin` em `user_roles` usando `supabaseAdmin` importado dentro do handler.
  - `getMyRoles`: server function com `requireSupabaseAuth`; devolve os papéis do utilizador atual via `context.supabase`.
- `src/routes/__root.tsx`: no `onAuthStateChange`, ao evento `SIGNED_IN`, chamar `claimAdminRole` uma vez (falha silenciosa, sem bloquear a UI).
- Confirmar que `src/start.ts` mantém o `functionMiddleware` que anexa o token; adicionar `attachSupabaseAuth` apenas se não existir equivalente.

Fora de âmbito (para depois, se pedir): restringir os relatórios ao administrador, alterar as políticas atuais de `public.reports`, ou criar ecrã de gestão de utilizadores.

## Risco

Nenhum fluxo atual é alterado; a app continua a funcionar sem login. A tabela `reports` mantém o acesso público já aceite anteriormente.
