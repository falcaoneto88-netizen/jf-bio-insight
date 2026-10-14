# Política de Privacidade — BioReport Studio

## O que existe hoje (conferido no projeto)

- Não há política de privacidade: nenhuma página, nenhum link, e `/privacidade` e `/privacy-policy` respondem **404** no site publicado.
- O formulário que o paciente recebe (`/anamnese`) já exige uma caixa marcada, mas ela confirma apenas a **veracidade das respostas** ("Declaro que as informações fornecidas nesta anamnese são verdadeiras e completas…"). Não fala de dados.
- Essa caixa é gravada como `accepted` na tabela de anamneses e o servidor recusa o envio sem ela.
- A tela de login e o rodapé do formulário do paciente só mostram a marca "Dr. João Falcão".
- No repositório não há **e-mail, telefone, CNPJ ou registro profissional** da clínica — nada disso pode ser inventado.

## O que será feito

### 1. Página pública `/privacidade`

Nova página aberta a qualquer pessoa, sem login, com o mesmo visual do restante (creme, grafite, preto, dourado), legível no celular e imprimível. O texto aparece no HTML da página (útil para quem chega por link).

Estrutura em português, no padrão da LGPD:

```text
1. Quem somos e quem responde pelos dados
2. Que dados coletamos (anamnese, bioimpedância, exames, histórico)
3. Para que usamos cada dado
4. Base legal (tutela da saúde + execução do atendimento)
5. Com quem os dados são compartilhados
6. Por quanto tempo ficam guardados
7. Seus direitos (acesso, correção, exclusão, revogação) e como exercer
8. Como o link do formulário funciona e por que não repassá-lo
9. Contato do responsável
10. Data da última atualização
```

Sobre o item 5, o rascunho descreve exatamente o que o código faz hoje — nada além:

- hospedagem dos dados e autenticação (plataforma onde o projeto roda);
- assistente de IA usado na redação do protocolo, que recebe texto sem nomes, e-mails e telefones estruturados, e cujas respostas não são registradas;
- CRM de agendamentos, que guarda contato, consulta e anamnese;
- aviso administrativo ao Jornada AI, que leva apenas identificadores técnicos e datas, sem nome, contato, medidas ou texto clínico.

O texto **não** dirá que os dados são anonimizados: textos livres podem conter identificadores.

### 2. Aceite obrigatório no formulário do paciente

Um segundo aceite, separado e obrigatório, antes de enviar:

> "Li e aceito a Política de Privacidade." (link abre a página em nova aba)

- A declaração de veracidade que já existe continua igual, sem mudança de texto — ela faz parte dos registros antigos.
- O servidor passa a recusar o envio sem o aceite da política.
- Fica registrado **qual versão** da política foi aceita e quando, para que haja prova em caso de questionamento.
- Quem já enviou antes não é afetado: os registros antigos continuam válidos e legíveis.

### 3. Onde o link aparece

- No formulário do paciente: no bloco da declaração e no rodapé.
- Na tela de login.
- Nas telas internas do consultório: nada, conforme combinado.

### 4. Ajuste de arquivo

A lista de páginas públicas do bloqueio de acesso passa a incluir `/privacidade`. É a única mudança de acesso: nenhuma permissão de banco, papel ou regra de visibilidade de dados é alterada.

### 5. Testes

- Envio sem aceite da política é recusado; com aceite, passa.
- Registro antigo, sem as colunas novas, continua lendo normalmente.
- `/privacidade` abre sem sessão e não mostra nenhum dado de paciente.
- As colunas novas não ficam acessíveis a quem não tem sessão.
- A política precisa conter contato do responsável: se o campo estiver preenchido com espaço reservado, o teste falha — assim nada vai ao ar incompleto.

### 6. Pendência de versão

A ferramenta de configuração do projeto voltou sozinha para 2.25.3. Ela volta a 2.13.1 com o arquivo de travas correspondente, como combinado.

## O que não muda

- Nada é publicado: a publicação continua sendo etapa separada, depois da sua revisão.
- Nenhum dado de paciente é lido ou alterado; nenhum contato, mensagem, campanha ou etapa de CRM é tocada.
- Nenhuma chamada paga de IA, nenhuma nova dependência, nenhum arquivo gerado editado à mão.
- Permissões de acesso do banco, papéis e regras de visibilidade permanecem como estão.
- O aviso automático ao Jornada AI continua desligado.

## O que preciso de você antes de publicar

O rascunho é escrito com espaços reservados bem visíveis (`[preencher]`) nos pontos que não posso inventar. Para a página ir ao ar, preciso de:

1. **Quem responde pelos dados** — nome do profissional ou razão social, e CNPJ se houver.
2. **Canal de contato** para pedidos de acesso, correção e exclusão (e-mail e/ou telefone).
3. **Tempo de guarda** dos prontuários e exames (ou a norma que você segue).
4. **Confirmação** de que a lista de itens 5 acima corresponde ao que você faz hoje.

Sem esses quatro pontos, a página fica pronta na prévia, marcada como rascunho, e não é publicada.

## Detalhes técnicos

- `src/routes/privacidade.tsx`: `createFileRoute("/privacidade")`, sem `ssr: false`, com `head()` próprio (título, descrição, `og:title`, `og:description`, `og:type: website`, `og:url` e `canonical` apontando para `https://jf-bio-insight.lovable.app/privacidade`).
- `src/components/AccessBoundary.tsx`: adicionar `"/privacidade"` à lista de caminhos públicos do `AccessGate`.
- Migração aditiva e idempotente sobre `public.anamnesis_submissions`: `ADD COLUMN IF NOT EXISTS privacy_policy_version text` e `privacy_accepted_at timestamptz`, ambas anuláveis, sem toque em políticas de segurança, concessões ou linhas existentes.
- `src/lib/anamnesis/form.ts`: constante de versão da política (`privacidade-2026-10-14`) e rótulo do aceite; a `confirmationSchema` atual permanece inalterada.
- `src/lib/intake-invitations/service.server.ts` e `src/lib/consultations/api.ts`: exigir aceite da política e gravar versão e data; o vínculo do convite continua validado como hoje.
- `src/routes/anamnese.tsx`: segundo `ana-declaration` obrigatório com link `target="_blank"`; `src/routes/login.tsx`: link discreto ao fim da tela.
- Cores apenas por tokens do tema (`--color-*`, `--color-gold`), sem valores fixos no componente.
- Testes em `tests/anamnesis.test.mjs`, `src/lib/intake-invitations/invitations.test.ts` e `supabase/tests/intake-invitations-access.mjs`, com dados sintéticos.
- Verificação final: tipos, compilação e as suítes existentes (Vitest e `node --test`), sem publicar.
