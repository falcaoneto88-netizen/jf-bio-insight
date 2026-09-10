# Corrigir o ecrã de consentimento OAuth (redirect para o Google)

## Problema

No ecrã de consentimento (`src/routes/[.]lovable.oauth.consent.tsx`), a função `signIn()` chama
`window.location.reload()` logo após `lovable.auth.signInWithOAuth("google", ...)`.
Quando o browser já iniciou o redirecionamento para o Google, `signInWithOAuth` devolve
`{ redirected: true }` — e o `reload()` interrompe esse redirecionamento, quebrando o login
OAuth do assistente (Codex/ChatGPT/Claude) ao ligar ao `/mcp`.

Confirmado no código:
- `src/integrations/lovable/index.ts` (auto-gerado) devolve `redirected: true` quando a
  navegação para o Google já começou, e `tokens` quando o fluxo completa sem redirect.
- `src/routes/[.]lovable.oauth.consent.tsx:94` recarrega a página incondicionalmente.

## Correção (mínima, um ficheiro)

Em `src/routes/[.]lovable.oauth.consent.tsx`, função `signIn()`:

```text
const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.href });
se result.error            -> mostrar erro, busy=false  (igual a hoje)
se result.redirected       -> NÃO fazer nada: o browser está a navegar para o Google;
                              manter busy=true para bloquear cliques duplos
caso contrário (tokens)    -> window.location.reload() para recarregar com a sessão iniciada
```

Sem outras alterações: nada muda no loader, no aprovar/recusar, nem em mais nenhum ficheiro.

## Validação após a correção

1. Typecheck (`bunx tsgo --noEmit`) sem erros.
2. Teste manual do fluxo: abrir `/mcp` no assistente, iniciar login Google, confirmar que o
   redirecionamento para o Google já não é interrompido e o consentimento aparece no regresso.
3. Publicar a app para o URL de produção servir a correção (necessário para o `codex mcp login`).

## Notas

- A sequência de testes do assistente (codex mcp login bioreport, 5 ferramentas, list_reports,
  get_report summary, patient_evolution, sem chamar ghl_push_report) corre do lado do Codex —
  fora do âmbito desta alteração de código.
