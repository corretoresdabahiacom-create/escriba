// Exportações simples: Markdown e HTML autocontido (capa embutida como data URI, estilos de impressão).
import { parseBlocks, blocksToHtml, escXml, xmlSafe } from '../md.js';
import { labelsFor } from './common.js';

export function buildMarkdown(book) {
  const L = labelsFor(book.language);
  const parts = [`# ${book.title}`];
  if (book.subtitle) parts.push(`*${book.subtitle}*`);
  if (book.author) parts.push(`${L.by} ${book.author}`);
  parts.push(`## ${L.contents}\n\n` + book.chapters.map((c, i) => `${i + 1}. ${c.title}`).join('\n'));
  book.chapters.forEach((c, i) => {
    // subtítulos internos descem um nível para não competir com o título do capítulo
    const body = String(c.text || '').replace(/^(#{2,5})(\s)/gm, '#$1$2');
    parts.push(`## ${L.chapter} ${i + 1}: ${c.title}\n\n${body}`);
  });
  return parts.join('\n\n') + '\n';
}

export function buildHtml(book, { coverDataUrl = '' } = {}) {
  const L = labelsFor(book.language);
  const lang = book.language || 'pt-BR';
  const chapters = book.chapters.filter((c) => (c.text || '').trim());
  return `<!doctype html>
<html lang="${escXml(lang)}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escXml(xmlSafe(book.title))}</title>
<style>
body{font:18px/1.65 Georgia,serif;max-width:40rem;margin:0 auto;padding:2rem 1.2rem;color:#1b1b1b}
h1{font-size:2.2rem;line-height:1.15}h2.ch{margin-top:4rem;font-size:1.7rem}h2,h3{line-height:1.25}
.cover{display:block;max-width:100%;margin:0 auto 2rem}.meta{color:#555}.n{letter-spacing:.12em;text-transform:uppercase;font-size:.75rem;color:#777;margin:4rem 0 0}
blockquote{border-left:3px solid #aaa;margin:1.2rem 0;padding-left:1rem;font-style:italic}
@media print{.chapter{page-break-before:always}}
</style></head><body>
${coverDataUrl ? `<img class="cover" src="${escXml(coverDataUrl)}" alt="${escXml(L.cover)}"/>` : ''}
<h1>${escXml(xmlSafe(book.title))}</h1>
${book.subtitle ? `<p class="meta"><em>${escXml(xmlSafe(book.subtitle))}</em></p>` : ''}
${book.author ? `<p class="meta">${escXml(L.by)} ${escXml(xmlSafe(book.author))}</p>` : ''}
<nav><h2>${escXml(L.contents)}</h2><ol>${chapters.map((c, i) => `<li><a href="#c${i + 1}">${escXml(xmlSafe(c.title))}</a></li>`).join('')}</ol></nav>
${chapters.map((c, i) => `<section class="chapter" id="c${i + 1}"><p class="n">${escXml(L.chapter)} ${i + 1}</p><h2 class="ch">${escXml(xmlSafe(c.title))}</h2>\n${blocksToHtml(parseBlocks(c.text))}</section>`).join('\n')}
</body></html>`;
}
