## Ajuste: Copy do botão no /clinical-form

### Contexto
O briefing solicitou que o botão do formulário clínico dissesse "Continuar para revisão" em vez de "Continuar para análise". O formulário clínico e o fluxo já estão implementados; apenas a copy do botão precisa ser atualizada.

### Alteração
No arquivo `src/routes/clinical-form.tsx`:
- Localizar o texto "Continuar para análise"
- Substituir por "Continuar para revisão"

Nenhuma outra alteração será feita.