# Regras automáticas avançadas do plano alimentar

Estender o motor `adjustDiet` para aplicar 7 grupos de regras clínicas (perfil corporal + condições de saúde), produzindo: quantidades ajustadas, lista de suplementação, alertas clínicos e observações. Render no `DietPlanCard`. Sem novas dependências.

## Arquivos

### 1. `src/lib/diet-adjuster.ts` (editar)

**Novos tipos:**

```ts
export type Supplement = {
  name: string;       // "Whey isolado"
  dose: string;       // "30 g/dia"
  reason: string;     // "Reforço proteico"
  mandatory: boolean; // true p/ creatina em recomposição
};

export type DietAlert = {
  severity: "info" | "warning" | "risk";
  message: string;
};

export type AdjustedDiet = {
  base: DietBase;
  targets: DietTargets;
  meals: AdjustedMeal[];
  generalRules: string[];      // base + regras adicionadas pelo motor
  supplementation: Supplement[];
  alerts: DietAlert[];
  digestiveNotes: string[];    // observações para o relatório (ex.: vesícula)
};
```

**Mudança de assinatura:**

```ts
adjustDiet(base, {
  weightKg,
  profile: ProfileTag | null,
  mainGoal: MainGoal,
  clinical: { gallbladderRemoved: YesNo; menopause: YesNoNA;
              currentlyTraining: YesNo; trainingTime: string;
              diabetes: YesNo; hypertension: YesNo } | null,
})
```

**Matriz de perfis — ajustes (aplicados sobre a base atual):**

| Perfil | Δ proteína | Δ carbo | Δ gordura | Observação |
|---|---|---|---|---|
| emagrecimento | +0 (mantém alta 2,0 g/kg) | **−20%** | −10% | mantém vegetais livres + 2,5 L água |
| recomposicao | 2,0 g/kg | **moderado** ×1,0 | ×1,0 | carbo concentrado próximo ao treino + **creatina obrigatória** |
| baixa_massa_muscular | **+15%** sobre baseline | manter (não reduzir agressivo) | ×1,0 | reforço whey + creatina, sem déficit extremo |
| gordura_visceral_elevada | 2,0 g/kg | sem carbo extra fora das principais | ×0,9 | **alerta de risco metabólico** + reforço vegetais |
| metabolismo_reduzido | 2,0 g/kg | ×0,9 (não restritivo) | ×0,95 | sugere reavaliação em 30 dias |
| ganho_massa / atlético / manutenção / risco / emag_metabólico | mantém matriz atual | — | — | — |

A matriz existente vira o ponto de partida; os ajustes acima refinam.

**Regras de carboidrato por refeição (novo — `mealCarbWeights`):**

- Padrão: M1 1.0, M3 1.0.
- Se `currentlyTraining === "sim"` e `trainingTime` existe, comparar `trainingTime` com horários das refeições (12:00 / 19:00) e reforçar +20% na refeição mais próxima do treino (perfil recomposição/ganho/atlético). Reduzir 10% na mais distante para manter calorias.
- Se perfil = `gordura_visceral_elevada`: nas opções de líquida M2 zera carbo escalável (`aveia → 0g`, banana opcional), forçando carbo só nas principais.

**Regras de gordura por refeição:**

- Se `gallbladderRemoved === "sim"`: na M3, dividir o `fatMultiplier` final por 2 e adicionar bloco repetido "Gordura boa adicional (½ porção)" — implementado mais simples: aplicar `fatMultiplier *= 0.6` somente em M3, marcar `digestiveNotes` com "Vesícula retirada: distribuir gorduras em pequenas quantidades ao longo do dia; evitar refeições muito gordurosas.".

**Suplementação derivada:**

| Condição | Suplemento adicionado |
|---|---|
| sempre (base) | Whey isolado 30 g/dia |
| profile = recomposicao ou baixa_massa | **Creatina 3–5 g/dia (obrigatória)** |
| profile = baixa_massa | Whey reforçado 2× (manhã e pós-treino) |
| menopause = sim | Magnésio 300 mg, Ômega-3 2 g, Vit. D3 4000 UI + K2 100 mcg |
| gallbladderRemoved = sim | Enzimas digestivas / lipase (observação) |
| profile = gordura_visceral_elevada | Ômega-3 2 g, fibras 5–10 g |

**Alertas:**

- `gordura_visceral_elevada` ou `emagrecimento_metabolico_prioritario` → alerta `risk`: "Risco metabólico aumentado — gordura visceral elevada."
- `metabolismo_reduzido` → alerta `info`: "Reavaliar composição corporal em 30 dias."
- `gallbladderRemoved === "sim"` → alerta `info`: "Vesícula retirada — atenção à distribuição de gorduras."
- `menopause === "sim"` → alerta `info`: "Período de menopausa — foco em massa muscular e controle de gordura visceral."

**Regras gerais adicionais (concatenadas a `generalRules`):**

- `emagrecimento`: "Reduzir carboidratos em 20% — manter proteína alta e vegetais livres."
- `recomposicao`: "Concentrar carboidratos próximos ao horário do treino."
- `gordura_visceral_elevada`: "Evitar carboidratos refinados; consumir carboidratos apenas nas refeições principais."
- `menopause === "sim"`: "Reduzir álcool e açúcar; priorizar proteína e treino de força."
- `metabolismo_reduzido`: "Evitar restrição calórica agressiva; priorizar treino de força e constância."

### 2. `src/components/DietPlanCard.tsx` (editar)

Acrescentar 3 seções abaixo de "Regras gerais":

- **Suplementação** — lista `supplementation` com nome em destaque, dose ao lado, motivo em cinza, badge "obrigatório" dourado quando `mandatory: true`.
- **Alertas clínicos** — só renderiza se houver. Cada alerta com ícone por severidade (`info` = `Info` cinza, `warning` = `AlertTriangle` âmbar, `risk` = `AlertOctagon` dourado/vermelho-claro). Bordas/cores via tokens existentes (gold/border/muted).
- **Observações digestivas** — só renderiza se houver. Lista simples.

### 3. `src/routes/review.tsx` (editar)

Atualizar chamada `adjustDiet` para incluir `clinical`:

```ts
clinical: cd
  ? {
      gallbladderRemoved: cd.gallbladderRemoved,
      menopause: cd.menopause,
      currentlyTraining: cd.currentlyTraining,
      trainingTime: cd.trainingTime,
      diabetes: cd.diabetes,
      hypertension: cd.hypertension,
    }
  : null,
```

Dependências de `useMemo`: incluir os campos clínicos relevantes.

## Fora do escopo

- Substituição de alimentos por alergias/intolerâncias (próxima fase).
- Edição manual do plano gerado.
- Render em PDF.
- Reorganizar ordem das refeições conforme `trainingTime` (apenas peso de carbo é ajustado).

## Detalhes

- 100% determinístico, sem IA.
- Estilo visual mantém branco/preto/dourado, cards com borda fina e tipografia atual.
- Tudo derivado em tempo real; nada persiste no store.
