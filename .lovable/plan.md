# Assistente (MCP) + ligação ao GoHighLevel

## Nota importante sobre "modificar o código"
O assistente ligado à app trabalha com os dados e as ações da app, não com o código-fonte. Alterações ao código continuam a ser feitas aqui no chat, comigo. O que fica possível é ligar a app aos chats da Lovable e ao GoHighLevel.

## O que vai ser feito

### 1. Ligar a app aos chats da Lovable
Registar o servidor da app como conector na Lovable, para poder pedir nos chats Lovable coisas como "lista os últimos relatórios" sem sair da plataforma. Usa o mesmo login e a mesma regra: só a sua conta de administrador tem acesso.

### 2. Ligação ao GoHighLevel nos dois sentidos
- **Trazer do GHL**: procurar um contacto por nome, email ou telemóvel e preencher automaticamente os dados do paciente (nome, email, telefone e campos disponíveis) no formulário clínico.
- **Enviar para o GHL**: depois de gerar um relatório, criar ou atualizar o contacto no GHL com os dados principais (objetivo, peso, gordura, massa muscular, data do exame) e registar uma nota com o resumo do relatório.

Na app: um botão "Procurar no GHL" no formulário clínico e um botão "Enviar para o GHL" no ecrã final, com confirmação de sucesso ou erro.

### 3. Novas capacidades para o assistente
Além de listar e abrir relatórios, o assistente passa a poder:
- Procurar um contacto no GHL e ver o histórico do paciente na app.
- Enviar um relatório já gerado para o GHL (com confirmação, nunca automático).

### 4. Melhorias nas funções atuais (da autocrítica)
- Filtro por intervalo de datas na listagem e aviso quando a lista é cortada.
- Resposta resumida por omissão no detalhe do relatório, com opção de detalhe completo.
- Evolução do paciente: exames por ordem cronológica com as variações de peso, gordura e massa muscular.
- Mensagens de erro mais claras (sem sessão, sem permissão, relatório inexistente).

## Notas técnicas
- Não existe conector oficial GoHighLevel na Lovable, por isso a ligação é feita diretamente à API v2 do GHL, isolada em `src/lib/ghl/client.server.ts` (pedidos HTTP) e `src/lib/ghl.functions.ts` (funções de servidor `searchGhlContact`, `pushReportToGhl`), protegidas por login de administrador.
- Credenciais guardadas em cofre: `GHL_API_KEY` e `GHL_LOCATION_ID` — peço-as no formulário seguro no momento de implementar. Nunca vão para o código nem para o browser.
- Novas ferramentas MCP em `src/lib/mcp/tools/`: `patient-evolution.ts`, `ghl-find-contact.ts`, `ghl-push-report.ts`; registo em `src/lib/mcp/index.ts`; alterações em `list-reports.ts` e `get-report.ts`. `ghl_push_report` marcada como não só-leitura.
- O conector Lovable é registado com a ferramenta de conectores (servidor próprio da app já publicado).
- Depois das alterações: regenerar o manifesto MCP e publicar de novo.

## Riscos
- Enviar dados clínicos para o GHL implica que esses dados passam a existir num sistema externo — o envio é sempre manual e confirmado.
- Campos personalizados do GHL variam por conta; começo pelos campos padrão e uma nota com o resumo, e afinamos depois com a sua conta real.
