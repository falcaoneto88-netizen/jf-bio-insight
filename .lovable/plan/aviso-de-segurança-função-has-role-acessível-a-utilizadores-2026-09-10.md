# Aviso de segurança: função `has_role` acessível a utilizadores autenticados

## O que o aviso diz
O scanner assinala que existe uma função de base de dados com privilégios elevados
(`SECURITY DEFINER`) que qualquer conta com sessão iniciada pode chamar.

No projeto só existe uma função assim: `public.has_role(_user_id, _role)`.
Ela responde apenas "sim/não" à pergunta "esta conta tem este papel?".

## Avaliação
Este é o padrão recomendado para verificação de papéis. A função precisa de
`SECURITY DEFINER` para ler a tabela de papéis sem cair em recursão nas regras de
acesso, e precisa de ser chamável pelas contas autenticadas porque é usada:

- nas regras de acesso da base de dados;
- na verificação de administrador das ferramentas do assistente (MCP);
- nas funções de servidor do GoHighLevel.

Ela não devolve dados sensíveis, não escreve nada, tem `search_path` fixo e é
`STABLE`. Revogar o `EXECUTE` das contas autenticadas quebraria o acesso de
administrador e as ferramentas do assistente.

Conclusão: alerta esperado, não é uma vulnerabilidade neste caso.

## Proposta (endurecimento mínimo, sem quebrar nada)
1. Manter `has_role` como está, mas garantir que só `authenticated` e
   `service_role` têm `EXECUTE` (revogar de `public` e de `anon`, se ainda
   existirem).
2. Marcar este aviso como aceite/ignorado no painel de segurança, com a
   justificação acima registada na memória de segurança do projeto.

Sem alterações a código da aplicação.

## Nota separada (não incluída nesta alteração)
Continua em aberto o aviso crítico anterior: a tabela de relatórios permite
leitura e escrita anónima. Esse risco foi aceite por si numa decisão anterior;
posso fechá-lo num passo próprio, restringindo o acesso à sua conta de
administrador, se quiser.

## Detalhe técnico
Migração única:

```sql
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
```
