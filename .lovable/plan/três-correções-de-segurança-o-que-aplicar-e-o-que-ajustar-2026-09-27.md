# Três correções de segurança — o que aplicar e o que ajustar

Conferi cada ponto do pedido no projeto real. Uma correção vale como está, uma precisa de ajustes e duas não devem ser aplicadas como escritas.

## Correção 1 — arquivo `.env`: aplicar só uma parte
Situação conferida: o `.env` do projeto guarda apenas 6 valores públicos (endereço do backend e chave publicável, que já vão para o navegador de qualquer forma). As chaves secretas (OpenAI, GHL, chave administrativa) **não estão nele**: ficam no cofre de segredos do servidor.
- Esse arquivo é gerado e mantido automaticamente pela plataforma. Remover o rastreamento dele (`git rm --cached`) quebraria a prévia e a publicação. Por isso **não será feito**, e o `.gitignore` não vai ignorar o `.env`.
- Vou criar `.env.example` só com os nomes, sem valores, para documentação. O modelo vem como `gpt-5.4`, ver abaixo.

## Correção 2 — trocar `gpt-5.4` por `gpt-4o`: não aplicar
A premissa está errada. `gpt-5.4` foi validado antes com uma chamada real ao provedor: o pedido foi reconhecido e só recusado por limite de uso (429), não por "modelo inexistente". Trocar para `gpt-4o` pioraria a qualidade clínica e quebraria 3 testes existentes. O modelo continua configurável pelo segredo `OPENAI_CLINICAL_MODEL`. Nenhuma alteração.

## Correção 3 — rascunho antigo no navegador: aplicar com ajustes
Confirmado: o fluxo antigo (upload → revisão) guarda consulta, bioimpedância, dados clínicos e prescrição em `localStorage` (`jf-bioreport-draft`).
- Adicionar `partialize` persistindo **apenas** preferências de layout (`dietCustomization`, `mealTimeOverrides`, `extraMeals`, `reportOptions`). O campo `prescriptionData` do texto não existe. O campo real é `prescription`, que é dado clínico e ficará só em memória.
- Na primeira carga após a mudança, apagar do armazenamento os dados clínicos que já estavam salvos, subindo a versão do armazenamento com uma migração que descarta esses campos.
- Exportar `clearReportStoreOnLogout()` (reset + remoção da chave).
- Chamar essa limpeza no evento `SIGNED_OUT` do hook de sessão administrativa já existente. O arquivo do cliente do backend é gerado automaticamente e não pode ser editado.
- Efeito visível: ao recarregar a página ou sair da conta, um rascunho do fluxo antigo que não foi salvo se perde. A jornada nova não é afetada, porque já não guarda dados clínicos no navegador.

## Verificação
Rodar os testes de anamnese e de consultas, a suíte da jornada, tipos e build. Manter o pin 2.13.1. Nada publicado.
