# Ativar o recebimento de anamnese pelo GHL

## Estado atual (verificado)
- `BIOREPORT_GHL_INTAKE_SECRET` — cadastrada nos secrets do projeto.
- `BIOREPORT_GHL_PROCEDURE_CALENDAR_ID` — cadastrada (qBIk8m8vqXzLKMgJEdsF, Procedimento Estético — Harmonização).
- Recebimento: **desativado** (a ativação só era bloqueada pela ausência da chave, que agora existe).
- Nenhuma alteração de código é necessária.

## Passo 1 — Ativar na interface (você, com login de administrador)
1. Abra a Consulta do paciente (rota `/consulta`) e clique em **Anamnese pelo GHL**.
2. Marque "Confirmo a ativação do recebimento por convite individual" e clique em **Ativar recebimento**.
   - Isso grava no banco, via backend autorizado, o hash da chave e a marcação de recebimento habilitado.

## Passo 2 — Configurar o webhook no GoHighLevel (você, no GHL)
1. No workflow de pré-procedimento, aponte o webhook para:
   `https://jf-bio-insight.lovable.app/api/public/ghl-anamnese`
2. Autenticação: campo Bearer com a **mesma chave de 64 caracteres hexadecimais** que você cadastrou nos Secrets.
3. A mensagem ao paciente deve usar o link retornado pelo webhook em cada execução (não um "Link da Anamnese" global fixo).

## Passo 3 — Teste controlado
- Usar apenas um agendamento confirmado real no calendário do procedimento (sem dados sintéticos no GHL).
- Abrir o link do convite, conferir nome/agendamento e enviar respostas de teste combinadas com você.

## O que não fazer
- Não publicar o app nesta etapa (já está publicado; a ativação não exige novo deploy — se o painel não refletir a chave, aí sim publicar a versão atual).
- Não enviar mensagens/workflows reais além do teste combinado.
- Não alterar código, migrações ou permissões.
