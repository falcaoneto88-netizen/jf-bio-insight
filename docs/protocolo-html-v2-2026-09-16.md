# Protocolo clínico — modelo HTML v2

Implementado no projeto existente e validado localmente. Esta atualização não foi enviada nem publicada no Lovable. O pacote anterior da Consulta do paciente continua separado e pendente de publicação.

## Referência e escopo

- As quatro páginas do PDF fornecido foram renderizadas e examinadas antes da edição. O arquivo recebido foi `usar como referencia.pdf`.
- Não foi encontrado `AGENTS.md` aplicável neste repositório nem um asset correspondente à marca. Foi extraída a imagem original incorporada, com sua máscara alfa: PNG RGBA, 1535 × 270 pixels, sem redesenho.
- O modelo é compartilhado pela prévia, aprovação, exportação da UI e exportação MCP de qualquer jornada/consulta autorizada. Os exemplos entregues usam exclusivamente dados fictícios.
- O PDF de bioimpedância e o HTML do protocolo continuam sendo documentos distintos na Consulta do paciente. Esta entrega atualiza o protocolo clínico HTML.

## Comportamento entregue

Identidade com fundo `#faf9f5`, texto `#2b2b2b`, títulos `#111111` e detalhes `#c5a880`. Marca centralizada na abertura e no encerramento, incorporada como data URI, sem acesso à rede. Cards brancos, títulos com barra dourada, tabelas pretas com zebra discreta, primeira coluna em negrito e observações douradas.

Ordem: cabeçalho individual → anamnese → bioimpedância/evolução → objetivo/meta informada → orientações → refeições → substituições gerais → prescrição/suplementos → outras seções clínicas aplicáveis. Seções sem dados não ganham conteúdo artificial.

A anamnese usa duas colunas para cards curtos e largura completa para tabelas e textos longos. A bioimpedância preserva a whitelist existente, com unidades; não transforma massa magra em músculo esquelético nem TMB em meta calórica.

O editor aceita uma quantidade variável de refeições. Cada refeição tem alimentos/quantidades, preparo opcional, indicação explícita de preparação líquida e substituições fornecidas em proteína, carboidrato e gordura. Não há alimentos, doses ou equivalências padrões.

Refeições são apresentadas como Refeição 1, 2… (ou seus equivalentes no idioma selecionado). A apresentação de registros antigos trata títulos de refeições, listas, parágrafos e tabelas com coluna de refeição/horário, inclusive blocos identificáveis dentro de seções genéricas. Oculta horas/faixas e colunas de horário sem modificar o JSON original. A duração explícita de preparo, como “por 2h”, permanece. Horários de trabalho, sono, medicações e suplementos permanecem em seus blocos.

Idioma selecionável por protocolo: português, espanhol e inglês. Rótulos e datas são localizados. O idioma também é enviado ao organizador de novos rascunhos. Textos clínicos já confirmados não são traduzidos silenciosamente: a UI solicita revisar sua redação. Registros anteriores sem idioma continuam em português.

## Aprovação e integridade

- Novo documento: `documento-clinico-v2`. A prévia e o arquivo exportado usam a mesma função de renderização.
- Hash do HTML inclui CSS, versão do modelo e bytes do logotipo. A aprovação recalcula esse hash; uma prévia de outra apresentação é recusada.
- Metadados de aprovação mantêm versão, autor, data, vínculo com consulta e prova da marca. Nenhuma aprovação automática foi adicionada.
- A exportação final serve os bytes do snapshot aprovado, nunca uma regeneração pelo modelo atual.
- Finais históricos v1 com prova de integridade continuam válidos. A tela de aprovação de uma versão já aprovada mostra esse final preservado.
- Uma apresentação nova de uma versão já aprovada exige salvar uma nova versão e revisão humana. Repetir a aprovação do mesmo HTML é idempotente e não regrava o histórico.
- Novos campos de idioma/meta/categoria são opcionais na leitura, sem defaults que alterem hashes antigos.
- Permanecem as validações existentes de identidade, dados essenciais, proprietário/admin, versão concorrente e origem da consulta.

## Arquivos desta atualização

| Arquivos                                                                                                                      | Mudança                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/journey/html.ts`                                                                                                     | Modelo único, cards, tabelas, paginação A4 e documento autossuficiente.         |
| `src/lib/journey/meal-presentation.ts`                                                                                        | Adaptação de refeições legadas e ocultação de horários somente na apresentação. |
| `src/lib/journey/document-locale.ts`                                                                                          | Rótulos e datas em português, espanhol e inglês.                                |
| `public/brand/dr-joao-falcao.png`, `src/lib/journey/brand.ts`                                                                 | Marca original, versão e hash usados na renderização.                           |
| `src/lib/journey/types.ts`                                                                                                    | Bloco estruturado de refeição; categoria, idioma e meta opcionais.              |
| `src/components/jornada/ProtocolEditor.tsx`, `StepProtocolo.tsx`                                                              | Edição das refeições, categorias, idioma e meta informada.                      |
| `src/lib/journey/agent.server.ts`, `prompts.ts`, `src/lib/journey.functions.ts`, `src/lib/mcp/tools/journey-tools.ts`         | Estrutura do rascunho e preservação das opções do protocolo pela UI e MCP.      |
| `src/lib/journey/core.server.ts`, `src/routes/_authenticated/jornada/$id.tsx`, `src/components/jornada/StepAprovacao.tsx`     | Integridade visual, aprovação e preservação do final histórico.                 |
| `src/lib/journey/protocol-template.test.ts`, `journey-writes.test.ts`                                                         | Regressões de apresentação e aprovação.                                         |
| `src/lib/journey/__fixtures__/protocol-visual.ts`, `scripts/export-protocol-previews.ts`, `scripts/validate-protocol-pdfs.py` | Dois pacientes fictícios, exportação reprodutível e verificação dos PDFs.       |

Nenhuma migração de banco foi adicionada por esta atualização. Arquivos `AUTO-GENERATED` não foram editados manualmente. As modificações preexistentes da Consulta do paciente foram preservadas.

## Resultado dos testes

- 150 testes Vitest em `src`: aprovados, incluindo 26 casos específicos do novo modelo e a cobertura de aprovação/integridade.
- 76 testes Node existentes: aprovados.
- TypeScript sem emissão, ESLint dos arquivos alterados e build de produção: aprovados.
- Verificação automática e visual de 13 páginas A4, em dois documentos independentes: aprovada.

## Prévia e validação

- `output/html/protocolo-curto-ficticio.html`: português, 2 refeições, sem meta calórica inventada.
- `output/html/protocolo-extenso-ficticio.html`: espanhol, 7 refeições, anamnese longa, tabela geral com 44 linhas.
- `output/pdf/protocolo-curto-ficticio.pdf`: 3 páginas A4.
- `output/pdf/protocolo-extenso-ficticio.pdf`: 10 páginas A4.

Ambos os PDFs foram convertidos com WeasyPrint 68.0 e inspecionados visualmente. A verificação automática confirma tamanho A4, duas imagens de marca, numeração de todas as páginas, margens, refeições, conteúdo independente, presença dos horários clínicos e todas as 44 linhas com cabeçalhos repetidos. Os HTMLs entregues são idênticos aos produzidos pelo renderer atual para esses fixtures.

Cards curtos de refeição ficam juntos; blocos extensos podem continuar na página seguinte. Células muito extensas são divididas em linhas de continuação, mantendo ordem e conteúdo. Há testes que recompõem o texto original para verificar ausência de perda ou mistura de células.

Comandos reprodutíveis:

```sh
node --import tsx scripts/export-protocol-previews.ts
weasyprint output/html/protocolo-curto-ficticio.html output/pdf/protocolo-curto-ficticio.pdf
weasyprint output/html/protocolo-extenso-ficticio.html output/pdf/protocolo-extenso-ficticio.pdf
python3 scripts/validate-protocol-pdfs.py
npx vitest run src
node --test tests/*.test.mjs
npx tsc --noEmit
npm run build
```

O verificador de PDF usa `pdfplumber`. Nesta máquina, WeasyPrint/Pango foram instalados em diretórios isolados no workspace, sem alteração do ambiente do app. A referência técnica de paginação e conversão é a [documentação oficial do WeasyPrint](https://doc.courtbouillon.org/weasyprint/stable/api_reference.html).

Limites da validação: nenhum dado de paciente foi enviado a provedores; não houve chamada clínica real à IA, mensagem, workflow ou gravação em produção. A automação do navegador bloqueou a abertura do HTML local; a inspeção visual foi feita nos PDFs renderizados. A versão publicada do Lovable ainda precisa receber o código e ser conferida após implantação.

## Pacote de revisão

`../bioreport-protocolo-html-v2.patch` contém somente esta atualização (21 arquivos), incluindo a marca e os testes, sem o PDF clínico de referência. O patch usa como base o estado local com a Consulta do paciente já implementada; para o Lovable, deve ser incorporado após esse pacote anterior. A aplicação do patch é verificada em uma cópia isolada, comparando byte a byte os arquivos resultantes.
