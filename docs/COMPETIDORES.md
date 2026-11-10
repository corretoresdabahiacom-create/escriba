# Análise de concorrentes

Pesquisa feita em **10/11/2026**. Preços e recursos mudam: confira nos sites oficiais. Fontes de fornecedores têm viés (a principal tabela comparativa consultada é publicada por um dos concorrentes, a Inkrify).

## Mapa

| Categoria | Exemplos | O que fazem | Lacuna que o Escriba ocupa |
|---|---|---|---|
| **Produto digital + funil** | Geniuz | Declara criar "produtos digitais, funis de venda, copys, criativos e vídeos" com IA e páginas de venda. A página não informa preços, planos, idiomas nem formatos de exportação | Foco em **arquivo publicável** (EPUB/PDF/DOCX) e em publicar de graça, sem conta |
| **Livro completo + listing** | Bookwiz, Inkrify | Bookwiz (segundo a tabela da Inkrify, jul/2026): plano grátis com limites, pago a partir de US$ 14/mês, exporta EPUB, PDF e DOCX, capa de brochura e "Amazon listing pack". Inkrify: a partir de US$ 5/mês, EPUB/PDF, metadados KDP | São os mais próximos; exigem conta/plano. Escriba: sem conta, código aberto, auto-hospedável, dados locais |
| **Escrita assistida** | Squibler, Sudowrite, Novelcrafter | Squibler: grátis p/ testar, exporta PDF/DOCX. Sudowrite: sem plano gratuito (trial). Novelcrafter: trial de 21 dias, exporta Word | Voltados a ficção/roteiro; sem kit de publicação nem exportação EPUB |
| **Diagramadores** | Atticus, Vellum, Reedsy Studio, Kindle Create | Formatam e exportam EPUB/PDF com acabamento editorial; não escrevem o livro | Escriba entrega o conteúdo e o DOCX para levar a eles |

"Não declarado" nas fontes não significa que o recurso não exista.

## O que o mercado já considera padrão (e o Escriba agora tem)
1. Estrutura/outline antes do texto. 2. Geração e edição por capítulo. 3. Exportação **EPUB + PDF + DOCX**. 4. Capa. 5. Metadados/listing para KDP.

## Diferenciais do Escriba
- **Grátis sem cartão e sem conta**; dados no navegador (privacidade) + backup.
- **Código aberto e auto-hospedável** (Cloudflare gratuito), com **fallback automático** entre provedores de IA gratuitos e chave própria.
- **Honestidade de copy**: kit KDP/venda sem inventar dados de vendas, depoimentos ou garantias; prompts proíbem estatísticas/citações inventadas; checklist lembra de revisar e declarar IA na KDP.
- **Idiomas do livro**: pt-BR, en, es.

## Onde os concorrentes ainda ganham (backlog)
- Acabamento tipográfico profissional e capa de brochura (lombada/contracapa) — Vellum/Atticus/Bookwiz.
- Pesquisa de palavras-chave com dados reais de vendas (exige fontes pagas/APIs).
- Funil/página de vendas hospedada e pagamento (Geniuz). Possível próximo passo: gerar uma página de vendas HTML a partir do kit de venda.
- Colaboração multiusuário e sincronização entre dispositivos (exige backend com banco, ex.: Cloudflare D1, também gratuito).
- Imagens ilustrativas por IA nos capítulos.

## Fontes
- Geniuz — <https://www.geniuz.ai/> (acesso em 10/11/2026)
- Inkrify, "AI book generators compared" (verificada em 10/07/2026) — <https://inkrify.com/compare/ai-book-generators/>
- Cloudflare Workers AI, preços — <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- OpenRouter, "Free LLM APIs compared" — <https://openrouter.ai/blog/tutorials/free-llm-apis-compared/>
