## Problema

Hoje o upload de PDF não preenche os campos da bioimpedância. A IA recebe o ficheiro como `image_url`, formato que o gateway Gemini só aceita para imagens — para PDF a resposta vem vazia e os campos ficam em branco.

## Solução

Ajuste cirúrgico apenas no servidor (`src/lib/bioimpedance.functions.ts`). Nenhuma alteração de UI, store, PDF, histórico ou base de dados.

### Mudanças

1. **`src/lib/bioimpedance.functions.ts`**
   - Detetar `mimeType` antes de montar o payload para o gateway.
   - Se for `image/png` ou `image/jpeg` → manter exatamente o payload atual (`type: "image_url"`).
   - Se for `application/pdf` → enviar como:
     ```
     { type: "file", file: { filename, file_data: "data:application/pdf;base64,..." } }
     ```
     (formato suportado pelo Lovable AI Gateway / Gemini para PDFs.)
   - Acrescentar mensagem de erro clara quando a IA devolver `tool_calls` vazio ou todos os campos nulos ("Não foi possível ler este exame. Tente uma imagem (PNG/JPG) ou reenvie o PDF.") em vez de gravar dados vazios.
   - Log de diagnóstico em caso de resposta inesperada (sem expor o ficheiro).

### O que NÃO muda

- UI de upload (`src/routes/upload.tsx`).
- Store, histórico, PDF, prescrição, dieta.
- Limites de tamanho, tipos aceites, fluxo de retry/continuar.
- Comportamento para PNG/JPG continua idêntico.

### Verificação

- Testar com um PDF real de bioimpedância → campos devem aparecer em `/body-composition`.
- Testar com PNG/JPG → comportamento idêntico ao atual (não regredir).
- Testar PDF ilegível → mensagem de erro clara, sem dados em branco.

### Risco

Baixo. Se o gateway recusar o novo formato, cai no mesmo estado de erro já tratado hoje ("Tentar novamente" / "Continuar mesmo assim") — nunca pior que o estado atual.
