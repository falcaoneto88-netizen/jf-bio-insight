# Jornada Clínica — Agente Clínico Dr. João Falcão

Extensão do BioReport Studio. O fluxo antigo (upload → revisão → PDF) continua disponível
em `/upload` e `/history`; os relatórios e integrações existentes não foram alterados.

## Percurso

`/jornada` lista os atendimentos e cria novos. `/jornada/$id` conduz as seis etapas:

1. **Anamnese** — 12 grupos fixos, edição direta e "Colar anamnese" → "Organizar com agente".
2. **Bioimpedância** — PDF/PNG/JPG, texto colado ou preenchimento manual; whitelist exata.
3. **Revisão e evolução** — identidade, lacunas, datas reais, PGC em pontos percentuais.
4. **Protocolo** — objetivo, instruções profissionais, rascunho do agente e editor por blocos.
5. **Aprovação** — pré-visualização exata, pendências internas e confirmação humana.
6. **HTML** — download, cópia e pré-visualização do documento completo.

Ambas as rotas vivem sob `src/routes/_authenticated/`, protegidas por sessão.

## Regras do agente (v1)

- **Anamnese**: numeração fixa 1–12; secções vazias são omitidas sem renumerar; "Nega" apenas
  quando explícito; nunca "Não informado"; medicação anterior nunca vira medicação atual.
- **Bioimpedância** — whitelist: paciente, altura (m), idade, sexo, data/hora, TMB (kcal),
  gordura visceral e histórico Data | Peso | Massa muscular esquelética | PGC. Sem IMC, água,
  massa gorda ou classificações. Datas DD/MM/AAAA e vírgula decimal.
- **Formatação por unidade**: `integerValue` para contagens (TMB 1365 → `1.365`),
  `decimalComma` para decimais preservando as casas originais (`70,0`, `34,0`).
- **Datas**: `dateSortKey` só aceita datas existentes no calendário (31/02 e 29/02 em ano comum
  são rejeitadas), sem conversão de fuso horário.
- **Evolução**: a transcrição literal do que se mostra é separada dos números usados no cálculo;
  linhas complementares da mesma data são fundidas célula a célula e divergências são listadas
  como conflitos, nunca resolvidas em silêncio; um único exame não gera tendência.
- **Protocolo**: só dados confirmados e instruções explícitas; sem calorias, macros, doses,
  assinaturas ou condutas inventadas; TMB não é meta calórica; emagrecimento fica pendente.
- **HTML**: `<!doctype html>`, UTF-8, CSS embutido, sem scripts nem pedidos de rede; paleta
  `#faf9f5` / `#2b2b2b` / `#111111` / `#c5a880`; A4 para WeasyPrint com cabeçalho e paginação;
  notas internas, fontes, dúvidas e pendências nunca são exportadas.

## Segurança

- Tabelas `jornadas_clinicas`, `jornada_aprovacoes` e `journey_ai_usage`: o cliente só tem
  leitura (e nenhuma em `journey_ai_usage`); todas as gravações passam pelo backend com
  service role, depois de validar sessão, papel de administrador e propriedade do registo.
- Toda a atualização exige `expectedVersion`; qualquer edição de conteúdo invalida confirmações
  dependentes e a aprovação em vigor.
- A aprovação é um ato humano: `assertHumanSession` recusa tokens de clientes OAuth delegados,
  e o servidor exige confirmações de anamnese, bioimpedância e revisão, objetivo com modelo
  disponível e protocolo com conteúdo.
- O HTML final é o snapshot exato guardado em `jornada_aprovacoes`, com autor, data, versão e
  hash validados — nunca é recalculado entre downloads.
- Limite de 40 pedidos ao agente por utilizador e por hora (`consume_ai_quota`).

## MCP

As cinco ferramentas antigas (`list_reports`, `get_report`, `patient_evolution`,
`ghl_find_contact`, `ghl_push_report`) mantêm-se. A jornada acrescenta `consultar_jornada`,
`organizar_anamnese`, `extrair_bioimpedancia`, `preparar_protocolo` e
`exportar_protocolo_html`. Todas exigem administrador e ficam limitadas ao dono do registo.
O MCP **não aprova**; pode exportar um rascunho identificado ou o final já aprovado.

## Ficheiros principais

| Área | Ficheiro |
| --- | --- |
| Regras e schemas | `src/lib/journey/types.ts` |
| Formatação | `src/lib/journey/format.ts` |
| Evolução | `src/lib/journey/evolution.ts` |
| HTML | `src/lib/journey/html.ts` |
| Prompts e IA | `src/lib/journey/prompts.ts`, `agent.server.ts` |
| Núcleo (CRUD, hash, aprovação) | `src/lib/journey/core.server.ts` |
| Server functions | `src/lib/journey.functions.ts` |
| Ferramentas MCP | `src/lib/mcp/tools/journey-tools.ts` |
| Interface | `src/routes/_authenticated/jornada/`, `src/components/jornada/` |
| Fixture sintético | `src/lib/journey/__fixtures__/jornada-sintetica.ts` |
