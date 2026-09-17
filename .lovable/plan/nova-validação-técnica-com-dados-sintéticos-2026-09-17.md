# Nova validação técnica com dados sintéticos

Objetivo: fazer **uma única** chamada real ao serviço de geração de protocolo com uma ficha totalmente fictícia e mostrar o documento gerado, sem aprovar, sem gravar consulta e sem publicar.

## O que será feito

1. Reutilizar a ficha sintética já existente da validação de 17/09 (adulto fictício, quatro refeições, alergia a amendoim, sem prescrições, meta profissional de 1.800 kcal/dia).
2. Executar uma única geração real pelo serviço atual (nada de simulação, nada de troca de modelo, prompt ou limites).
3. Verificar no resultado:
   - quatro refeições numeradas, sem horários;
   - porções em todos os alimentos e nas substituições;
   - três substituições de proteína e três de carboidrato por refeição;
   - alergia respeitada;
   - nenhuma prescrição inventada;
   - meta calórica de 1.800 kcal/dia refletida.
4. Gerar o documento em HTML como rascunho de teste e disponibilizá-lo para leitura, marcado como cenário técnico sem validade clínica.
5. Registar evidência sanitizada (modelo, duração, situação da resposta, contagens e pendências) junto aos ficheiros de validação já existentes.

## Regras respeitadas

- Sem aprovação, sem assinatura, sem gravação em consulta.
- Sem dados de pacientes reais, sem CRM, sem mensagens ou automações.
- Sem alterar código do produto, base de dados, permissões ou segredos.
- Sem publicar. Uma só chamada: em caso de falha, paro e reporto apenas a situação e o código de erro.
- Resultado é validação técnica do fluxo, não validação clínica do conteúdo.

## Detalhes técnicos

- Execução temporária no servidor usando `gerarProtocolo` / `requestProtocol`
  (`src/lib/journey/protocol-generation.server.ts`, `protocol-openai.server.ts`),
  contexto via `buildProtocolContext`, repositório apenas em memória.
- Renderização com o renderer atual (`src/lib/journey/html.ts`), estado rascunho.
- Artefactos em `docs/qa/` (JSON de evidência, protocolo estruturado, HTML de rascunho), sem segredos.
