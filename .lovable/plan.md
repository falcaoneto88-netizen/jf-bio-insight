# Refinamento visual e de navegação clínica

## Objetivo
Tornar `/consulta` e `/jornada/$id` mais claras para o trabalho diário, mantendo integralmente os fluxos, dados, confirmações e proteções existentes.

## Implementação
- Reorganizar a lista para destacar consultas existentes e manter “Nova consulta” facilmente acessível, sem novas consultas ao backend.
- No detalhe, criar uma hierarquia de paciente, data, estado e uma única próxima ação principal derivada dos dados já carregados.
- Tratar carregamento e erro da análise separadamente; priorizar a atualização quando a fonte estiver desatualizada e só considerar aprovação atual quando versão e fonte coincidirem.
- Destacar a revisão da anamnese recebida, preservar escolha/importação por versão e mostrar separadamente recebimento, aplicação na ficha e confirmação pendente.
- Organizar Anamnese, Bioimpedância, Análise e Relatório como fluxo clínico; manter gerador antigo, relatórios e integrações em áreas secundárias expansíveis.
- Atualizar o progresso da jornada para usar confirmações persistidas, protocolo, aprovação, versão e fonte, sem depender da etapa visual aberta.
- Aplicar os tons clínicos apenas às telas abrangidas, mantendo impressão e restante aplicação intactos.

## Validação
- Adicionar testes comportamentais para prioridade da próxima ação: carregamento, erro, ausência de exame permitida, fonte desatualizada e aprovação antiga.
- Testar que voltar no atendimento não remove indicadores de conclusão persistida.
- Verificar navegação por teclado, foco, labels, contraste e layouts de 390, 768 e 1440 px com estados sintéticos, sem consultar ou editar pacientes reais.
- Executar os testes relevantes, TypeScript e compilação completa.

## Limites
Nenhuma alteração em backend, APIs, banco, segurança, cálculos clínicos, geração, aprovação, versionamento ou impressão. Nenhuma chamada à OpenAI, CRM ou mensagens. A alteração permanecerá somente na prévia e não será publicada.
