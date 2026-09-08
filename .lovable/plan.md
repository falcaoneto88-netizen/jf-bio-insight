# Publicar a app e ligar o assistente ao /mcp

## Objetivo
Colocar a aplicação online e deixar o ChatGPT/Claude ligado ao endereço `/mcp`, com acesso protegido por login, para consultar os relatórios clínicos.

## Passos

1. **Verificação de segurança antes de publicar**
   Correr a análise de segurança e mostrar-lhe qualquer alerta crítico antes de avançar. Se houver algo crítico, pergunto se quer resolver primeiro.

2. **Publicar**
   Publicar a aplicação no endereço Lovable. Fica online cerca de um minuto depois.

3. **Confirmar que o endereço do assistente responde**
   Verificar que `/mcp` e a página de consentimento (`/.lovable/oauth/consent`) respondem no site publicado.

4. **Guia de ligação (entrego no fim, em texto simples)**
   - Endereço a colar no assistente: `https://<o-seu-site>/mcp`
   - ChatGPT: Definições → Conectores → Adicionar → colar o endereço
   - Claude: Definições → Conectores → Adicionar servidor personalizado → colar o endereço
   - Ao ligar, abre a página de autorização: entrar com Google e carregar em "Autorizar"
   - Depois disso pode pedir, por exemplo: "lista os últimos relatórios" ou "mostra o relatório do paciente X"

## Notas
- Não há alterações de código previstas neste passo; as ferramentas do assistente (`list_reports` e `get_report`) já estão implementadas e protegidas por login.
- Sempre que fizer novas alterações à app, é preciso publicar de novo para ficarem visíveis online.
