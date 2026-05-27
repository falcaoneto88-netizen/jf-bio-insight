# Dados Clínicos Complementares

Expandir a etapa 3 do fluxo (`/clinical-form`) para se tornar **"Dados Clínicos Complementares"**, com mais campos organizados em 6 cards. A etapa 2 (`/body-composition`) permanece intacta — os campos de paciente (nome, sexo, idade, altura, peso) aparecem aqui também como editáveis manualmente, preparados para preenchimento automático futuro a partir da bioimpedância.

## Fluxo final

```
/  →  /upload  →  /body-composition  →  /clinical-form  →  /review
                  (Bioimpedância)      (Dados Clínicos
                                        Complementares)
```

## Mudanças

### 1. `src/store/report-store.ts`
Expandir `ClinicalData` com novos campos (mantendo os existentes):

- **Paciente:** `patientName`, `sex` ("feminino"|"masculino"|""), `age`, `height`, `weight`
- **Treino:** `currentlyTraining: YesNo` (novo); manter `weeklyTrainingFrequency`, `trainingTime`
- **Tipo de treino** → mudar `trainingType` para union `"musculacao"|"cardio"|"funcional"|"personal"|"outro"|""` + novo campo `trainingTypeOther: string`
- **Saúde:** novos campos texto `previousDiseases`, `medications`, `previousSurgeries`, `allergiesIntolerances`; alterar `menopause` para `"sim"|"nao"|"na"|""` (novo tipo `YesNoNA`)
- **Alimentação:** novo `additionalNotes: string`
- **Rotina:** novo `workSchedule: string` (horário de trabalho)

Atualizar `emptyClinicalData` correspondentemente. Sem campos removidos — apenas adições e o ajuste do `menopause`.

### 2. `src/routes/clinical-form.tsx`
Reorganizar em **6 cards**:

1. **Dados do paciente** — nome (text), sexo (select), idade (number), altura (cm), peso (kg). Nota discreta: "Em breve estes campos serão preenchidos automaticamente pela leitura da bioimpedância."
2. **Objetivo** — select com 5 opções (já existe).
3. **Rotina** — acorda, dorme, horário de trabalho (text livre, ex.: "9h às 18h").
4. **Treino** — "Treina atualmente?" (Sim/Não); se Sim, mostrar frequência semanal, horário, tipo (radio: Musculação/Cardio/Funcional/Personal/Outro); se "Outro", input para descrever.
5. **Saúde** — textareas: doenças prévias, medicamentos, cirurgias, alergias/intolerâncias. Toggles: Vesícula (Sim/Não), Menopausa (Sim/Não/NA), Diabetes, Hipertensão, Intestino preso, Compulsão alimentar, Fome noturna.
6. **Preferência alimentar** — refeições/dia (number), alimentos que não consome (textarea), observações adicionais (textarea).

**Validação obrigatória:** nome, sexo, idade, altura, peso, objetivo principal. Erros inline; submit bloqueado se faltar algum.

**Botões:** "Voltar" → `/body-composition` · "Continuar para análise" → `/review`.

Atualizar título do card principal e meta tags para "Dados Clínicos Complementares".

### 3. `src/components/Stepper.tsx`
Renomear etapa 3 de `"Dados clínicos"` → `"Dados complementares"` (mais curto para caber).

### 4. `src/routes/review.tsx`
Adicionar novo card **"Dados do paciente"** no topo (antes de Bioimpedância) usando os novos campos do `clinicalData`. Expandir o card "Dados clínicos" com os novos campos de saúde (doenças, medicamentos, cirurgias, alergias) e atualizar `menopause` para suportar "Não se aplica". Expandir "Rotina e treino" com `currentlyTraining`, `workSchedule`, e a label correta do `trainingType`. Adicionar "Observações" no resumo alimentar.

## Design

Mantém o sistema atual: cards com `border-border/80`, headers serif, dourado nos CTAs principais, layout responsivo `sm:grid-cols-2` dentro de cada section. Sem novas dependências.

## Fora do escopo

IA, extração automática real, persistência no banco, geração de PDF.
