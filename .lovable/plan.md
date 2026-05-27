# Extração automática da bioimpedância

Conectar o upload à IA da Lovable (Gemini multimodal) para ler PDF/PNG/JPG, extrair os campos da bioimpedância e enviá-los pré-preenchidos para a tela de revisão, onde tudo continua editável.

## Fluxo

```
/upload  →  [extração com IA, loading]  →  /body-composition (pré-preenchido + editável)
            ↓ erro
            permanece em /upload com mensagem amigável
```

## Mudanças

### 1. `src/store/report-store.ts`
Adicionar histórico opcional em `BodyCompositionData`:

```ts
type HistoryPoint = { date: string; value: string };
// novos campos:
weightHistory: HistoryPoint[];
skeletalMuscleHistory: HistoryPoint[];
bodyFatHistory: HistoryPoint[];
```

`emptyBodyComposition` inicializa os três como `[]`.

### 2. Server function — `src/lib/bioimpedance.functions.ts` (novo)
- `createServerFn({ method: "POST" })` com `inputValidator` Zod: `{ fileBase64: string, mimeType: "application/pdf" | "image/png" | "image/jpeg", fileName: string }`. Valida tamanho (≤ 10 MB após decodificar).
- Chama Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) com `google/gemini-2.5-flash`, header `Authorization: Bearer ${process.env.LOVABLE_API_KEY}`.
- Mensagem `user` com duas partes: `{ type: "text", text: <prompt-pt-BR> }` e `{ type: "image_url", image_url: { url: "data:<mime>;base64,..." } }` (Gemini aceita PDF via mesmo formato data-URL no gateway).
- Usa **tool calling** com schema estrito (`tool_choice: required`) para garantir JSON estruturado: campos string/null para cada métrica + arrays de histórico. Todos os campos opcionais (modelo retorna `null` quando ausente).
- Tratamento de erro: 429 → "Limite de uso atingido, tente novamente em instantes"; 402 → "Créditos da IA esgotados, adicione mais em Settings → Workspace → Usage"; outros → mensagem genérica. Retorna `{ data: BodyCompositionData | null, error: string | null }` (DTO seguro).
- Mapeia o JSON da IA para o shape de `BodyCompositionData` (strings vazias para nulos, normaliza datetime ISO local quando possível, normaliza sexo para `"feminino"|"masculino"`).

Registrar `attachSupabaseAuth` **não é necessário** (função pública, sem auth). Mas precisa registrar nada novo em `src/start.ts`.

### 3. `src/routes/upload.tsx`
- Ao selecionar/arrastar arquivo: armazena `file` no store (como hoje) e dispara `extract` automaticamente.
- Estado local: `status: "idle" | "extracting" | "done" | "error"`, `errorMessage`.
- Durante `extracting`: substitui o card de arquivo por um card com spinner dourado + texto "Analisando o exame com IA…" e desabilita o botão Continuar.
- `done`: badge verde "Dados extraídos" + botão "Continuar" habilitado (navega para `/body-composition`).
- `error`: mostra alerta com mensagem da IA + botão "Tentar novamente"; usuário ainda pode clicar "Continuar mesmo assim" para preencher manualmente.
- Conversão para base64: `FileReader.readAsDataURL` no client, envia só o payload base64 (remove o prefixo `data:...;base64,`).
- Salva resultado via `setBodyComposition(extracted)` antes de navegar.

### 4. `src/routes/body-composition.tsx`
- Renomear CTA principal para **"Confirmar dados"** (mantém ícone de seta).
- Banner superior: se `bodyComposition` veio da IA, mostrar caixa verde-clara "Dados extraídos automaticamente. Revise e ajuste se necessário."; caso contrário, manter aviso dourado atual.
- Adicionar nova seção **"Histórico da composição corporal"** (renderiza apenas se houver pelo menos 1 ponto em qualquer das 3 listas):
  - Tabela responsiva com colunas: Data · Peso (kg) · Massa muscular (kg) · % gordura
  - Linhas editáveis (inputs inline) + botão "Adicionar linha" + ícone remover por linha
  - Estado gerenciado pelo mesmo `data` do form
- Mantém validação atual; ao submeter, salva o histórico junto.

### 5. `src/routes/review.tsx`
- Acrescentar bloco de histórico no card "Dados da bioimpedância" (lista compacta data → valores) quando houver.

## Detalhes técnicos

- **Modelo:** `google/gemini-2.5-flash` (multimodal, suporta PDF/imagem, rápido e gratuito durante a janela promocional do Lovable AI).
- **Prompt (resumo):** "Você é um extrator de exames de bioimpedância em português. Retorne APENAS via tool call. Para cada campo, devolva o valor numérico em string ou null. Inclua arrays de histórico se o exame contiver tabela/gráfico de evolução."
- **Tool schema** (parâmetros do tool `extract_bioimpedance`): todos os 15 campos do `BodyCompositionData` + `history: { weight: HistoryPoint[], skeletalMuscle: HistoryPoint[], bodyFat: HistoryPoint[] }`.
- **Segurança:** `LOVABLE_API_KEY` lida via `process.env` dentro do `.handler()`. Arquivo nunca persiste — fica em memória do request.
- **Sem novas dependências.** Já temos `zod`, `zustand`, fetch nativo.

## Fora do escopo

- Persistir arquivo/relatório no banco
- OCR fallback (Gemini já cobre PDFs escaneados)
- Geração de PDF final
