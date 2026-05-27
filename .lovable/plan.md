# Geração automática de PDF clínico premium

Gerar PDF A4 vertical premium (branco/preto/dourado) com 5 páginas a partir dos dados já presentes no review, usando `@react-pdf/renderer` no cliente (sem backend, sem custos). Download imediato ao clicar em "Gerar relatório".

## 1. Dependência
- `bun add @react-pdf/renderer` (única dependência nova; suporta fontes Google e gera blob no browser).

## 2. Novo arquivo `src/lib/pdf/ReportDocument.tsx`
Componente `<Document>` do react-pdf com 5 páginas A4:

- **Página 1 — Bioimpedância**: nome, idade, sexo, altura, peso, IMC, massa muscular esquelética, % gordura, gordura visceral, TMB, data/hora do exame. Tabela de 2 colunas com linhas finas douradas.
- **Página 2 — Análise Corporal**: badge do perfil primário + perfis secundários, depois 4 blocos (Diagnóstico, Pontos positivos, Pontos de atenção, Estratégia) extraídos de `classifyBody()`. Bloco final "Meta dos próximos 30 dias" derivada do perfil (texto fixo por perfil).
- **Página 3 — Plano Alimentar**: 3 refeições da `adjustedDiet.meals` (12h/15h/19h) com blocos e opções já ajustadas (`adjustedDisplay`). Bloco "Regras gerais" listando `diet.generalRules` + hidratação alvo.
- **Página 4 — Prescrição e Suplementação**: lista fixa dos 6 suplementos obrigatórios (mesma fonte do `PrescriptionCard`) + bloco condicional "Protocolo avançado" quando o switch estiver ativo. Aviso de lojas especializadas com URLs.
- **Página 5 — Orientações Finais**: Água, Sono, Treino, Cardio, Constância, Reavaliação em 30 dias. Cada item com título dourado em negrito e parágrafo curto.

**Layout compartilhado por página (`pageWrapper`)**:
- Cabeçalho com linha dourada fina, "Dr. João Falcão" em serif negrito + subtítulo "Medicina Estética, Emagrecimento e Alta Performance".
- Número da página no canto + data de emissão (DD/MM/YYYY).
- Rodapé fixo em todas as páginas: "Relatório gerado pelo método Dr. João Falcão — acompanhamento individualizado." centralizado, cinza, linha dourada acima.

**Tipografia**: registrar via `Font.register` as fontes Google **Playfair Display** (títulos) e **Inter** (corpo), espelhando o app. Tamanhos: H1 18pt, H2 13pt, corpo 10.5pt, label 8pt uppercase tracking.

**Paleta**: branco `#FFFFFF`, preto `#0A0A0A`, dourado `#C9A24B`, cinza claro `#E8E5DE`, texto secundário `#6B6B6B`.

## 3. Constantes compartilhadas `src/lib/prescription-data.ts`
Extrair as listas `MANDATORY_SUPPLEMENTS`, `TRUSTED_SHOPS` e `ADVANCED_PROTOCOL_ITEMS` que hoje vivem dentro de `PrescriptionCard.tsx` para um módulo compartilhado, reaproveitado pelo PDF. `PrescriptionCard.tsx` passa a importar deste módulo (refactor sem mudança visual).

## 4. Integração `src/routes/review.tsx`
- Subir o estado `advancedProtocol` do `PrescriptionCard` para o `ReviewPage` (controlled component via prop `advanced` + `onAdvancedChange`) para que o PDF saiba se deve incluir o protocolo avançado.
- Substituir a ação atual de `handleGenerate` (toast placeholder) por:
  - Import dinâmico: `const { pdf } = await import("@react-pdf/renderer")` + `const { ReportDocument } = await import("@/lib/pdf/ReportDocument")` para não inflar o bundle inicial.
  - Renderizar `pdf(<ReportDocument ... />).toBlob()`, criar URL com `URL.createObjectURL`, abrir/baixar como `relatorio-{nome-paciente|sem-nome}-{DDMMYYYY}.pdf`.
  - Toast de sucesso e fallback de erro.
- Botão "Gerar relatório" ganha estado `isGenerating` (desabilita + spinner curto).

## 5. Fora do escopo
- Sem envio por email.
- Sem armazenamento no Supabase / histórico.
- Sem assinatura digital, watermark, QR ou senha.
- Sem geração server-side.

## Detalhes técnicos
- `@react-pdf/renderer` roda 100% no browser; nada vai para o servidor.
- Import dinâmico mantém a página leve.
- Página 5 com orientações é conteúdo estático curado por perfil clínico, não input do usuário.
- Se algum dado estiver ausente, a célula exibe "—" (mesma convenção da tela).