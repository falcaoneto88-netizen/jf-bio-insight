# Refinamento da consulta e do atendimento — 10/10/2026

## Alterações

- Busca local nas até 100 consultas carregadas, por nome, e-mail e data. Acentos e maiúsculas são ignorados; o ID e a ordem de cada consulta são preservados. Não procura nem associa pacientes por aproximação.
- Lista com nome completo, contato, data e ação de retomar; estado vazio e busca sem resultados distintos.
- Botão Nova consulta abre o formulário existente e encaminha o foco ao seletor de paciente.
- Identificação consistente na consulta e na jornada: paciente, data, versão salva e estado de revisão.
- Etapas com seleção atual separada da conclusão persistida: rascunho salvo, aprovação da versão atual e documento ainda indisponível. Reabrir uma etapa não apaga etapas salvas.
- Paleta clínica: creme #faf9f5, cinza #2b2b2b, preto #111111, dourado #c5a880.
- Entrada de 280 ms com deslocamento de 8 px; interação de 160 ms. Sem bibliotecas adicionais, rolagem forçada ou animações contínuas. `prefers-reduced-motion: reduce` desativa animações, transições e deslocamento ao passar o cursor.

## Verificação local

Base: `824d9bf05af4344e5cf824d460a7270f79d5707c`, branch `codex/clinical-motion-20261010`, checkout isolado.

- TypeScript sem erros; build Vite/Nitro concluído.
- Vitest: 20 arquivos, 350 testes aprovados, incluindo busca, navegação clínica, fontes desatualizadas e aprovação por versão.
- Interface real importada em prévia local com APIs substituídas por dados fictícios, escrita e geração de IA desativadas.
- Busca por nome sem acento, ausência de resultados, limpar busca e retomada pelo ID exato verificados pela interface.
- Nova consulta abriu o formulário existente com foco no seletor de paciente; nenhuma consulta foi cadastrada.
- Anamnese recebida ainda não aplicada e anamnese aplicada sem bioimpedância mantêm as ações existentes.
- Estados de carregamento e erro exibidos; erro permite tentar novamente e voltar à lista.
- Versão salva 8 com aprovação 7 continua em revisão, com documento bloqueado. Fonte desatualizada desabilita edição. Aprovação 8 corresponde à versão atual.
- Voltar à anamnese mantém etapas já concluídas. Navegação Tab entre etapas mostra foco visível.
- Larguras de 360, 390, 768 e 1440 px sem rolagem horizontal nas telas verificadas. Etapas em duas, três e seis colunas conforme largura.
- CSS computado normal: entrada 0,28 s e interação 0,16 s. Regra de movimento reduzido extraída do CSS e aplicada na prévia: animação `none` e transição `0s`. A preferência do sistema operacional não foi alterada.

## Escopo preservado

Sem alteração de API, banco, RLS, autenticação, integrações, prescrições, cálculo clínico ou templates de impressão. Permanecem os bloqueios por versão, vínculo, fonte, snapshot e aprovação profissional. Nenhuma gravação em prontuário, envio ao CRM, mensagem a paciente ou geração de análise paga durante esta validação.

## Publicação e reversão

Incorporar este diff ao projeto existente BioReport Studio (`26a42c4a-b53d-4fa2-b737-3b14bf0e0665`) somente sobre a base conferida. Comparar o conteúdo dos arquivos incorporados antes de publicar. Este documento registra verificação local; a evidência da versão publicada é registrada separadamente após a publicação.

Reversão: reverter somente o commit de refinamento visual e publicar novamente, preservando alterações posteriores de outros trabalhos. Não há migração de banco nem dados a reverter. A revisão anterior é a base acima.
