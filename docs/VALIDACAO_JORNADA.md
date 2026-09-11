# Validação da Jornada Clínica

Estado: **implementação completa em revisão**. Nada foi publicado.

## Automático (neste repositório)

| Verificação | Comando | Resultado |
| --- | --- | --- |
| Tipos | `bunx tsgo --noEmit` | passa |
| Testes da jornada | `bunx vitest run` | 13 testes, todos a passar |
| HTML do fixture | `bun run scripts/export-jornada-html.ts /tmp/jornada-sintetica.html` | 12.469 bytes gerados |

### Achados da revisão anterior, agora cobertos por teste

1. `decimalComma("1.365")` → `1.365` (milhar preservado). TMB usa `integerValue`:
   `1365` → `1.365`, nunca `1,365`. `70,0` e `34,0` mantêm as casas originais.
2. `dateSortKey` rejeita `31/02/2026`, `31/04/2026` e `29/02/2025`, e aceita `29/02/2024`.
3. A tabela de evolução imprime a transcrição literal (`literal.peso`, etc.); os números
   convertidos servem apenas para calcular variações.
4. Duas linhas da mesma data são fundidas célula a célula; nada é perdido e valores
   divergentes aparecem em `conflicts`.

Testes adicionais garantem que o HTML começa em `<!doctype html>`, declara UTF-8, não contém
`<script>` nem `@import`, e não expõe notas internas nem pendências.

## Conversão para PDF

O sandbox de desenvolvimento não tem WeasyPrint instalado, por isso a paginação A4 não foi
reconfirmada aqui. Para validar localmente:

```
bun run scripts/export-jornada-html.ts /tmp/jornada-sintetica.html
weasyprint /tmp/jornada-sintetica.html /tmp/jornada-sintetica.pdf
```

Verificar: cabeçalho e rodapé em todas as páginas, sem texto cortado e sem forçar um número
fixo de páginas.

## Por validar manualmente na aplicação (dados sintéticos)

- [ ] Criar atendimento, sair e voltar: a lista reabre o atendimento certo depois de recarregar.
- [ ] Colar anamnese, organizar com o agente, editar o resultado e confirmar.
- [ ] Substituir o ficheiro do exame: a extração anterior é limpa e a confirmação invalidada.
- [ ] Identidade divergente entre jornada e exame: a revisão bloqueia o avanço.
- [ ] Editar o protocolo depois de aprovar: a aprovação é invalidada e o HTML volta a RASCUNHO.
- [ ] Descarregar o HTML final duas vezes: conteúdo e data idênticos (snapshot aprovado).
- [ ] Tentar aprovar por um assistente ligado ao `/mcp`: deve ser recusado.
- [ ] Fluxo antigo `/upload` → `/review` → PDF continua a funcionar.

## Notas de segurança

- Escritas exclusivamente pelo backend com service role, após sessão + administrador + dono.
- `expectedVersion` em todas as atualizações; hash de conteúdo verificado na aprovação.
- Limite de 40 pedidos de IA por utilizador e por hora.
- O aviso do linter sobre funções `SECURITY DEFINER` executáveis refere-se a `has_role`, que
  precisa de continuar acessível às políticas de acesso; é intencional e já registado.
