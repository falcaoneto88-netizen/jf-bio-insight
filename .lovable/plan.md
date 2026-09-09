# Autocrítica das funções do assistente (MCP)

Hoje o assistente tem apenas duas capacidades: listar relatórios e abrir um relatório pelo identificador. Ambas são só de leitura e exigem login com conta de administrador. Funciona, mas é pouco para o uso diário.

## O que está bem
- Só administradores conseguem ler; qualquer outra conta recebe recusa.
- As duas funções são só de leitura, portanto não há risco de apagar nada por engano.
- Descrições em português, o que ajuda o assistente a escolher a ferramenta certa.

## Pontos fracos identificados
1. **Listagem sem filtro por datas.** Só dá para filtrar por nome. Perguntas naturais como "relatórios deste mês" obrigam o assistente a puxar tudo e adivinhar.
2. **Resposta demasiado pesada.** `get_report` devolve o bloco completo de composição corporal e dados clínicos num texto único; em consultas rápidas gasta tempo e dificulta a leitura.
3. **Sem procura por paciente.** Não existe forma de ver o histórico de um paciente e a sua evolução (peso, massa muscular, gordura) entre exames — que é a pergunta clínica mais útil.
4. **Sem resumo pronto.** O assistente recebe dados crus e tem de os interpretar sozinho, com risco de errar valores.
5. **Limite silencioso.** Pedir 500 relatórios devolve 100 sem avisar que ficou truncado.
6. **Mensagem de recusa pouco clara** quando a conta não é administradora: não explica que basta entrar com a conta autorizada.

## Melhorias propostas (por ordem de valor)
1. Adicionar filtro por intervalo de datas e aviso de truncagem em "listar relatórios".
2. Nova função "evolução do paciente": dado um nome, devolve os exames por ordem cronológica com as variações principais (peso, gordura, massa muscular) já calculadas.
3. Modo resumido em "detalhe do relatório": por omissão devolve os indicadores essenciais; um parâmetro opcional traz tudo.
4. Mensagens de erro mais claras (não autenticado, sem permissão, relatório inexistente).

## Notas técnicas
- Alterações restritas a `src/lib/mcp/tools/list-reports.ts`, `get-report.ts` e um novo `patient-evolution.ts`, registado em `src/lib/mcp/index.ts`.
- Filtro de datas sobre `exam_date`/`generated_at`; evolução calculada a partir de `body_composition`.
- Todas as funções continuam só de leitura e passam por `requireAdminClient`.
- Depois das alterações é preciso regenerar o manifesto MCP e publicar de novo.

## Fora deste âmbito
Nenhuma função de escrita (criar ou apagar relatórios) pelo assistente.
