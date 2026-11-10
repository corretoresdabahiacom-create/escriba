# Escriba — estúdio de ebooks com IA

Do tema ao arquivo publicável: **briefing → estrutura editável → capítulos → capa → kit KDP/venda → exportação real (EPUB, PDF, DOCX, HTML, Markdown)**.
Grátis, **sem cadastro e sem cartão**. Os livros ficam no navegador do autor (com backup em JSON).

> Evolução do protótipo original (`docs/original/escriba.html`): a landing foi preservada visualmente, as promessas falsas foram corrigidas e tudo o que ela anunciava agora existe de verdade. Veja [`docs/CODIGO-ORIGINAL.md`](docs/CODIGO-ORIGINAL.md).

## O que funciona

| Etapa | Recursos |
|---|---|
| Briefing | tema, público, tom, idioma (pt-BR/en/es), nº e tamanho dos capítulos, observações, autor |
| Estrutura | IA propõe título + capítulos; você edita, reordena, adiciona, remove e aprova |
| Capítulos | gerar um a um ou todos os pendentes (com "parar"); editor Markdown + pré-visualização; reescrever com instrução; desfazer; resumo automático p/ coerência |
| Capa | 4 modelos, 6 motivos, cores editáveis, sugestão por IA; PNG 1600×2560 (proporção KDP) |
| Publicação | 5 títulos, 7 palavras-chave, categorias e descrição (limites da KDP com contadores), kit de venda (headline, benefícios, FAQ, posts) |
| Exportar | **EPUB 3** (formato aceito pela KDP), **PDF** 6×9" com sumário paginado, **DOCX**, HTML, Markdown, backup JSON, checklist de prontidão |
| Segurança | saída da IA sempre escapada (sem `innerHTML` com conteúdo da IA), CSP, validação/limites no servidor, chaves só em secrets ou na sessão |

## Arquitetura

```
public/                 front-end estático (sem build)
  index.html            landing
  estudio.html          app
  js/app.js             interface
  js/api.js             cliente: modo servidor ou modo direto (chave do usuário)
  js/providers.js       Groq · Gemini · OpenRouter · Anthropic · Workers AI (compartilhado c/ o Worker)
  js/prompts.js         prompts (contexto compacto: briefing + estrutura + resumos)
  js/export/*.js        EPUB, DOCX, PDF, HTML/MD (zip.js escreve o ZIP sem dependências)
  js/cover.js           capas em <canvas>
  js/md.js, parse.js    Markdown → AST; parsers tolerantes a saídas de LLM
src/worker.js           API (Cloudflare Worker): /api/health, /api/generate
tests/                  unitários (node:test) + E2E (Playwright + wrangler dev)
```

**Backend gratuito e sem cartão:** Cloudflare Workers (100 mil req/dia) serve o site e a API no mesmo domínio. A IA vem de provedores com plano gratuito sem cartão (**Groq**, **Gemini**, **OpenRouter**) ou do **Workers AI** (sem chave; 10 mil neurons/dia). O Worker tenta os provedores em ordem e troca automaticamente quando a cota de um acaba. O usuário também pode colar a própria chave.

> Os modelos padrão são sugestões e **mudam com frequência** nos planos gratuitos. Todos podem ser trocados por variável de ambiente (`GROQ_MODEL`, …) ou no campo "modelo" das configurações.

## Rodando localmente

```bash
npm install
cp .dev.vars.example .dev.vars   # coloque ao menos uma chave (ex.: GROQ_API_KEY)
npm run dev                      # http://localhost:8787
```

Sem chaves, abra o estúdio e use **Configurações de IA** para colar a sua (modo direto).

## Testes

```bash
npm test                 # unitários: parsers, ZIP, EPUB, DOCX, PDF, Worker (validação, CORS, rate limit, fallback)
npx playwright install chromium
npm run test:e2e         # sobe o Worker com provedor mock e conduz o estúdio num navegador real
```

O E2E cobre o fluxo completo, valida os arquivos baixados (`unzip -t`, `pdfinfo`, `pdftotext`), persistência, backup/importação, XSS, layout mobile e o modo direto sem servidor.
(Localmente sem acesso ao download do Playwright, use `PW_CHROMIUM=/caminho/do/chrome npm run test:e2e`.)

## Deploy

Veja [`docs/DEPLOY.md`](docs/DEPLOY.md). Resumo: a cada push na `main`, o workflow roda os testes e publica no **Cloudflare Workers** (com os 2 secrets) e no **GitHub Pages** (sem secrets).

## Limitações conhecidas

- As cotas gratuitas de IA são pequenas e variam por provedor; um livro de 8 capítulos usa ~10 requisições.
- O limitador de taxa do Worker é por instância (best-effort). Para uso público intenso, defina `ACCESS_CODE` ou use um rate limit da Cloudflare.
- O PDF/EPUB têm diagramação funcional, não editorial; para acabamento refinado leve o DOCX a um diagramador (Atticus, Vellum, Reedsy Studio…).
- Kit KDP/venda: sugestões a partir do tema, **sem dados reais de vendas**. Valide no painel da Amazon. Revise o texto gerado e declare o uso de IA ao publicar na KDP.
- Pagamentos/planos pagos não foram implementados (o protótipo anunciava preços fictícios).
- Conteúdo salvo apenas no navegador: limpar os dados do site apaga os livros. Faça backup.
