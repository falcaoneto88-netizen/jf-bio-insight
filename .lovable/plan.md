# Motor de classificação corporal

Adicionar uma camada de análise pura (sem IA, determinística) que recebe `BodyCompositionData` + `ClinicalData` e devolve um perfil clínico + narrativa curta. Exibir na tela de revisão antes da geração do relatório.

## Fluxo

```
/review  →  bloco "Análise preliminar" (gerado em tempo real a partir do store)
            ↓
            usado depois na geração do PDF final
```

## Arquivos

### 1. `src/lib/body-classifier.ts` (novo, puro TS, sem deps)

Tipos:

```ts
export type ProfileTag =
  | "emagrecimento"
  | "emagrecimento_metabolico_prioritario"
  | "recomposicao"
  | "ganho_massa"
  | "baixa_massa_muscular"
  | "gordura_visceral_elevada"
  | "metabolismo_reduzido"
  | "perfil_atletico"
  | "risco_metabolico_aumentado";

export type ClassificationResult = {
  primaryProfile: ProfileTag;
  secondaryProfiles: ProfileTag[];
  flags: {
    highBodyFat: boolean;
    lowMuscle: boolean;
    highVisceralFat: boolean;
    lowBMR: boolean;
    adequateFat: boolean;
    metabolicRisk: boolean;
  };
  narrative: {
    diagnosis: string;     // diagnóstico corporal (1–2 frases)
    strength: string;      // ponto forte
    attention: string;     // ponto de atenção
    strategy: string;      // estratégia principal
  };
};

export function classifyBody(
  body: BodyCompositionData,
  clinical: ClinicalData | null,
): ClassificationResult | null; // null se dados insuficientes (sem sexo/idade/peso/%gordura)
```

Tabelas de referência embutidas (faixas clássicas usadas em bioimpedância — ACE/InBody, simplificadas):

- **% gordura corporal por sexo/idade**: faixas (atlético / saudável / aceitável / elevado).
  - Feminino 20–39: atl <21, saud 21–32, elev >33; 40–59: atl <23, saud 23–33, elev >34; 60+: atl <24, saud 24–35, elev >36.
  - Masculino 20–39: atl <8, saud 8–19, elev >20; 40–59: atl <11, saud 11–21, elev >22; 60+: atl <13, saud 13–24, elev >25.
- **Massa muscular esquelética (SMM) baixa**: SMM/peso × 100 < 33% (feminino) ou < 37% (masculino). Aproxima o índice usado pelo InBody.
- **Gordura visceral**: >9 = elevada (regra do enunciado), >14 = muito elevada.
- **TMB baixa**: TMB observada < 0,92 × TMB estimada por Mifflin-St Jeor (sexo/idade/peso/altura). Margem de 8% considera variação aceitável.
- **Risco metabólico aumentado**: ≥2 entre {%gordura elevado, visceral >9, RCQ acima do limite (F>0,85 / M>0,90)}.

Lógica de priorização (uma classificação primária + tags secundárias):

```text
if highBodyFat && highVisceralFat && weight excedente (IMC ≥ 27 OU bodyFatPercentage muito alto):
  primary = emagrecimento_metabolico_prioritario
else if highVisceralFat:
  primary = gordura_visceral_elevada
else if highBodyFat:
  primary = emagrecimento
else if adequateFat && lowMuscle:
  primary = recomposicao
else if lowMuscle:
  primary = baixa_massa_muscular
else if bodyFatPercentage baixo && SMM adequada:
  primary = perfil_atletico
else if mainGoal == "ganho_massa":
  primary = ganho_massa
else:
  primary = recomposicao (default seguro)

if lowBMR -> add metabolismo_reduzido
if metabolicRisk -> add risco_metabolico_aumentado
```

Narrativa: templates determinísticos por `primaryProfile`, interpolando `patientName`, valores arredondados e `mainGoal`. Sem IA, sem alucinação. Curto (2 a 3 linhas por campo).

Helpers internos:
- `parseNumber(str)` tolerante a vírgula/ponto.
- `estimateBMR_MifflinStJeor(sex, age, weightKg, heightCm)`.
- `getFatRange(sex, ageYears)` retorna `{ athletic, healthyMax, elevatedMin }`.

### 2. `src/store/report-store.ts`
Sem mudanças de estrutura. A classificação é derivada (cálculo puro), não persiste no store — recomputada quando preciso.

### 3. `src/routes/review.tsx`
- Importar `classifyBody`.
- Calcular `const analysis = useMemo(() => classifyBody(body, clinical), [body, clinical])`.
- Acrescentar **novo card no topo** (acima do card "Arquivo"): **"Análise preliminar"** com:
  - Linha 1: badge dourado com o rótulo do `primaryProfile` (label PT-BR amigável) + badges discretos das `secondaryProfiles`.
  - Bloco 2×2: **Diagnóstico corporal**, **Ponto forte**, **Ponto de atenção**, **Estratégia principal** — cada um em mini-card com título sublinhado em dourado.
  - Se `analysis === null`, mostrar aviso discreto: "Preencha sexo, idade, peso, altura e % de gordura para gerar a análise.".
- Manter estética (branco, preto, dourado, bordas finas, tipografia atual).

### 4. (Opcional, sem custo) `src/lib/body-classifier.labels.ts`
Mapa `ProfileTag → { label, color }` para reutilizar no review e, depois, no relatório.

## Detalhes

- **Sem IA**: regras puras → reproduzível, auditável, sem custo de API.
- **Sem nova dependência.**
- **Internacionalização**: textos em pt-BR fixos nos templates.
- **Testabilidade**: `classifyBody` é função pura — fácil de cobrir com testes manuais futuros.

## Fora do escopo

- Renderizar a análise no PDF final (será reaproveitada quando o gerador for criado).
- Calibrar faixas por etnia / atletas profissionais.
- Considerar histórico longitudinal (`weightHistory` etc.) — fica para próxima etapa.
