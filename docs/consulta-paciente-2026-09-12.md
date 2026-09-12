# Consulta do paciente — 12/09/2026

## Estado da entrega

Implementação da tela `/consulta` e da ligação entre anamnese, bioimpedância e relatório. A migração `20260912120000` foi aplicada e confirmada no banco remoto em 12/09/2026. As quatro tabelas novas estão com RLS ativa e sem leitura/inserção anônima; os 18 relatórios existentes foram preservados. A aplicação depende da publicação deste código para apresentar o novo fluxo.

A versão foi integrada ao `main` remoto que já continha a jornada clínica de seis etapas. Esse fluxo e suas ferramentas MCP foram preservados. A página inicial dá acesso tanto à Consulta do paciente quanto à Jornada clínica e protocolos; os atendimentos da jornada não são associados automaticamente às novas consultas.

## Fluxo implementado

1. Um administrador abre **Consulta do paciente**, seleciona um paciente existente ou cadastra um novo e informa a data da consulta. Paciente, consulta e ficha inicial são criados em uma transação; repetir a mesma solicitação não duplica o atendimento.
2. O bloco **Anamnese** permite preencher na clínica ou copiar um link `/anamnese?consulta=<id>`. Para preenchimento remoto, o convite exige o e-mail confirmado da conta autenticada, igual ao informado pela clínica, e vale por 14 dias. Nesta interface, o login é feito com Google.
3. O paciente responde às oito seções, revisa as respostas e confirma com nome e declaração. O sucesso só aparece depois de o banco retornar a resposta salva. Falha de gravação mantém o rascunho e permite tentar novamente.
4. A clínica atualiza a consulta, lê as respostas originais e escolhe **Carregar na ficha clínica**. A importação mantém a versão original, preenche os campos compatíveis e inclui os demais dados nas observações. Não infere diagnóstico nem objetivo clínico. Uma ficha já preenchida exige confirmação antes de ser substituída.
5. O bloco **Bioimpedância** abre o fluxo existente de importação. As medidas conferidas são gravadas na mesma consulta. Diferenças de nome e idade entre anamnese e exame aparecem para revisão.
6. O profissional revisa a ficha e segue para a geração existente. O histórico salva o relatório com a consulta e a versão de anamnese utilizada. Os três blocos mostram as respostas recebidas, o exame salvo e os relatórios gerados.

## Vínculo e controle de acesso

- `patients.id` identifica o paciente; não há união automática de cadastros pelo nome.
- `consultations.id` identifica o atendimento, com referência ao paciente e dados do convite.
- `anamnesis_submissions` guarda versões confirmadas, sem permissão de edição ou exclusão pelo cliente. Data, autoria e versão da declaração são atribuídas pelo banco.
- `consultation_drafts` guarda as medidas do exame, a ficha clínica, a anamnese escolhida e um contador de versão. Uma gravação com versão antiga falha em vez de sobrescrever outra atualização.
- `reports.consultation_id` e `reports.anamnesis_id` guardam a origem do relatório. Chaves estrangeiras impedem vincular respostas de outro atendimento.
- Cadastros, fichas e relatórios são restritos a administradores. O paciente acessa apenas o convite vigente destinado ao seu e-mail confirmado e suas próprias respostas nesse convite.
- A RPC de criação usa `SECURITY INVOKER`, preservando as permissões e a RLS do usuário. A função de identidade `current_verified_email()` tem escopo limitado ao e-mail confirmado de `auth.uid()`.
- Os clientes usam a sessão autenticada existente. Não foi acrescentada chave de serviço nem acesso anônimo a dados clínicos.

## Ativação no ambiente remoto

O banco remoto já recebeu as migrações administrativas `20260911131740` e `20260911132739`, que substituem a proposta local anterior. A proposta antiga foi arquivada em `docs/sql/20260910180000_restrict_report_access.sql`; não deve ser reaplicada como migração pendente.

Foi aplicada `supabase/migrations/20260912120000_patient_consultations.sql`, que cria as tabelas, funções, vínculos e políticas de consultas. A execução e seu registro em `supabase_migrations.schema_migrations` ocorreram na mesma transação. A migração exige a proteção administrativa existente e recusa um ambiente com acesso público ao histórico.

Publicar a versão correspondente da aplicação junto com essa atualização de banco. Não editar manualmente arquivos com banner de geração automática. Os tipos das novas tabelas foram estendidos em `src/lib/consultations/types.ts`; o `routeTree.gen.ts` foi atualizado pelo gerador de rotas do Vite.

Depois da ativação, validar com dados fictícios e contas autorizadas: criar uma consulta, entrar pelo convite com o e-mail correto, confirmar a anamnese, carregá-la na ficha, importar um exame, salvar e reabrir a consulta, gerar um relatório e conferir seu vínculo no histórico. Verificar também conta sem papel admin, conta de outro paciente, convite vencido e sessão expirada. Esse fluxo autenticado completo ainda não foi executado contra o ambiente remoto.

## Validação local

- `node --test tests/*.test.mjs`: 53 testes aprovados de MCP, acesso, anamnese e consultas.
- `npx vitest run src/lib/journey`: 33 testes da jornada clínica existente aprovados após a integração.
- `npm run test:consultations`: 9 testes de consultas e 36 verificações SQL aprovadas, cobrindo mapeamento de respostas, erros de acesso, repetição de envio, concorrência e políticas executadas com PostgreSQL local via PGlite.
- As verificações SQL carregam as migrações reais e usam dados fictícios. Cobrem isolamento entre pacientes, e-mail confirmado, validade do convite, autoria/data, imutabilidade, vínculo entre tabelas, criação atômica, repetição segura e conflito de versões.
- TypeScript, lint dos arquivos alterados e build de produção aprovados.
- Navegador local: bloqueio de `/consulta` sem login e entrada por convite sem exposição de dados clínicos.

## Limites desta etapa

- `/anamnese` sem identificador continua como formulário avulso, sem envio à clínica. Para salvar, é necessário abrir o formulário pelo atendimento.
- O rascunho do paciente vinculado fica em `sessionStorage` na mesma aba até o envio. Não é uma gravação no banco nem uma sincronização entre dispositivos. O fluxo administrativo mantém o armazenamento local já existente para recuperação do rascunho.
- A confirmação registra a conta que enviou e o nome declarado. Quando preenchida numa sessão administrativa, a autoria técnica é do administrador; não constitui verificação independente da assinatura do paciente.
- O banco guarda os valores extraídos da bioimpedância. O arquivo original do exame não foi adicionado a um armazenamento remoto.
- A lista mostra até 100 consultas e 200 pacientes; cada consulta carrega até 30 versões de anamnese e 30 relatórios. Paginação, edição de cadastro e renovação de convite ainda não têm interface.
- Relatórios antigos continuam disponíveis sem associação automática a pacientes ou consultas.
- Esta etapa não cria automações no HighLevel/Jornada AI nem envia mensagens. O vínculo persistente da consulta prepara a integração futura de eventos de status.
