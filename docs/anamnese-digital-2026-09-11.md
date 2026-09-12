# Anamnese digital — 11/09/2026

## Entrega desta etapa

Rota `/anamnese` com acesso direto para o paciente e link na página inicial. Conversão do HTML fornecido em formulário React, mantendo as oito seções, identificação do Dr. João Falcão, fundo claro, faixas pretas e detalhes dourados.

- Campos com rótulos acessíveis, indicação de obrigatoriedade e erros junto ao campo.
- Perguntas condicionais sobre filhos, doenças, medicamentos, alergias, treino, álcool, tabagismo e suplementos. Detalhes ocultos são limpos e omitidos da revisão.
- Validação Zod de nomes, limites de texto, números, datas, horários e escolhas; água aceita vírgula decimal. Respostas opcionais vazias aparecem como “Não informado”, sem inferir ausência de condição clínica.
- Revisão de todas as respostas antes da confirmação. A confirmação exige nome do preenchente e aceite explícito da declaração; registra a data local. Edições posteriores exigem nova confirmação.
- Cópia para impressão / salvar PDF pelo diálogo de impressão do navegador, com CSS A4. Não equivale a assinatura digital certificada.
- Aviso ao sair da página preenchida e layout de uma coluna em telas pequenas.

## Dados e integração

O pedido executado foi a primeira etapa: transformar o anexo em formulário digital. As respostas existem somente na memória da página e na cópia que o usuário decidir imprimir ou salvar. Não foram acrescentados localStorage, requisições com respostas, gravação no Supabase, credenciais, webhooks ou mensagens externas. Fechar/recarregar a página descarta o preenchimento; o aviso na interface orienta salvar a cópia.

A rota permite apenas o preenchimento local e não lê relatórios nem dados de outros pacientes. A proteção administrativa das demais páginas foi mantida. Não houve alteração de RLS ou uso de service role. `routeTree.gen.ts` foi atualizado pelo gerador oficial do Vite.

A persistência vinculada a paciente/consulta, os convites individuais, a incorporação ao relatório e o envio de status ao HighLevel/Jornada AI continuam sendo etapas separadas. Não há anúncio falso de “enviado”: a conclusão informa “confirmada neste dispositivo” e “sem envio à clínica”.

## Verificações

- `npm run test:anamnesis`: 17 testes de validação, condicionais, limites, remoção de detalhes ocultos e confirmação explícita.
- Regressões anteriores: 10 testes de acesso e 17 de MCP; total 44 aprovados.
- TypeScript, ESLint dos arquivos alterados e build de produção.
- Navegador com dados fictícios: formulário em branco bloqueado; detalhes de medicamentos aparecem e são removidos ao escolher “Não”; preenchimento completo; revisão; confirmação obrigatória; conclusão com nome e data.
- Layout a 390px: uma coluna e largura de rolagem igual à largura da tela.
- A prévia local está disponível em `http://127.0.0.1:4173/anamnese` enquanto o servidor de desenvolvimento estiver ativo. Alterações não publicadas.
