# Adaptação do GPT clínico ao BioReport

Estado em 14/09/2026: adaptação implementada e testada localmente após autorização para continuar. Publicação e instalação da nova migração ainda pendentes. Nenhuma configuração do GPT foi alterada, nenhum arquivo de conhecimento foi transferido e nenhuma chamada real de análise clínica foi executada.

## Fonte verificada

- GPT: **Agente Clínico Dr. João Falcão**, ID `g-6a53f02ab158819188dc189f51800c3e`.
- Editor: https://chatgpt.com/gpts/editor/g-6a53f02ab158819188dc189f51800c3e.
- Visibilidade observada: apenas para o proprietário; última edição exibida em 14 de setembro.
- Instruções disponíveis para leitura. Nove arquivos de conhecimento listados, incluindo exames e protocolos identificados, modelos HTML e logo. Apenas o inventário foi consultado; os conteúdos desses arquivos ainda não foram inspecionados.
- Nenhuma ação configurada na seção Ações. Nenhum modelo recomendado selecionado.
- Recursos habilitados: busca na web, Canvas, geração de imagens e intérprete de código/análise de dados. Essas capacidades precisam de configuração própria na API; não são transferidas pelo link do GPT.
- As instruções citam `MODELO_VISUAL_OFICIAL_DR_JOAO.pdf`, mas esse nome não aparece no inventário. É necessário identificar a referência visual correta antes de prometer equivalência ao PDF.

## Comparação com o aplicativo

O código local já tem organização de anamnese, extração de bioimpedância e rascunho de protocolo em `src/lib/journey/agent.server.ts`. Ele usa o gateway Lovable e `google/gemini-2.5-flash`, não uma chamada a este GPT. As regras atuais ficam em `src/lib/journey/prompts.ts`.

A tela `/consulta` usa consultas, submissões de anamnese, rascunhos e relatórios associados a `consultation_id`. A jornada clínica em `/jornada` tem seu próprio registro, versão e aprovação. A integração deve definir um vínculo persistido entre esses registros ou armazenar a análise diretamente na consulta; não deve identificar o paciente apenas pelo nome.

| Tema | GPT consultado | Adaptação proposta |
| --- | --- | --- |
| Anamnese | Nove grupos; campos ausentes como “Não informado” | Mapear explicitamente as seções existentes, preservando respostas originais e sua versão |
| Bioimpedância | Inclui massa livre de gordura e massa de gordura; o extrator atual usa uma lista menor | Ampliar somente os campos aprovados, mantendo unidade, origem, data e distinção entre valor extraído e calculado |
| Dados ausentes | Exige afirmar que todos os dados necessários estão disponíveis | Gerar o estado de completude a partir dos dados efetivos; mostrar lacunas ao profissional |
| Energia e objetivo | Prevê cálculos e regras por objetivo | Separar cálculo determinístico da redação; documentar entradas, unidades e regras aprovadas pelo profissional |
| Suplementação e injetáveis | Manda incluir tabelas padronizadas em todos os protocolos | Manter como modelos para seleção e revisão do profissional, sem convertê-los automaticamente em prescrição individual |
| Conhecimento | Mistura modelos e arquivos identificados de pacientes | Separar referências anonimizadas dos dados privados de cada consulta |
| Documento | Define paleta, hierarquia e instruções de PDF | Reutilizar o padrão visual após conferir o modelo; preservar a etapa de aprovação humana |

Esta comparação avalia comportamento e integração de software. Não valida clinicamente as regras ou prescrições contidas no GPT.

## Implementação entregue no código

O painel `src/components/ClinicalAnalysisPanel.tsx` aparece em `/consulta` depois dos três blocos existentes. Exige anamnese confirmada carregada na ficha, exame salvo e confirmação explícita do profissional para enviar os dados clínicos à OpenAI. Oferece objetivo, orientação opcional e histórico das últimas dez solicitações. Mostra rascunhos, lacunas, pontos de revisão, falhas e análises desatualizadas.

As funções em `src/lib/clinical-analysis/` verificam sessão e admin antes de consultas clínicas e da configuração do provedor; revalidam antes de salvar. Usam o bearer do usuário, chave pública e RLS, sem service role. Validam ligação por IDs, versão, confirmação, correspondência dos nomes e limites dos dados. A evolução usa os históricos já salvos no exame daquela consulta; não busca automaticamente outros atendimentos do paciente.

A Responses API recebe instruções adaptadas, contexto delimitado e esquema JSON estrito, sem ferramentas externas, com `store: false`, limite de saída e timeout de 90 segundos. O link do GPT não é chamado como API. Nomes, e-mails e telefones estruturados são removidos do contexto enviado; textos livres podem conter identificadores, portanto os dados não são apresentados como anonimizados. Não há logs de respostas clínicas, corpos de erro do provedor ou segredos.

A migração `20260914140000_consultation_analyses.sql` adiciona histórico administrativo com RLS e funções SECURITY INVOKER. Registra origem, versão, impressão digital SHA-256, modelo, versão das instruções e autoria da sessão. Limita a dez gerações por administrador por hora, impede pedidos simultâneos na mesma consulta e reaproveita identificador de tentativa para evitar chamadas duplicadas. Falhas contam no limite. Resultados concluídos são imutáveis; mudança da fonte durante a geração descarta o resultado, e mudanças posteriores sinalizam desatualização ao carregar o histórico. Gerações pendentes por cinco minutos permitem uma nova tentativa.

Esta etapa entrega leitura e armazenamento de rascunhos. A edição/aprovação do texto e sua inclusão no PDF final ainda não estão integradas a este painel. Não gera prescrições, dietas, suplementação ou injetáveis automaticamente. Não altera a jornada clínica separada em `/jornada` nem dispara eventos BioReport → Jornada, mensagens ou workflows.

## Configuração e ativação

1. Incorporar os arquivos e aplicar a migração ao banco do BioReport. Preservar as políticas existentes, pacientes, consultas e relatórios.
2. Cadastrar `OPENAI_API_KEY` nos Secrets do BioReport e publicar. A listagem de nomes conferida no Lovable em 14/09/2026 ainda não contém essa chave; nenhum valor foi lido. Não colocar a chave no chat, código, variável VITE ou navegador.
3. Modelo padrão: `gpt-5.4`. Opcionalmente configurar `OPENAI_CLINICAL_MODEL` no servidor com um modelo compatível com Responses API e Structured Outputs. A disponibilidade efetiva depende do projeto OpenAI.
4. Abrir uma consulta de teste, carregar sua anamnese e salvar seu exame. Revisar o objetivo e confirmar o envio para gerar um rascunho. Conferir a resposta e o histórico antes de usar com dados clínicos reais.
5. Comparar resultados com exemplos aprovados pelo profissional. Adaptar instruções não garante respostas idênticas às do GPT no ChatGPT.

Nenhuma chave é compartilhada com Jornada/HighLevel. O modelo visual oficial e as referências anonimizadas continuam pendentes de confirmação; nenhum arquivo de conhecimento foi importado.

## Validação realizada

- `npm run test:clinical-analysis`: 18 testes Vitest e 32 verificações PostgreSQL/PGlite aprovados, com dados sintéticos e provedor simulado.
- Regressões existentes: 63 testes Node, 33 testes Vitest da jornada e 36 verificações PostgreSQL das consultas aprovados.
- TypeScript, ESLint dos arquivos alterados, `git diff --check` e build cliente/servidor aprovados. O build mantém os avisos anteriores de tamanho de chunks e módulos externos.
- Código do provedor, endpoint da OpenAI e resolução da configuração privada ausentes dos bundles públicos verificados.
- Prévia de navegador com o componente real e funções simuladas: ausência de fontes, confirmação obrigatória, rascunho salvo, exame alterado e configuração ausente conferidos.
- Não realizado: chamada real à OpenAI, geração com paciente real ou envio de eventos/workflows. Testes locais não demonstram disponibilidade da credencial nem validação clínica das respostas.

Referências técnicas: [instruções na API](https://developers.openai.com/api/docs/guides/text), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
