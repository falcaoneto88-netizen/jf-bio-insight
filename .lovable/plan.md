## Problema
A rota `/success.tsx` apresenta erro de hidratação (hydration mismatch) porque `new Date().toISOString()` é executado durante o SSR, produzindo um valor no servidor (UTC) que difere do valor gerado no cliente (fuso local do navegador). O React descarta o HTML do servidor e re-renderiza no cliente.

## Correção mínima
Em `src/routes/success.tsx`:
- Remover `const [generatedAt] = useState(() => new Date().toISOString())`.
- Substituir por `const [generatedAt, setGeneratedAt] = useState<string | null>(null)`.
- Adicionar `useEffect(() => { setGeneratedAt(new Date().toISOString()); }, [])` para gerar a data apenas no cliente.
- Na renderização do `Row` de "Data de geração", usar `formatDateTime(generatedAt) ?? "—"` para evitar renderizar data inválida durante o SSR/hidratação.

## Escopo
- Apenas `src/routes/success.tsx` será modificado.
- Nenhuma outra rota, lógica clínica, geração de PDF, store, ou estilo será alterada.
