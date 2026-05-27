# Base do plano alimentar — "Dieta Base Dr. João"

Criar a estrutura de dados + motor de ajuste do plano alimentar padrão, e mostrar uma prévia na tela de revisão. Sem IA: regras determinísticas, auditáveis.

## Arquivos

### 1. `src/lib/diet-base.ts` (novo)

Define a dieta-base como dado estruturado (não texto solto) para que o motor consiga reescalonar quantidades.

```ts
export type FoodOption = {
  label: string;          // "Frango grelhado"
  baseGrams: number;      // 160
  unit: "g" | "ml" | "scoop" | "un";
  display: (g: number) => string; // formata "160 g de frango grelhado"
  scalable: boolean;      // false p/ folhas verdes, azeite, oleaginosas (qtd. fixa/livre)
  category: "protein" | "carb" | "veg" | "liquid" | "fat" | "free";
};

export type MealBlock = {
  title: string;          // "Proteína", "Carboidrato"...
  required: boolean;
  pick: "one" | "all" | "free"; // "escolher 1" / livre
  options: FoodOption[];
};

export type Meal = {
  id: "m1" | "m2" | "m3";
  name: string;           // "1ª Refeição"
  time: string;           // "12:00"
  required: true;
  blocks: MealBlock[];
};

export type DietBase = {
  name: "Dieta Base Dr. João";
  meals: Meal[];
  generalRules: string[]; // salada livre, suco de limão, água ≥ 2,5L, etc.
};

export const DIETA_BASE_DR_JOAO: DietBase = { ...definição completa... };
```

Conteúdo das refeições idêntico ao enunciado:
- M1 12:00 → Proteína (4 opções), Carboidrato (3 opções), Vegetais (brócolis + folhas livres), Líquida (whey/aveia/banana/morango).
- M2 15:00 → apenas Líquida (mesmas 4 opções).
- M3 19:00 → Proteína, Carboidrato, Vegetais + Gorduras boas (castanha-do-pará, abacate, azeite, nozes, avelãs, amêndoas).
- generalRules: salada verde livre, suco só de limão, zero com moderação, 2,5L água/dia.

### 2. `src/lib/diet-adjuster.ts` (novo)

Motor puro que ajusta as quantidades da dieta-base com base em peso, perfil clínico (`ProfileTag` do classifier) e objetivo (`MainGoal`).

```ts
export type DietTargets = {
  proteinGPerKg: number;    // 1.6 – 2.4
  carbMultiplier: number;   // 0.6 – 1.4 sobre a base
  fatMultiplier: number;    // 0.7 – 1.3
  waterLitersPerDay: number;
  rationale: string[];      // ex.: "Emagrecimento: -20% carbo na M3"
};

export type AdjustedFoodOption = FoodOption & {
  adjustedGrams: number;
  adjustedDisplay: string;
};

export type AdjustedMeal = { ...Meal, blocks: AdjustedBlock[] };
export type AdjustedDiet = {
  base: DietBase;
  targets: DietTargets;
  meals: AdjustedMeal[];
  generalRules: string[];
};

export function adjustDiet(
  base: DietBase,
  ctx: {
    weightKg: number | null;
    profile: ProfileTag | null;
    mainGoal: MainGoal;
  },
): AdjustedDiet;
```

Lógica de targets por perfil (resumo):

| Perfil primário | proteinG/kg | carbMult | fatMult | rationale |
|---|---|---|---|---|
| emagrecimento_metabolico_prioritario | 2.2 | 0.7 | 0.8 | déficit + proteção muscular |
| emagrecimento | 2.0 | 0.8 | 0.9 | déficit moderado |
| gordura_visceral_elevada | 2.0 | 0.8 | 0.9 | reduz carbo refinado/fat saturada |
| recomposicao | 2.0 | 1.0 | 1.0 | manutenção |
| baixa_massa_muscular | 2.2 | 1.1 | 1.0 | leve superávit |
| ganho_massa | 1.9 | 1.3 | 1.1 | superávit |
| perfil_atletico | 1.8 | 1.2 | 1.0 | performance |
| (sem perfil) | 1.8 | 1.0 | 1.0 | padrão |

Override por `mainGoal` quando perfil não estiver disponível (mesma matriz, key alternativa).

Cálculo por refeição:
- **Proteína**: alvo diário = `weightKg × proteinGPerKg`. Distribui entre M1 e M3 (60/40 se objetivo = emagrecimento; 50/50 demais). M2 contribui via whey (~24 g proteína por scoop). Para cada opção de proteína da refeição, calcula gramas necessárias para entregar a cota da refeição usando densidade proteica típica:
  - ovos: 13 g prot / 100 g; frango: 31; tilápia: 22; carne magra: 26.
  - Arredonda para múltiplo de 10 g e respeita pisos/tetos (mín 100 g, máx 250 g).
- **Carboidrato**: gramas base × `carbMultiplier`, arredonda múltiplo de 10 g, piso 60 g / teto 180 g.
- **Gorduras boas (M3)**: 1 porção fixa indicada (ex.: "1 castanha-do-pará OU 30 g de abacate OU 1 colher de azeite"), apenas `fatMultiplier` ajusta porção do abacate/azeite (10–20 g azeite, 20–40 g abacate).
- **Vegetais / folhas / salada / limão**: não escalam.
- **Líquida M2**: whey fixo 1 scoop; aveia 20–40 g conforme `carbMultiplier`; banana/morango idem.
- **Água**: `max(2.5, weightKg × 0.035)` L/dia.

Se `weightKg` for `null`, devolve a base sem reescalonar e marca `targets.rationale = ["Peso não informado — exibindo quantidades-base."]`.

### 3. `src/components/DietPlanCard.tsx` (novo)

Card visual exibindo a dieta ajustada, mantendo estética branco/preto/dourado:
- Título "Dieta Base Dr. João" + chips com `proteinGPerKg`, `kcalAprox` (opcional, não pedido — pular), `águaL`.
- Cada refeição: cabeçalho "1ª Refeição – 12:00", blocos com label dourado e lista de opções. Cada opção com `adjustedDisplay`. Marcador "(escolher 1)" / "(livre)".
- Bloco final "Regras gerais" listando `generalRules` + linha de rationale do ajuste (pequena, cinza).

### 4. `src/routes/review.tsx`

- Importar `DIETA_BASE_DR_JOAO`, `adjustDiet`, `DietPlanCard`.
- Calcular `const diet = useMemo(() => adjustDiet(DIETA_BASE_DR_JOAO, { weightKg: parseNumber(bc?.weight ?? cd?.weight), profile: analysis?.primaryProfile ?? null, mainGoal: cd?.mainGoal ?? "" }), [bc, cd, analysis])`.
- Inserir `<DietPlanCard diet={diet} />` logo abaixo do card "Análise preliminar".

Helper `parseNumber` é privado em `body-classifier.ts` — exportar de lá ou duplicar simples (`Number(v.replace(",", "."))`). Duplicar inline é mais simples; ok.

## Fora do escopo

- Cálculo de kcal totais por refeição (não foi pedido).
- Substituição automática de itens por alergias/intolerâncias (vem em fase futura, embora `cd.allergiesIntolerances` já exista).
- Render no PDF final (fase futura).
- Edição manual do plano pelo usuário (fase futura).

## Detalhes

- **100% determinístico**, sem IA, sem nova dependência.
- Estrutura `DietBase` é reutilizável: futuro suporte a múltiplas dietas-base (low carb, vegetariana etc.) só adiciona objetos novos.
- Ajuste sempre derivado em tempo real — não persiste no store.
