export type SupplementItem = {
  name: string;
  dose: string;
  note?: string;
};

export const MANDATORY_SUPPLEMENTS: SupplementItem[] = [
  { name: "Creatina monohidratada", dose: "5 g junto com uma refeição" },
  { name: "Ômega-3 (EPA/DHA)", dose: "2 g na 1ª refeição + 2 g na 3ª refeição" },
  { name: "Whey Protein", dose: "Sempre que indicado no plano alimentar" },
  { name: "Vitamina D3 + K2 MK7", dose: "6.000 UI de D3 + 200 mcg de K2" },
  { name: "Electrolyte Powder", dose: "8 g às 09:00", note: "Optimum Nutrition" },
  { name: "Magnésio bisglicinato", dose: "300 a 400 mg à noite" },
];

export const TRUSTED_SHOPS: { label: string; url: string }[] = [
  { label: "prozis.com/be/fr", url: "https://www.prozis.com/be/fr" },
  { label: "optimumnutrition.com", url: "https://www.optimumnutrition.com" },
];

export const ADVANCED_PROTOCOL_ITEMS: SupplementItem[] = [
  {
    name: "Berberina",
    dose: "500 mg antes das refeições principais",
    note: "Suporte glicêmico — avaliar interação com medicamentos.",
  },
  {
    name: "Inositol (Myo + D-Chiro)",
    dose: "2 g pela manhã",
    note: "Sensibilidade à insulina e equilíbrio hormonal.",
  },
  {
    name: "Coenzima Q10 (ubiquinol)",
    dose: "100 mg/dia com refeição",
    note: "Função mitocondrial e energia.",
  },
  {
    name: "Colágeno hidrolisado + Vitamina C",
    dose: "10 g + 500 mg/dia",
    note: "Pele, articulações e tecido conjuntivo.",
  },
  {
    name: "Probiótico multicepa",
    dose: "10–20 bilhões UFC/dia",
    note: "Eixo intestino-metabolismo.",
  },
];

export const FINAL_GUIDELINES: { title: string; text: string }[] = [
  {
    title: "Água",
    text: "Mínimo 2,5 L/dia (ajustar conforme peso: 35 ml/kg). Distribuir ao longo do dia, evitando grandes volumes nas refeições.",
  },
  {
    title: "Sono",
    text: "7 a 9 horas por noite, em horário regular. Sono é fator crítico para recuperação muscular, controle hormonal e perda de gordura.",
  },
  {
    title: "Treino",
    text: "Treino resistido (musculação) 3 a 5x por semana, com sobrecarga progressiva. Prioridade absoluta para preservação e ganho de massa muscular.",
  },
  {
    title: "Cardio",
    text: "Caminhada diária de 8.000 a 12.000 passos + 2x/semana de cardio moderado ou HIIT de curta duração, conforme tolerância.",
  },
  {
    title: "Constância",
    text: "Resultados clínicos sustentáveis exigem 90 a 180 dias de constância. Pequenas falhas não comprometem o resultado — abandono sim.",
  },
  {
    title: "Reavaliação em 30 dias",
    text: "Nova bioimpedância e revisão clínica em 30 dias para ajustar estratégia, suplementação e progressão de treino.",
  },
];
