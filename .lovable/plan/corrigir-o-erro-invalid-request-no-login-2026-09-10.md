# Corrigir o erro "invalid_request" no login

## O que está a acontecer

Os registos de autenticação mostram, no momento em que carrega em "Entrar com Google":

```text
grant_type: id_token
status: 400
erro: Unacceptable audience in id_token: [288002387414-...apps.googleusercontent.com]
```

Ou seja: o login com Google é concluído do lado do Google, mas o serviço de contas da
app rejeita o resultado porque a aplicação Google que assinou o acesso não consta na
lista de aplicações aceites na configuração do fornecedor Google. Daí o
`invalid_request` visível no ecrã.

Isto é um problema de **configuração do fornecedor de login**, não do código do ecrã de
consentimento (esse já foi corrigido no passo anterior).

## Correção proposta

1. Reaplicar a configuração do login social gerido (Google) para que a identificação da
   aplicação Google usada pelo botão passe a ser aceite pelo serviço de contas.
2. Reaplicar a configuração do servidor OAuth da app (endereço do site e página de
   consentimento), garantindo que aponta para `https://jf-bio-insight.lovable.app`.
3. Verificar o estado com a ferramenta de diagnóstico OAuth e confirmar que já não há
   divergência de aplicação Google.
4. Publicar, para que a correção fique ativa no endereço público, e voltar a testar o
   login em `/.lovable/oauth/consent`.

Nenhum ficheiro de código precisa de ser alterado para esta correção.

## Detalhes técnicos

- Ferramentas usadas: `configure_social_auth` (providers: `google`),
  `configure_oauth_server` (caminho de consentimento por omissão) e
  `debug_oauth_server` para validação.
- O fluxo `signInWithIdToken` (usado pelo login gerido) valida a `aud` do id_token
  contra o client ID configurado; a reconfiguração alinha os dois valores.
- Se após a reconfiguração o erro persistir com o mesmo client ID, o passo seguinte é
  trocar o botão para o fluxo de redirecionamento clássico em vez do id_token.

## Risco

Baixo. Durante a reconfiguração, o login pode ficar indisponível por alguns segundos.
Não há alterações a dados de pacientes nem às regras de acesso.
