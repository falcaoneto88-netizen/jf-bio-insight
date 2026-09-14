# Anamnese por convite no pré-procedimento — 14/09/2026

## Estado da entrega

Implementação local concluída e testada. Ainda **não instalada nem publicada em produção**. Nenhuma chave desta integração foi gerada/cadastrada; nenhuma mensagem, inscrição ou execução do workflow foi realizada. A configuração examinada no GHL foi cancelada sem salvar.

O endereço destinado à ação HTTP é `https://jf-bio-insight.lovable.app/api/public/ghl-anamnese`. Ele cria o link individual; não é o endereço a enviar ao paciente. Não substituir o valor global `{{custom_values.link_da_anamnese}}` por esse endpoint ou por um convite individual.

## Fluxo implementado

1. A execução do workflow solicita um convite com o ID do contato e do agendamento.
2. BioReport autentica a integração, consulta o GHL e exige contato e agendamento da mesma subconta, calendário de procedimento configurado, estado confirmed e data/hora futuras, em até 365 dias, com fuso válido.
3. O banco reutiliza o vínculo `(location_id, contact_id)` do paciente e cria uma consulta com ficha inicial. Repetir a solicitação do mesmo agendamento/horário não duplica registros.
4. O GHL recebe `can_proceed`, `consultation_id`, `appointment_id`, `appointment_start`, `appointment_timezone`, `consultation_date`, `anamnese_url`, `can_send`, `status` e `expires_at`. `can_proceed` só é verdadeiro após a confirmação do vínculo no banco. `can_send` controla apenas o novo envio da anamnese; um formulário já recebido não bloqueia o restante do atendimento.
5. O paciente abre o formulário sem Google, revisa e confirma. Nome e data vêm do agendamento e ficam protegidos contra edição nessa página.
6. A resposta é salva em `anamnesis_submissions`, ligada à consulta e ao convite. Na tela Consulta do paciente, o admin abre essa consulta, seleciona a anamnese recebida e a carrega na ficha clínica. Bioimpedância e relatório seguem o fluxo existente; não são gerados automaticamente pelo convite.

## Configuração exata no GHL

Workflow verificado: **Pré-Procedimento Harmonização Glutea**, ID `7d031041-4aa6-42c7-b98d-28c8571d1b87`, subconta `ok2UHC2QMZsd8UHsAgEa`.

A revisão completa encontrou três SMS com o valor global: os dois chamados **Anamnese** e **SMS: 3h before procedure + anamnesis link**. O terceiro pertence a uma continuação com problemas de horário e deve ser reorganizado antes da ativação. Consulte `revisao-workflow-pre-harmonizacao-2026-09-14.md`. A entrega por outro canal não foi validada.

Na entrada, antes de qualquer SMS, inserir uma ação **Webhook personalizado**, nome sugerido **Validar procedimento e vincular consulta BioReport**. O gatilho deve ser **Appointment Status = Confirmed**, apenas o contato principal, no calendário escolhido. Não usar a etapa Consulta Realizada como prova de procedimento confirmado. A mesma operação pode ser repetida antes do envio da anamnese para revalidar agendamento e recuperar o convite:

- Método: POST.
- URL: `https://jf-bio-insight.lovable.app/api/public/ghl-anamnese`.
- Autorização: Bearer; usar somente a credencial privada desta integração.
- Content-Type: `application/json`.
- Corpo bruto:

```json
{
  "location_id": "ok2UHC2QMZsd8UHsAgEa",
  "workflow_id": "7d031041-4aa6-42c7-b98d-28c8571d1b87",
  "contact_id": "{{contact.id}}",
  "appointment_id": "{{appointment.id}}"
}
```

`Appointment → ID` e a expansão `{{appointment.id}}` foram conferidos no seletor dessa conta. A execução precisa conservar o contexto do agendamento; o servidor rejeita valores ausentes ou outro contato, sem tentar adivinhar pelo nome.

Marcar **Guardar a resposta deste Webhook** — opção confirmada na interface. O GHL pede um teste para capturar a estrutura da resposta. Fazer esse teste apenas depois da instalação, usando contato e agendamento fictícios controlados pela clínica. Não usar pacientes reais ou endpoints públicos de inspeção de webhooks.

Na entrada, continuar somente com resposta HTTP de sucesso, `can_proceed = true`, `consultation_id` e `appointment_start` preenchidos. Usar o horário validado como referência do evento, seguido de Waits reais; não copiar a data da oportunidade para o contato sem confirmar que pertencem ao mesmo agendamento. Antes da mensagem de anamnese, exigir também `can_send = true` e `anamnese_url` preenchido. Em erro, encerrar o ramo e encaminhar para revisão da equipe; não enviar o antigo link global como alternativa. Em `status=submitted`, não enviar novamente.

Na mensagem, inserir pelo seletor o campo **anamnese_url** da resposta da ação de validação/convite. O identificador final dessa variável só existe depois de criar a ação e capturar a resposta; não foi inventado nem validado neste estágio. Aplicar somente nos caminhos mantidos após a revisão; não conservar os três envios duplicados automaticamente.

A interface identifica Webhook personalizado como **ação premium com cobrança adicional por execução**. O [guia oficial de preços](https://help.gohighlevel.com/support/solutions/articles/155000001156-highlevel-pricing-guide) informa preço-base de US$ 0,01 por execução premium. Franquias, plano e repasse da agência podem alterar a cobrança desta subconta, ainda não conferida. Nenhum teste pago foi executado.

Mensagem sugerida (o texto entre colchetes é uma indicação de edição, não uma variável pronta):

> Olá, {{contact.first_name}}! Antes da sua harmonização, preencha a anamnese pelo seu link individual: [inserir anamnese_url da resposta do webhook]. Revise as respostas e confirme o envio ao final. Se precisar corrigir os dados do agendamento ou tiver dificuldade, fale com a nossa equipe. Equipe Dr. João Falcão.

## Instalação e credencial

1. Incorporar o patch atualizado `bioreport-ghl-anamnese-step1.patch` sobre a prévia Lovable `4f394135a88afe825a861495298dace05116b7d1`, conferindo conflitos antes de aplicar.
2. Instalar **somente** `supabase/migrations/20260914180000_ghl_anamnesis_invitations.sql`. Não executar um comando que aplique todas as migrações pendentes.
3. Gerar uma credencial aleatória nova de 32 bytes (64 caracteres hexadecimais). Cadastrar exatamente o mesmo valor em `BIOREPORT_GHL_INTAKE_SECRET` nos Secrets do BioReport e na autenticação Bearer dos webhooks GHL. Não reutilizar `BIOREPORT_JORNADA_SIGNING_SECRET`, não colar segredos em chats, arquivos de código, mensagens ou URLs.
4. Definir `BIOREPORT_GHL_PROCEDURE_CALENDAR_ID` com o ID do calendário escolhido. Candidatos verificados: Procedimento Estético — Harmonização (`qBIk8m8vqXzLKMgJEdsF`) e Cirurgia — Bloco Operatório (`gffJKUiB7shoAGb6KaS8`). A escolha está pendente do usuário. Não usar o ID do grupo de calendários. Conferir as permissões da credencial GHL existente para leitura de contatos, agendamentos e subconta. O código mantém o cabeçalho de versão `2021-07-28` usado pela integração atual; a compatibilidade e os três escopos precisam do teste integrado após instalação.
5. Publicar a aplicação, entrar como admin em `/consulta`, abrir **Anamnese pelo GHL** e confirmar **Ativar recebimento**. Isso cadastra somente o hash da credencial no banco; não executa eventos nem envia mensagens.
6. Capturar a resposta com um agendamento fictício, inserir a variável no texto e validar a condição de erro/não reenvio. Conferir que o link continua completo após qualquer transformação do canal de mensagens.
7. Somente então salvar/ativar as mudanças no workflow. Um teste de entrega deve usar um destinatário controlado pela clínica, com autorização expressa para a mensagem de teste.

### Análise por IA mantida fora desta publicação

A migração `20260914140000_consultation_analyses.sql` e a ativação da análise por IA foram recusadas anteriormente. Esta entrega não depende delas. O patch retira a referência ao painel de análise da tela Consulta que existia na prévia anterior, preservando seus arquivos e o patch anterior para avaliação separada. O pacote não inclui essa migração nem gera análises. A compilação final não contém o painel ou a ação de geração no cliente.

## Acesso, validade e limitações

- O link funciona por posse: quem o receber pode ver o nome e a data e preencher uma vez. Não confirma a identidade pelo Google ou telefone. Orientar o paciente a não encaminhá-lo.
- O identificador fica no fragmento da URL, fora da requisição de navegação; a API recebe-o no corpo POST com `no-store` e política `no-referrer`. O banco guarda somente seu hash. Não registrar corpos dessas requisições nem respostas de emissão no sistema de observabilidade.
- O convite expira no primeiro destes prazos: 14 dias após emissão ou 24 horas após o início do agendamento. Depois de confirmado, reabri-lo mostra somente um recibo, sem respostas anteriores.
- O formulário por convite conserva as respostas somente na página até confirmar; fechar/recarregar antes do envio descarta o preenchimento. Isso é informado ao paciente. Após confirmação, a cópia clínica fica no banco.
- RLS e privilégios existentes das tabelas clínicas permanecem. As funções novas `SECURITY DEFINER`, com `search_path` vazio e privilégios mínimos, exigem a credencial da integração; resolver/enviar também exige o convite. O cliente do servidor usa a chave pública, nunca service role. O paciente não consegue chamar essas funções só com o convite e contornar o Zod do servidor.
- Cada envio guarda `invitation_id` e deixa `submitted_by` nulo, sem atribuir uma conta Google fictícia. A restrição exige exatamente um tipo de autoria. Usuários comuns não podem inserir `invitation_id` diretamente.
- Confirmação explícita, validação no servidor, transação e trava da linha protegem o envio. Repetir exatamente o mesmo envio retorna seu recibo; respostas diferentes ou outro identificador de envio são recusados.
- Limite de emissão: 100 novos convites por hora para esta integração. Repetições de convites existentes não consomem novas consultas. Esse limite não substitui controles de tráfego da infraestrutura.
- Reagendamento observado numa nova solicitação revoga convites anteriores ainda não respondidos e cria outra consulta, preservando registros. Não há monitoramento automático de cancelamentos; a equipe deve revogar manualmente quando necessário em **Consulta → Anamnese pelo GHL → Revogar convite**.
- Convites expirados/revogados exigem revisão da equipe; esta primeira versão não inclui reemissão manual para o mesmo horário. Troca de nome no GHL ou alteração de contato do agendamento também exige revisão, evitando união por nome/e-mail. Um paciente preexistente sem vínculo GHL pode ganhar um cadastro separado; não há fusão automática.
- Para interromper a integração, o admin pode desativar recebimento e o ramo no GHL. Desativar bloqueia todos os links até reativar; revogar um convite é permanente. Não apagar respostas ou reverter a migração destruindo registros.

## Verificação realizada

- TypeScript sem erros e compilação de produção aprovada.
- ESLint dos arquivos alterados e `git diff --check` aprovados.
- 63 testes de regressão existentes e 36 verificações PostgreSQL de consultas aprovados.
- 15 testes da integração no servidor; 56 verificações PostgreSQL específicas de configuração, privacidade, vínculo, expiração, revogação, repetição e cota.
- Fluxo visual com formulário real e banco PGlite temporário: obrigatórios, revisão, confirmação explícita, gravação e reabertura com recibo. Dados exclusivamente fictícios, sem Supabase ou GHL de produção.
- Conferência de largura de 390 px sem transbordamento horizontal e retorno à largura original do navegador.
- Código de assinatura, credencial GHL e funções privilegiadas ausentes dos arquivos JavaScript enviados ao cliente.

Falta validar o ciclo **GHL real → BioReport publicado → mensagem a destinatário de teste → consulta administrativa**. A inspeção da interface e os testes locais não comprovam a instalação em produção.

Referência oficial: [Webhook personalizado e captura de resposta no HighLevel](https://help.gohighlevel.com/support/solutions/articles/155000003305/).

## Etapa 1 — reforço após a revisão

Implementado localmente: calendário obrigatório; somente agendamento confirmed; data/hora futura com fuso explícito; bloqueio antes da gravação em qualquer divergência; conferência do vínculo entre paciente, contato e consulta em repetição; resposta `can_proceed` e contexto validado. A ativação administrativa também exige calendário configurado. Os erros HTTP de emissão incluem `can_proceed: false`, `can_send: false` e `anamnese_url: null`; não expõem respostas privadas do GHL.

O endpoint cria/reutiliza a consulta e o convite técnico de forma atômica. Chamá-lo não envia SMS nem confirma presença do paciente; “confirmed” é lido no GHL. A configuração do workflow e a instalação em produção continuam pendentes. Nenhuma automação foi duplicada, salva ou publicada nesta etapa.
