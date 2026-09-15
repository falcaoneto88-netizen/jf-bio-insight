# Diagnóstico do erro 502 no recebimento de anamnese (somente leitura)

Nada foi alterado: sem código, banco, segredos, configurações, publicação ou mensagens. Nenhum convite foi emitido e nenhuma função de escrita foi chamada.

## Evidência (registros do servidor publicado)

- Duas chamadas POST ao caminho público de anamnese às 18:00 UTC de 15/09/2026 responderam 502.
- O corpo devolvido pelo próprio sistema foi: `can_proceed: false`, `can_send: false`, `anamnese_url: null`, `error: "ghl_unavailable"`, mensagem "Não foi possível consultar o agendamento no GHL.". O editor do GHL mostra apenas "Bad Gateway" porque exibe o código HTTP, não o JSON.
- Essa mensagem específica só é produzida quando a própria chamada de rede ao GHL falha antes de haver resposta — não quando o GHL responde com erro de permissão ou de dados. Falhou em cerca de 1 segundo, portanto não foi tempo esgotado.

## Verificação independente das três consultas

Com as credenciais já existentes no servidor, repeti apenas as três leituras que o fluxo faz (contato, agendamento, clínica), sem emitir convite:

- Contato: HTTP 200, dados completos.
- Agendamento: HTTP 200, dados completos.
- Clínica (fuso horário): HTTP 200, dados completos.

Ou seja, a credencial, as permissões e o agendamento estão corretos. O problema está no ambiente de execução do site publicado, não no GHL.

## Causa provável (hipótese, ainda não comprovada em produção)

As três leituras são feitas com a opção de redirecionamento configurada como "erro". O ambiente de execução do site publicado (diferente do ambiente de teste) não aceita esse modo e faz a chamada falhar imediatamente, antes de qualquer resposta — o que corresponde exatamente ao caminho de erro registrado e ao tempo de ~1 segundo. Não é possível comprovar isso sem alterar código ou publicar, o que não foi autorizado neste diagnóstico.

## Segundo defeito encontrado na leitura do código (evidência)

A validação do agendamento espera que a resposta venha em um campo chamado `event`. A resposta real do GHL traz o agendamento em um campo chamado `appointment`. Mesmo que o 502 atual seja resolvido, a chamada falharia em seguida com a mensagem "O GHL devolveu dados incompletos". Os campos exigidos (identificador, contato, clínica, início, calendário e situação) existem na resposta — apenas o nome do campo externo diverge.

## Correção mínima proposta (para aprovação; nada aplicado)

Em `src/lib/intake-invitations/service.server.ts`:

1. Trocar o modo de redirecionamento de "erro" para "manual" na função de leitura do GHL e tratar explicitamente qualquer resposta 3xx como indisponibilidade, preservando a mesma mensagem e o mesmo código atual.
2. Aceitar o agendamento tanto no campo `appointment` quanto em `event`, mantendo todas as validações atuais de identidade, calendário, situação confirmada e data futura.
3. Nenhuma outra mudança: sem novos registros de dados clínicos, sem alterar permissões, banco, segredos ou o fluxo do GHL.

## Depois da correção

Revalidar com o mesmo agendamento de teste já confirmado e conferir nos registros que a resposta passa a trazer `can_proceed: true`. A publicação continua a seu critério.
