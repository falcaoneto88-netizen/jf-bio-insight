# Prescrição e Suplementação — Seção fixa na revisão

Criar uma nova seção no review.tsx chamada "Prescrição e Suplementação", posicionada logo após o card do plano alimentar.

## 1. Componente `src/components/PrescriptionCard.tsx` (novo)

Card com borda dourada fina, estilo consistente com o `DietPlanCard`.

**Conteúdo fixo — Suplementos Obrigatórios:**
- Título com ícone Pill + "Prescrição e Suplementação"
- Lista com 6 suplementos em linhas claras:
  1. Creatina monohidratada — 5 g junto com uma refeição
  2. Ômega-3 (EPA/DHA) — 2 g na 1ª refeição + 2 g na 3ª refeição
  3. Whey Protein — conforme indicado no plano alimentar
  4. Vitamina D3 + K2 MK7 — 6.000 UI + 200 mcg
  5. Electrolyte Powder — 8 g às 09:00 (Optimum Nutrition)
  6. Magnésio bisglicinato — 300–400 mg à noite
- Cada item com badge "Obrigatório" dourado.

**Atenção de compra:**
- Bloco destacado com ícone Info: "Estes suplementos devem ser adquiridos exclusivamente em lojas especializadas."
- Links clicáveis (abrem em nova aba):
  - https://www.prozis.com/be/fr
  - https://www.optimumnutrition.com

**Prescrição clínica avançada (condicional):**
- Switch/checkbox "Incluir protocolo avançado" no header do card.
- Ao ativar, exibe bloco adicional com sugestões clínicas genéricas (placeholder para futuro: "Protocolo avançado será personalizado conforme exames laboratoriais e acompanhamento.").

## 2. Integração em `src/routes/review.tsx` (editar)

- Importar `PrescriptionCard`.
- Adicionar `<PrescriptionCard />` entre o `<DietPlanCard />` e a seção "Arquivo enviado".
- Estado local `showAdvancedProtocol` com `useState(false)` passado via prop ao card.

## Fora do escopo
- Sem persistência no store (estado local apenas).
- Sem novas dependências (usa ícones e componentes UI existentes).

## Estilo
- Mantém identidade visual médica premium: branco, preto, dourado como acento.
- Tipografia serif nos títulos, sans-serif no corpo.
- Bordas finas, espaçamento generoso.