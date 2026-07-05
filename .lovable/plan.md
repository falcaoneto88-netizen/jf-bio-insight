# Melhorar o Relatório PDF do Paciente

Foco: elevar a qualidade percebida do PDF entregue ao paciente — capa, tipografia, hierarquia visual, gráficos de evolução e resumo executivo. Sem novas features de fluxo, sem mudar lógica de dieta/classificação.

## Melhorias propostas (todas no PDF)

### 1. Capa premium (nova Página 1)
Página de abertura editorial antes da Bioimpedância:
- Nome do paciente em serifa grande (Times-Roman/bold)
- Objetivo + classificação corporal como badges dourados
- Data do relatório, idade, sexo em linha discreta
- Assinatura "Dr. João Falcão · Medicina Estética" no rodapé da capa
- Linha dourada dupla (marca editorial)

### 2. Sumário executivo (nova página após a capa)
Uma página com o "resumo do relatório" — o paciente entende tudo em 30 segundos:
- 3-4 métricas-chave em cards (Peso, % Gordura, Massa Muscular, TMB)
- Se houver exame anterior: mini-comparativo com setas ↑↓ coloridas
- Frase-diagnóstico em 1 linha (extraída da análise)
- Meta de 30 dias em destaque

### 3. Gráfico de evolução (quando houver histórico)
Renderizar mini-gráficos SVG dentro do PDF (`@react-pdf/renderer` suporta `<Svg>` nativo):
- Linha de peso ao longo do tempo (histórico do exame + medição atual)
- Linha de % gordura
- Linha de massa muscular
- Sem dependências novas — SVG puro com paths calculados

### 4. Composição corporal visual
Substituir a lista de "Data Rows" por uma seção mais visual:
- Barra de progresso horizontal para % gordura (com faixa saudável marcada)
- Barra para massa muscular relativa
- Indicador visual de gordura visceral (escala 1-30 com marcador)
- Mantém os valores numéricos, mas com contexto visual

### 5. Plano alimentar mais legível
- Cabeçalho de cada refeição com "chip" de horário destacado
- Blocos de proteína/carbo/vegetais/gordura com ícones-glifo (círculo dourado + letra)
- Espaçamento vertical mais generoso entre refeições
- Regras gerais em card com fundo `bgSoft`

### 6. Tipografia refinada
- Trocar Helvetica por par serif+sans do @react-pdf: **Times-Roman** para títulos de seção (mais editorial), **Helvetica** para corpo (mantém legibilidade)
- Aumentar `letterSpacing` nos eyebrows para 3.0
- Hierarquia: eyebrow 8pt → subtítulo 11pt → título 24pt

### 7. Rodapé com "Continua na próxima página"
Quando uma seção quebra página, mostrar indicador sutil de continuação (já com `wrap`).

## Arquivos afetados

Apenas `src/lib/pdf/ReportDocument.tsx` — todas as mudanças são no template do PDF. Nada de lógica de negócio, store, ou telas da app muda.

## Fora de escopo (não vou fazer nesta rodada)
- Fontes externas (Playfair no PDF) — evita risco do bug de fontes já resolvido
- Imagens/fotos do paciente
- QR code de contato
- Mudanças no fluxo do profissional (review, editor, upload)
- Mudanças na análise, dieta, ajuste ou prescrição

## Ordem de implementação
1. Capa + sumário executivo (maior impacto visual)
2. Gráficos SVG de evolução
3. Barras de composição corporal
4. Refinamento tipográfico + plano alimentar
5. Verificação: gerar PDF de teste e conferir cada página

Confirma que quer que eu implemente **tudo isso de uma vez**, ou prefere que eu comece só por **1 (capa) + 2 (sumário executivo)** e você avalia antes de eu seguir?
