# JF BioReport — v1 (revisada)

Ajuste do fluxo para preparar o app à futura leitura automática da bioimpedância e geração do relatório. Sem IA e sem PDF real ainda — apenas estrutura, formulários e estado.

## Fluxo atualizado

```
/                    Tela inicial premium
/upload              Upload do exame (PDF/PNG/JPG)
/body-composition    Dados da Bioimpedância (novo)
/clinical-form       Dados clínicos
/review              Revisão + botão "Gerar relatório"
```

Stepper presente nas etapas 2–5:
`1 Upload · 2 Bioimpedância · 3 Dados clínicos · 4 Revisão`

## Identidade visual (mantida)

- Paleta branco / preto / dourado (#C9A24B), via tokens oklch em `src/styles.css`.
- Tipografia: Playfair Display (títulos) + Inter (corpo).
- Cards com borda fina, sombras discretas, detalhes dourados sutis.
- Responsivo mobile-first.

## Nova tela: `/body-composition` — Dados da Bioimpedância

Card único, formulário em grid 1 col (mobile) / 2 cols (desktop), todos os campos **editáveis**:

- Nome do paciente (text)
- Data e hora do exame (datetime-local)
- Sexo (select: feminino / masculino)
- Idade (number, anos)
- Altura (number, cm)
- Peso (number, kg)
- IMC (number, kg/m²) — campo editável, com botão "Calcular" a partir de altura/peso
- Massa muscular esquelética (number, kg)
- Percentual de gordura corporal (number, %)
- Massa de gordura corporal (number, kg)
- Gordura visceral (number, nível)
- Taxa metabólica basal (number, kcal)
- Relação cintura-quadril (number)
- Água corporal total (number, L)
- Massa livre de gordura (number, kg)

Campos numéricos com `step` apropriado. Validação leve (apenas tipos e ranges plausíveis) — todos opcionais nesta v1 para não travar testes; obrigatórios apenas: nome, sexo, idade, altura, peso.

Botões: "Voltar" (→ /upload) · "Continuar" (→ /clinical-form).

Observação no topo do card: "Em breve estes campos serão preenchidos automaticamente a partir do exame enviado." — sinaliza ao usuário e ancora a próxima fase.

## Formulário clínico atualizado (`/clinical-form`)

Card com seções:

**Objetivo**
- Objetivo principal (select): Emagrecimento · Recomposição corporal · Ganho de massa · Manutenção · Alta performance

**Rotina**
- Horário que acorda (time)
- Horário que dorme (time)
- Horário do treino (time)
- Frequência de treino semanal (number, 0–7)
- Tipo de treino (text)

**Histórico de saúde** (toggles sim/não com RadioGroup)
- Menopausa
- Vesícula retirada
- Diabetes
- Hipertensão
- Intestino preso
- Compulsão alimentar
- Fome noturna

**Alimentação**
- Quantas refeições deseja fazer por dia (number, 1–8)
- Alimentos que não consome (textarea)

Validação com react-hook-form + zod. Obrigatórios: objetivo principal, frequência de treino, refeições por dia. Restante opcional.

Botões: "Voltar" (→ /body-composition) · "Continuar" (→ /review).

## Tela de revisão (`/review`) reagrupada

Seções (cards), cada uma com link "Editar" para a etapa correspondente:

1. **Arquivo enviado** — nome, tamanho, tipo do arquivo do upload.
2. **Dados da bioimpedância** — todos os 15 campos da etapa 2.
3. **Dados clínicos** — histórico de saúde (lista de sim/não) e alimentação (refeições/dia, alimentos evitados).
4. **Rotina e treino** — horários (acordar, dormir, treino), frequência semanal, tipo de treino.
5. **Objetivo** — objetivo principal.

Botão final dourado **"Gerar relatório"** → toast "Relatório em preparação" (placeholder; sem PDF nesta versão).

## Estado e persistência

Store Zustand (`src/store/report-store.ts`) ampliada:

```ts
type ReportState = {
  file: { name: string; size: number; type: string } | null;
  bodyComposition: BodyCompositionData | null;   // novo
  clinicalData: ClinicalData | null;             // schema atualizado
  setFile / setBodyComposition / setClinicalData / reset
}
```

Persistência em `sessionStorage`. O store de bioimpedância já fica desenhado para receber, no futuro, dados extraídos automaticamente pela IA — basta um `setBodyComposition(parsed)` antes de navegar.

## Arquivos a criar / alterar

Criar:
- `src/routes/body-composition.tsx`
- `src/components/forms/BodyCompositionForm.tsx`
- (atualizar) `src/components/Stepper.tsx` para 4 passos
- (atualizar) `src/components/forms/ClinicalForm.tsx` com os novos campos
- (atualizar) `src/routes/review.tsx` com os 5 grupos
- (atualizar) `src/store/report-store.ts` com `bodyComposition`
- (atualizar) `src/routes/upload.tsx` para navegar a `/body-composition`

Sem novas dependências além das já planejadas (`zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`).

## Fora de escopo (continua)

- Extração automática de dados do exame por IA.
- Geração e download do PDF.
- Autenticação, banco de dados, histórico.
