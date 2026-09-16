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
