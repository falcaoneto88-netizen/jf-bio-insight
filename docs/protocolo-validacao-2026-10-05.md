# Complemento dos três blocos — 05/10/2026

Base remota verificada: abb3b29a823b16f848160fd941e3556d87e0046a.
Projeto existente: BioReport Studio, 26a42c4a-b53d-4fa2-b737-3b14bf0e0665.

Os blocos oral/injetável e a exigência das quatro categorias já estavam no código remoto. Este complemento preserva esse trabalho e acrescenta:

- Edição direta de Proteínas, Carboidratos, Gorduras boas e Frutas no bloco próprio, preservando refeições, categorias extras e tabelas personalizadas.
- Reconhecimento das categorias nos três idiomas existentes, com cabeçalhos Categoria/Opções.
- Aviso honesto para documentos anteriores: ausência da nova validação não significa categorias completas.
- Confirmação individual invalidada por qualquer alteração de campos, sem colisão por separador textual.
- Validação e montagem das prescrições estruturadas também em protocolos manuais. Documentos legados sem essa estrutura e snapshots já aprovados permanecem intactos.
- Impede rebaixar o marcador v2 para dispensar as categorias obrigatórias.

## Evidências locais

- 347 testes Vitest aprovados, 19 arquivos; TypeScript sem erros; build Vite/Nitro concluído.
- Interface real StepProtocolo testada em harness local isolado, com geração de IA desabilitada e persistência somente em memória.
- Quatro categorias editadas; prescrição oral e injetável fictícias preenchidas e confirmadas; alteração de horário revogou a confirmação; salvamento e nova confirmação funcionaram.
- HTML sintético mostrou os três blocos e horários de prescrição 22:15/09:15; refeições mantidas sem horários.
- Revisão visual desktop e celular 390 x 844, sem transbordamento horizontal (clientWidth e scrollWidth 390).
- Nenhum paciente real editado, nenhuma aprovação clínica, nenhum envio ao CRM ou paciente.

## Limites e publicação

Os testes de HTML não comprovam paginação do PDF. A impressão A4 paginada permanece sem validação nesta sessão.
A incorporação, publicação e verificação em produção serão registradas no relatório de entrega fora deste commit, com a revisão exata que o Lovable devolver.
Não há migração nem alteração de autenticação/RLS.

## Reversão

Reverter somente o commit deste complemento ou restaurar os oito arquivos alterados a partir da base abb3b29 e republicar. Não restaurar dados de pacientes nem snapshots aprovados; não é necessária reversão de banco. Se houver alterações posteriores, usar reversão seletiva e repetir os testes.
