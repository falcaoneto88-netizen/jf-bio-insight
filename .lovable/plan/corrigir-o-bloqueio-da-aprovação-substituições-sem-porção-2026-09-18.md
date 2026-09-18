# Corrigir o bloqueio da aprovação: substituições sem porção

## O que está acontecendo

Escrever APROVAR não adianta porque o botão fica bloqueado enquanto houver pendências essenciais (texto vermelho). No protocolo do Felipe (versão 13) a IA devolveu as substituições apenas com o nome do alimento — por exemplo "tapioca", "banana", "aveia em flocos" — e a regra da casa exige alimento **e** porção (ex.: "60 g de tapioca"). Por isso aparece uma pendência por refeição e por categoria.

## O que será feito

1. **A geração passa a trazer sempre a porção.** O pedido à IA exige, para cada substituição, alimento com quantidade e unidade; o texto de instruções deixa claro o formato ("120 g de frango"). A validação existente continua igual — ela é a rede de segurança.
2. **Você pode completar à mão.** No editor do protocolo, cada substituição fica editável, com aviso visível quando falta a porção, para corrigir sem depender de nova geração.
3. **Gerar de novo este protocolo.** Depois da correção, uma nova geração para o Felipe com a regra já aplicada, e conferência de que as pendências vermelhas de substituição desaparecem.
4. **Gordura:** a exigência de 3 substituições de gordura continua só nas refeições que têm alimento de gordura, como hoje.

## Fora do escopo

Nada de mudanças no banco, nas regras de acesso, na aprovação/versão, no documento impresso ou no gerador antigo. A pendência "Menos de duas datas confirmadas: sem tendência de evolução" é apenas aviso e não bloqueia.

## Detalhes técnicos

- `src/lib/journey/protocol-prompt.server.ts`: instrução explícita de formato "quantidade + unidade + alimento" em cada item de `substitutions.protein/carbohydrate/fat`, com exemplos.
- `src/lib/journey/protocol-ai.ts` / schema JSON enviado à OpenAI: descrição dos campos de substituição reforçando quantidade obrigatória (sem alterar a forma do schema nem o modelo/timeout).
- `src/components/jornada/ProtocolEditor.tsx`: edição das substituições por refeição, marcando em vermelho as que falham em `isValidSubstitution`.
- `src/lib/journey/protocol-quality.ts`: sem mudança de regra; apenas reutilizada na UI.
- Testes: casos em `protocol-generation.test.ts`/`protocol-quality` cobrindo substituição sem porção (bloqueia) e com porção (passa); rodar Vitest, tsgo e build.
- Depois: uma única chamada real de geração para a versão atual do Felipe, sem aprovar nem publicar.
