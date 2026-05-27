## Objetivo
Criar a tela final exibida após a geração do PDF e salvar um histórico simples dos relatórios.

## 1. Nova rota `/success` (`src/routes/success.tsx`)
Layout premium (branco/preto/dourado, mobile-first), centralizado:
- Ícone de check dourado + título **"Relatório gerado com sucesso"**
- Card com:
  - **Nome do paciente**
  - **Data de geração** (DD/MM/AAAA HH:mm)
  - **Objetivo** e **classificação corporal** (chip dourado)
- 3 botões:
  - **Baixar PDF** (primário, dourado) — re-gera o PDF a partir dos dados do store e dispara download
  - **Gerar novo relatório** — `useReportStore.reset()` → navega para `/`
  - **Editar dados** — navega para `/review`
- Rodapé discreto: "Relatório gerado pelo método Dr. João Falcão"

Se o store estiver vazio (acesso direto), redireciona para `/`.

## 2. Fluxo de redirecionamento (`src/routes/review.tsx`)
Após `handleGenerate` concluir com sucesso, além do toast, salvar no histórico e navegar para `/success`. O botão "Começar novo relatório" no rodapé do review é removido (já existe em /success).

## 3. Histórico local (`src/lib/report-history.ts`)
Persistência simples via `localStorage` (chave `jf-bioreport-history`), sem backend — mantém o MVP enxuto.

Tipo:
```ts
type ReportHistoryEntry = {
  id: string;            // uuid
  patientName: string;
  examDate: string;      // do bioComposition.examDateTime
  generatedAt: string;   // ISO
  mainGoal: string;      // label
  bodyClassification: string; // PROFILE_LABELS[primaryProfile]
  pdfFileName: string;   // ex.: relatorio-maria-silva-27052026.pdf
};
```

API: `addReportToHistory(entry)`, `getReportHistory()`, `clearReportHistory()`.

Observação: o PDF é gerado localmente (blob) e baixado direto no dispositivo; não há URL persistente para armazenar. O campo "Link do PDF" é representado pelo nome do arquivo baixado — adequado ao escopo MVP sem storage/backend.

## 4. Tela de histórico (`src/routes/history.tsx`)
Rota simples acessível via link discreto no rodapé da home e da `/success`:
- Tabela responsiva (shadcn `Table`) com colunas: Paciente, Data do exame, Geração, Objetivo, Classificação, Arquivo.
- Estado vazio elegante.
- Botão "Limpar histórico" (com confirmação).

## 5. Atualizações menores
- `src/routes/index.tsx`: link discreto "Ver histórico de relatórios" no rodapé/secundário.
- Atualizar `Stepper` se necessário (manter atual; success é pós-fluxo).

## Fora de escopo
- Backend/Supabase, autenticação, armazenamento do PDF na nuvem, envio por e-mail.
