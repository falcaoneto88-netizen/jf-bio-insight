## Objetivo

Permitir editar todos os blocos da prescrição (suplementos obrigatórios, protocolo avançado e diretrizes finais) no ecrã de revisão, antes de gerar o PDF. Manter os valores atuais como "defaults" e refletir as edições no PDF.

## Estado atual (confirmação)

- `src/components/PrescriptionCard.tsx` renderiza listas estáticas vindas de `src/lib/prescription-data.ts`.
- `src/lib/pdf/ReportDocument.tsx` importa `MANDATORY_SUPPLEMENTS` e `ADVANCED_PROTOCOL_ITEMS` diretamente — ignora qualquer edição feita na UI.
- `report-store.ts` não tem campo de prescrição.
- Resultado: hoje **não é editável**. A tarefa anterior ficou incompleta.

## Alterações

### 1. Store (`src/store/report-store.ts`)
Adicionar:
```ts
type PrescriptionItem = { id: string; name: string; dose: string; note?: string };
type GuidelineItem = { id: string; title: string; text: string };
type PrescriptionData = {
  mandatory: PrescriptionItem[];
  advanced: PrescriptionItem[];
  guidelines: GuidelineItem[];
  advancedEnabled: boolean;
};
prescription: PrescriptionData | null;
setPrescription / resetPrescription / initPrescriptionFromDefaults
```
Persistido no mesmo `jf-bioreport-draft` (bump version, migrate seguro).

### 2. `src/lib/prescription-data.ts`
Manter constantes atuais como **defaults**. Adicionar helper `buildDefaultPrescription()` que devolve a estrutura com `id`s estáveis (`crypto.randomUUID()` no cliente).

### 3. `PrescriptionCard.tsx` — virar editor
- Cada item vira uma linha com 2 `Input` (nome, dose) + `Textarea` curto (nota opcional) + botão remover.
- Botão "Adicionar suplemento" em cada bloco (Obrigatórios / Avançado).
- Bloco novo "Diretrizes finais" editável (título + texto) usando `FINAL_GUIDELINES` como default.
- Toggle "Protocolo avançado" continua e passa a controlar `advancedEnabled` no store.
- Botão discreto "Repor padrão" por bloco.
- Tudo lê/escreve via `useReportStore`.

### 4. `review.tsx`
- No mount: se `prescription === null`, chamar `setPrescription(buildDefaultPrescription())`.
- Passar `prescription` ao `<PrescriptionCard />` (ou o card consome do store).
- Ao gerar PDF, passar `prescription` para `ReportDocument`.

### 5. `src/lib/pdf/ReportDocument.tsx`
- Aceitar `prescription: PrescriptionData` nas props.
- Substituir os `MANDATORY_SUPPLEMENTS.map` / `ADVANCED_PROTOCOL_ITEMS.map` / `FINAL_GUIDELINES` pelos arrays vindos das props.
- Mostrar bloco avançado só se `advancedEnabled`.
- Fallback para defaults se prop ausente (retrocompat).

## Fora de escopo
- Salvar templates por utilizador (não há auth).
- Reordenar itens por drag-and-drop (pode vir depois; por agora só ↑/↓ se trivial, senão omitir).
- Alterar IA, dieta, histórico, bioimpedância.

## Verificação
1. Abrir `/review`: prescrição aparece pré-preenchida com os valores atuais.
2. Editar nome/dose, adicionar item novo, remover item, editar diretriz.
3. Toggle avançado liga/desliga o bloco.
4. "Repor padrão" volta aos defaults.
5. Gerar PDF: página "Prescrição e Suplementação" reflete exatamente o que está no ecrã.
6. Recarregar a página: edições persistem (mesmo draft localStorage).
