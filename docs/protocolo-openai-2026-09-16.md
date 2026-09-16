# Geração do protocolo pela OpenAI — 16/09/2026 (apenas prévia, não publicado)

## O que passou a existir

Fluxo único: **Consulta → dados já recebidos → geração revisável → aprovação humana → impressão/PDF da mesma versão**.

- `src/lib/journey/energy.ts` — cálculo determinístico interno: Cunningham `500 + 22 × MLG`.
  MLG do exame ou derivada `peso × (1 − PGC/100)` com origem registada. O fator de atividade
  só é aplicado depois de marcado como revisto na interface. Hipertrofia = manutenção (sem
  superávit automático); recomposição exige défice entre 15% e 25%; emagrecimento exige ajuste
  explícito do profissional. Uma meta calórica escrita pelo profissional substitui o cálculo.
  Entradas e método ficam no registo interno, nunca no documento do paciente.
- `src/lib/journey/protocol-openai.server.ts` — endpoint oficial Responses da OpenAI,
  `store: false`, JSON Schema estrito, timeout, limites de tamanho, erros em português para
  configuração ausente, 401/403, quota, recusa, resposta incompleta ou inválida. **Sem fallback
  para outro fornecedor.** Chave lida apenas no servidor; nunca registada.
- `src/lib/journey/protocol-ai.ts` / `protocol-generation.server.ts` — mesmo serviço usado pela
  interface (`prepararProtocolo`) e pelo assistente MCP (`preparar_protocolo`). Sessão, admin,
  proprietário, RLS, bearer, `expectedVersion`, fonte atual, quota e aprovação humana mantidos.
- `src/lib/journey/protocol-quality.ts` — bloqueia aprovação de protocolos novos sem refeições,
  sem quantidades ou sem as 3 substituições de proteína/carboidrato (e de gordura quando há
  gordura prescrita). Protocolos legados aprovados não são reavaliados.
- Bioimpedância passou a incluir massa livre de gordura e massa de gordura (extrator, editor,
  mapa consulta→jornada, documento e os três idiomas).
- `StepHtml` ganhou **Imprimir / Salvar PDF** usando exatamente o HTML e a versão/hash atuais,
  por impressão nativa, sem serviço externo. Rascunhos continuam marcados como rascunho.
- `/consulta` abre o protocolo na jornada como ação principal; `/review` continua disponível,
  agora identificado como **gerador antigo (secundário)**, sem apagar histórico.

Refeições permanecem sem horários (`Refeição 1, 2, 3…`) em pt-BR/es/en; horários de medicação,
sono e trabalho e durações de preparo são preservados.

## Dados enviados à OpenAI

Somente quando o profissional aciona a geração, e apenas da consulta selecionada: anamnese,
rotina, alergias, medicamentos relatados, exame, objetivo, orientações e meta calórica. Nome,
telefone, e-mail e identificadores de CRM são removidos dos campos estruturados. Textos livres
podem conter identificadores — **não se trata de conteúdo anonimizado**. O cabeçalho identificado
é montado localmente e nunca é enviado.

## Validação executada

- 164 testes Vitest (14 novos em `src/lib/journey/protocol-generation.test.ts`), 6 suites Node,
  verificação de tipos e build de produção: todos aprovados.
- Testes cobrem: geração com refeições completas, schema/provider, ausência de configuração sem
  fallback, cálculos e percentuais, MLG extraída e derivada, duas consultas distintas, lacunas
  bloqueando aprovação, legado intacto, refeições sem hora com horários clínicos preservados e
  ausência de pendências/método no documento.

## Limitações verificáveis

- **`OPENAI_API_KEY` não está configurada neste projeto.** Por isso nenhuma chamada real foi
  feita; a validação é integralmente simulada com dados fictícios. Assim que a chave for
  cadastrada em Project Settings → Secrets, a geração funciona sem mais alterações de código
  (`OPENAI_CLINICAL_MODEL` é opcional; o padrão continua `gpt-5.4`).
- Substituições são propostas para revisão do profissional, não equivalências nutricionais
  certificadas.
- Nada foi publicado: as alterações vivem apenas na prévia.

## Revisão de 16/09/2026 — correções e limites reais

Corrigido nesta prévia (não publicado):

1. **Meta calórica unificada.** O campo da interface e `energyInput.professionalTarget` são a mesma
   meta profissional; ela tem prioridade no contexto da IA e no documento. Meta explícita vale por
   si (guardada como método `profissional`, sem MLG nem fator inventados). Metas ≤ 0, sem unidade
   reconhecível ou fora de 400–10000 kcal/dia são recusadas; ajustes fora de ±40% e fatores fora de
   0,9–2,5 bloqueiam; nunca se produz meta negativa. MLG maior do que o peso é conflito e uma MLG
   informada inválida nunca é substituída em silêncio pela derivação.
2. **Medidas por data.** Peso e PGC vêm da mesma data (a do exame ou a data válida mais recente),
   nunca da posição na lista; sem PGC nessa data não se usa o de outra; conflitos na mesma data
   bloqueiam; com «sem exame» nada é aproveitado.
3. **Aprovação.** Pendências essenciais (meta válida, refeições, porções, substituições,
   prescrições por confirmar) bloqueiam e não podem ser dispensadas; os avisos podem ser marcados
   como revistos no painel. Prescrições são entradas estruturadas do profissional com confirmação
   individual — a IA não cria nem remonta medicação.
4. **Marcador do gerador.** É preservado na gravação; apagá-lo num pedido não desliga a validação.
   A validação da origem está separada da qualidade do rascunho, por isso um rascunho incompleto
   pode ser corrigido e gerado de novo.
5. **Preflight igual na interface e no MCP.** Revisão, fonte da consulta, versão esperada e
   configuração antes do envio; nova validação depois da resposta, antes de gravar. No MCP,
   `expectedVersion` e confirmação explícita do envio à OpenAI são obrigatórias.
6. **Qualidade.** Porções e substituições exigem número positivo com unidade; três alternativas
   distintas por categoria; a gordura é exigida pela categoria explícita do alimento, não por
   palavras em português. Refeições líquidas só quando indicadas.
7. **Documento.** Versão e hash são comparados antes de baixar, copiar, visualizar ou imprimir, e
   os bytes recebidos são conferidos por SHA-256. A impressão é cancelada em troca de paciente, de
   versão ou ao sair do ecrã. A aplicação nunca afirma que imprimiu: o navegador não o informa.
8. **Novos protocolos:** título «Protocolo avançado de …», campos ausentes assinalados, objetivo
   uma única vez, rodapé com paciente/versão/rascunho em todas as páginas e sem o logotipo grande
   repetido no fim da impressão. O documento legado mantém-se byte a byte.

### Limites verificados (o que NÃO foi testado)

- **OPENAI_API_KEY continua ausente no projeto: nenhuma chamada real foi feita.** Toda a validação
  da chamada usa `fetch` simulado (endpoint, `store:false`, schema estrito, 401/403/429/500,
  timeout, recusa, resposta incompleta, corpo e entrada grandes). O comportamento real do modelo
  permanece por confirmar até a chave ser cadastrada.
- A impressão foi testada com DOM falso (verificação de versão, obsolescência, bloqueio). **Não
  houve impressão física nem teste de diálogo nativo.**
- O layout foi conferido com WeasyPrint local sobre dados fictícios, não em impressoras reais.
- Executado nesta revisão: 207 testes Vitest, 76 testes Node, TypeScript e build.
- Nada foi publicado; a produção continua na versão anterior.

## Revisão f7cf9c99 — integridade no núcleo (16/09/2026)

Corrigido na origem, dentro de `patchJourney` (`core.server.ts`), e não em
invólucros do cliente:

- **Marcador do gerador.** Qualquer gravação preserva a classificação de
  protocolo gerado, incluindo `protocolo: null` (guarda protocolo vazio **com**
  marcador) e a gravação seguinte. Não há caminho de patch que o remova.
- **Prescrições como fonte única.** A secção de prescrição do documento é
  recriada deterministicamente em cada gravação **e** na prévia (`buildHtml`),
  apenas a partir de entradas confirmadas e completas. Remover a entrada remove
  o texto; uma secção injetada pelo editor não sobrevive. Alterar substância,
  dose, via ou frequência anula a confirmação, mesmo por patch direto.
  `confirmada` sem campos completos bloqueia a aprovação. A IA não cria
  prescrições.
- **Regeneração obrigatória.** Mudar objetivo, meta calórica, número de
  refeições, refeições líquidas, entradas de energia ou instruções depois da
  geração marca `regenerationRequired`, que bloqueia a aprovação e não se
  remove por patch. Só uma nova geração pelo caminho do servidor
  (`regenerated: true`, definido apenas pelo serviço) o liberta; editar texto
  não finge regeneração.
- **Medidas do exame.** Cabeçalho com data válida ausente do histórico já não
  usa um exame antigo como massa livre de gordura atual: devolve valores
  vazios e mensagem explícita, ficando a meta profissional disponível.
- **Impressão fail-closed.** Sem hash do servidor ou sem calculadora SHA
  disponível, o documento não é baixado, copiado, pré-visualizado nem impresso.
  O carregamento do iframe tem limite finito com limpeza garantida.

Snapshots finais/aprovados legados continuam intactos byte a byte; RLS, grants
e o escritor administrativo não foram alterados.

### Verificação realmente executada

233 testes Vitest (12 ficheiros), 76 testes Node (6 ficheiros), verificação de
tipos, lint dos ficheiros alterados e build — todos verdes nesta prévia.

### Limite real

`OPENAI_API_KEY` continua ausente: **nenhuma chamada real à OpenAI foi feita**.
Toda a cobertura da geração é por mocks e dados fictícios; o teste com chave
real permanece pendente. Nada foi publicado.

## Complemento final (16/09/2026) — quatro pontos remanescentes

- A gravação também exige nova geração quando a anamnese ou as medidas mudam
  de facto, não só quando mudam as opções do protocolo.
- A meta calórica profissional fica guardada no formulário depois de gerar, por
  isso não volta a "Sem meta" nem impede uma nova geração.
- O editor de secções dos protocolos gerados deixa de oferecer edição paralela
  da prescrição (que seria descartada ao guardar) e indica os campos
  estruturados.
- O texto enviado à IA já não pede o campo de prescrições: a secção é montada
  exclusivamente pelo servidor a partir das entradas confirmadas.

Validação executada nesta prévia: 238 testes Vitest (12 ficheiros), 76 testes
Node (6 ficheiros), verificação de tipos, lint dos ficheiros alterados e build —
todos verdes. Sem chave da OpenAI, sem chamada real, sem dados de pacientes e
sem publicação.
