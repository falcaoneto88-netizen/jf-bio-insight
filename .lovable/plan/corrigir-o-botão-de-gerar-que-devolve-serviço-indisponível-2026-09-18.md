# Corrigir o botão de gerar que devolve "serviço indisponível"

## O que se sabe

A mensagem que aparece ("O serviço de geração está indisponível. Tente novamente mais tarde.") é
a mensagem genérica usada quando a OpenAI responde com um estado que não é falta de credencial
nem limite de créditos, ou quando a ligação falha. Hoje essa mensagem é a mesma para várias causas
diferentes, por isso ainda **não é possível afirmar a causa** sem observar uma chamada real.

Nota: existem dois botões parecidos — "Gerar análise clínica" (painel de análise) e "Gerar
protocolo completo" (etapa do protocolo). O texto observado corresponde ao da geração do
protocolo; a investigação cobre os dois caminhos, que partilham a mesma credencial e modelo.

## Passos

1. **Diagnosticar primeiro (sem alterar o produto).** Executar no servidor uma única chamada real
   com dados fictícios, pelos serviços existentes, e registar apenas evidência sanitizada: estado
   HTTP devolvido pela OpenAI, duração e código de erro. Sem chave, cabeçalhos nem conteúdo clínico
   nos registos. Se a falha for de conta (créditos/limite/credencial), parar e reportar — não há
   correção de código a fazer.
2. **Corrigir a causa confirmada.** Consoante o resultado: ajustar o pedido enviado (por exemplo o
   formato do esquema de resposta ou o modelo configurado) apenas no ponto que a evidência
   indicar, mantendo o mesmo fluxo, prompt e regras de aprovação.
3. **Melhorar a mensagem ao utilizador.** Distinguir, em português, "serviço recusou o pedido"
   de "serviço fora do ar" e de "limite/créditos", para que a próxima falha diga o que fazer.
   Continuar sem expor detalhes técnicos, chaves ou payloads.
4. **Validar.** Repetir a mesma chamada única com dados fictícios até obter sucesso ou uma causa
   externa confirmada; correr os testes existentes, verificação de tipos e compilação.

## Detalhes técnicos

- Caminhos envolvidos: `src/lib/journey/protocol-openai.server.ts` (`requestProtocol`,
  `readProtocolAiConfig`), `src/lib/clinical-analysis/provider.server.ts` (`requestAnalysis`) e os
  serviços que os chamam (`protocol-generation.server.ts`, `clinical-analysis/service.server.ts`).
- Ambos usam `POST https://api.openai.com/v1/responses`, `store:false`, `text.format` json_schema
  estrito gerado por `z.toJSONSchema(..., { target: "draft-7" })` e o modelo
  `OPENAI_CLINICAL_MODEL` com predefinição `gpt-5.4`.
- O mapeamento atual colapsa 400/404/5xx e erros de rede em `unavailable`; a evidência sanitizada
  do passo 1 é o que separa esses casos.
- Sem alterações a base de dados, RLS, segredos, ficheiros gerados, templates de impressão,
  aprovação/versionamento, GHL, mensagens ou workflows. Sem publicar.

## Limites

Só uma chamada real por tentativa, com dados 100% fictícios. Se a conta OpenAI estiver sem créditos
ou limitada, o botão continuará a falhar por motivo externo e isso será dito explicitamente.
