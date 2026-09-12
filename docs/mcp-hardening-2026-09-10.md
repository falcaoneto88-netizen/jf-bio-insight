# Correções MCP 0.3.0 — revisão local

Implementadas na branch `codex/restrict-report-access`, sobre `5ee53c8c192625e24f3475089453a798b46a39a7`. Não publicadas. A migração RLS continua pendente de aplicação.

## Evolução de pacientes

- Exige nome completo e exato; diferenças de caixa e espaços nas extremidades são toleradas.
- Recusa nomes com reticências, resultados que incluam nomes diferentes e históricos incompletos/superiores a 500 relatórios.
- Escapa `%`, `_` e `\` no filtro LIKE.
- Agrupa relatórios por data/hora de exame. Se as quatro métricas comparadas coincidirem, mantém a versão gerada mais recentemente; se houver conflito, recusa o cálculo.
- Ordena pela data do exame e aplica o limite aos exames distintos mais recentes, sinalizando truncamento.
- Datas inválidas são excluídas com contador explícito; valores ausentes/inválidos tornam-se null.
- Menos de dois exames distintos: `comparable: false`, `change: null` e mensagem de dados insuficientes. Não apresenta uma falsa variação zero.

Limitação: o banco continua sem cadastro/ID único de paciente. Pessoas com o mesmo nome não são distinguíveis; a resposta avisa explicitamente. Não foram inferidas identidades nem alterados nomes/dados clínicos. Nomes abreviados existentes, como os observados na auditoria, precisam de identificação corrigida antes de usar a evolução.

Datas sem timezone são comparadas consistentemente como horário local representado em UTC, sem inferir o fuso do paciente. Uma data com horário diferente continua sendo outro exame; não se deduz duplicação apenas pela coincidência das medidas.

## Erros GHL

- Corpos de erro do fornecedor não são registados nem enviados ao cliente.
- Logs de falha HTTP contêm somente status e método, sem caminho/ID de contacto, parâmetros ou headers.
- Falhas de rede, timeout de 15 segundos, JSON inválido e configuração ausente usam mensagens portuguesas controladas.
- Respostas de pesquisa sem a estrutura esperada são recusadas.
- Não há retry automático de escrita; mensagens de resultado incerto orientam verificar o envio antes de repetir.

## Validação e contrato

- UUID nos IDs de relatório; datas ISO válidas; intervalo inicial/final coerente.
- Limites no Zod: list_reports 1–100, ghl_find_contact 1–25, patient_evolution 2–50.
- Limites de comprimento em nomes, pesquisa, email e contacto; email válido e telefone internacional E.164.
- `confirm` passa a literal true; a proteção no handler permanece para defesa adicional.
- Descrição da escrita explicita criação/atualização de contacto; `destructiveHint: true` sinaliza o upsert.
- Filtro final de datas usa o início exclusivo do dia seguinte, incluindo frações de segundo do último dia.
- list_reports só sinaliza truncamento quando encontra um registo adicional.
- Falhas de consulta/permissões não devolvem mensagens internas brutas do Supabase.
- Metadados incrementados para 0.3.0 e manifesto regenerado com @lovable.dev/mcp-js.

## Validação

`npm run test:mcp`: 17 testes de regressão com dados fictícios, queries simuladas e fetch substituído. Nenhuma chamada de escrita GHL real foi feita. O teste de confirmação chama apenas o handler local com autorização simulada.

`npx tsc --noEmit`: passou. Foi necessário ajustar a tipagem preexistente do erro global de Error para unknown, compatível com o contrato atual do TanStack; sem mudança do comportamento da tela.

ESLint dos módulos alterados: passou. Build de produção validado localmente; os avisos das dependências existentes (chunks grandes, diretivas use client e deprecações) não foram tratados neste escopo.

Dependências instaladas localmente com npm sem modificar bun.lock; validação usa as versões resolvidas a partir das faixas de package.json (incluindo MCP 2.0.4). Antes de publicar, executar também o pipeline com o lockfile Bun do ambiente Lovable.

Não foram alterados dados, permissões de produção, configuração OAuth ou ficheiros gerados manualmente. As correções requerem publicação posterior para afetar o MCP remoto.
