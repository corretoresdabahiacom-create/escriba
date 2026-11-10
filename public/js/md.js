// Mini-parser de Markdown para capítulos. Suporta o subconjunto que o Escriba usa:
// parágrafos, ## / ### (e # tratado como ##), listas (- * 1.), citações (>), ---, **negrito**, *itálico*.
// Todos os exportadores (HTML, EPUB, DOCX, PDF, preview) consomem a mesma AST.

export const escXml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// remove caracteres proibidos em XML 1.0
export const xmlSafe = (s) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

/** @returns {{t:string,b?:boolean,i?:boolean}[]} runs de texto */
export function parseInline(src) {
  const runs = [];
  let s = String(src ?? '');
  // normaliza ***x*** e __x__
  s = s.replace(/__(.+?)__/g, '**$1**');
  const re = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(?!\s)(.+?)(?<!\s)\*|(?<![A-Za-z0-9])_(?!\s)(.+?)(?<!\s)_(?![A-Za-z0-9]))/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ t: s.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ t: m[2], b: true, i: true });
    else if (m[3] !== undefined) runs.push({ t: m[3], b: true });
    else if (m[4] !== undefined) runs.push({ t: m[4], i: true });
    else if (m[5] !== undefined) runs.push({ t: m[5], i: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ t: s.slice(last) });
  return runs.filter((r) => r.t !== '');
}

export const runsToPlain = (runs) => runs.map((r) => r.t).join('');

/**
 * @typedef {{t:'h2'|'h3'|'p'|'quote', runs:object[]} | {t:'ul'|'ol', items:object[][]} | {t:'hr'}} Block
 * @returns {Block[]}
 */
export function parseBlocks(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  let list = null;
  let quote = [];

  const flushPara = () => {
    if (para.length) blocks.push({ t: 'p', runs: parseInline(para.join(' ').trim()) });
    para = [];
  };
  const flushList = () => { if (list) blocks.push(list); list = null; };
  const flushQuote = () => {
    if (quote.length) blocks.push({ t: 'quote', runs: parseInline(quote.join(' ').trim()) });
    quote = [];
  };
  const flushAll = () => { flushPara(); flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) continue; // ignora cercas de código
    if (!line.trim()) { flushAll(); continue; }

    let m;
    if ((m = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/.exec(line))) {
      flushAll();
      const level = m[1].length;
      blocks.push({ t: level >= 3 ? 'h3' : 'h2', runs: parseInline(m[2]) });
    } else if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      blocks.push({ t: 'hr' });
    } else if ((m = /^\s*[-*•]\s+(.+)$/.exec(line))) {
      flushPara(); flushQuote();
      if (!list || list.t !== 'ul') { flushList(); list = { t: 'ul', items: [] }; }
      list.items.push(parseInline(m[1]));
    } else if ((m = /^\s*\d{1,3}[.)]\s+(.+)$/.exec(line))) {
      flushPara(); flushQuote();
      if (!list || list.t !== 'ol') { flushList(); list = { t: 'ol', items: [] }; }
      list.items.push(parseInline(m[1]));
    } else if ((m = /^\s*>\s?(.*)$/.exec(line))) {
      flushPara(); flushList();
      quote.push(m[1]);
    } else {
      flushList(); flushQuote();
      para.push(line.trim());
    }
  }
  flushAll();
  return blocks;
}

export function runsToHtml(runs) {
  return runs
    .map((r) => {
      let h = escXml(xmlSafe(r.t));
      if (r.b) h = `<strong>${h}</strong>`;
      if (r.i) h = `<em>${h}</em>`;
      return h;
    })
    .join('');
}

export function blocksToHtml(blocks) {
  return blocks
    .map((b) => {
      switch (b.t) {
        case 'h2': return `<h2>${runsToHtml(b.runs)}</h2>`;
        case 'h3': return `<h3>${runsToHtml(b.runs)}</h3>`;
        case 'p': return `<p>${runsToHtml(b.runs)}</p>`;
        case 'quote': return `<blockquote><p>${runsToHtml(b.runs)}</p></blockquote>`;
        case 'ul': return `<ul>${b.items.map((i) => `<li>${runsToHtml(i)}</li>`).join('')}</ul>`;
        case 'ol': return `<ol>${b.items.map((i) => `<li>${runsToHtml(i)}</li>`).join('')}</ol>`;
        case 'hr': return '<hr/>';
        default: return '';
      }
    })
    .join('\n');
}

export const countWords = (text) => (String(text ?? '').match(/\S+/g) || []).length;
