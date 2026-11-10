# Análise do código original e o que foi feito

Arquivo analisado: `escriba.html` (≈ 26 KB, landing + demo em um único arquivo; cópia em `docs/original/`).

## Funcionava (preservado)
- Identidade visual (tokens, Fraunces/IBM Plex, textura, "página virando"), estrutura da landing e responsividade.
- Fluxo de demo: gerar capítulo → próximo capítulo → capa; erros reais da API expostos ao usuário.

## Problemas encontrados → correção

| # | Problema | Gravidade | Correção |
|---|---|---|---|
| 1 | A API da Anthropic era chamada **direto do navegador, sem chave** → só funcionava dentro do preview do Claude; fora dele sempre falhava (e adicionar a chave no HTML a exporia) | Crítica | Backend próprio (Cloudflare Worker) com secrets, fallback entre provedores gratuitos e modo "chave do usuário" |
| 2 | A capa usava `innerHTML` com saída do modelo (título, subtítulo, símbolo, cores) → **XSS** | Alta | Nenhum conteúdo de IA entra como HTML: capa em `<canvas>`, cores validadas por regex, textos via `textContent`/escape; teste E2E de XSS |
| 3 | A landing prometia **EPUB, PDF e Kindle (MOBI)** — nada disso existia; e o KDP **não aceita mais MOBI** | Alta | EPUB 3, PDF e DOCX reais; texto corrigido (KDP → EPUB) |
| 4 | Prometia KDP "com base no que já vende no seu nicho" — não há dados de vendas | Alta | Kit KDP real, rotulado como sugestão por tema, sem dados de vendas |
| 5 | Prometia aprovar estrutura e revisar capítulo a capítulo; havia só capítulos sequenciais sem plano | Média | Estrutura editável (reordenar/editar/aprovar), edição manual, reescrever com instrução, desfazer |
| 6 | Histórico inteiro reenviado a cada capítulo (contexto/custo crescentes) e `max_tokens` fixo em 1200 | Média | Contexto compacto (briefing + estrutura + resumos curtos) e `max_tokens` por tamanho de capítulo |
| 7 | Sem persistência: recarregar apagava tudo; sem exportar nada | Alta | Projetos no navegador + backup/importação JSON (sanitizado) |
| 8 | Planos pagos (R$ 47/197) e "assinar" sem qualquer cobrança implementada | Média | Seção de custos honesta (cota compartilhada / chave própria / instância própria) |
| 9 | Capa com emoji (dependente de fonte, não exportável) e só gradiente | Média | Capa tipográfica PNG 1600×2560 incorporada aos arquivos |
| 10 | JSON do modelo tratado com `replace` + `JSON.parse` frágil; modelo hard-coded | Média | Parser tolerante (cercas, vírgulas, texto extra) + 1 retry; provedor/modelo configuráveis |
| 11 | Sem acessibilidade básica (rótulos, foco, skip-link), `onclick` inline | Baixa | Rótulos, `aria-*`, foco visível, sem handlers inline (permite CSP estrita) |
