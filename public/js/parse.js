// Parsers tolerantes para saídas de LLM (JSON em cercas de código, vírgulas sobrando,
// texto antes/depois do JSON, marcador de resumo de capítulo, cores inseguras).

/** Extrai o primeiro objeto/array JSON de um texto de modelo. Lança Error se impossível. */
export function extractJson(raw) {
  let s = String(raw ?? '').trim();
  if (!s) throw new Error('Resposta vazia do modelo.');
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();

  const tryParse = (t) => {
    try { return JSON.parse(t); } catch { /* segue */ }
    // remove vírgulas finais e comentários simples
    const fixed = t.replace(/\/\/[^\n]*$/gm, '').replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(fixed);
  };

  try { return tryParse(s); } catch { /* tenta recortar */ }

  const start = s.search(/[{[]/);
  if (start === -1) throw new Error('O modelo não devolveu JSON.');
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  // varre respeitando strings para achar o fechamento balanceado
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) {
      return tryParse(s.slice(start, i + 1));
    }
  }
  throw new Error('JSON do modelo está incompleto (resposta cortada). Tente novamente.');
}

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Aceita apenas #rgb/#rrggbb; devolve fallback caso contrário (evita injeção via cor). */
export function safeHex(v, fallback) {
  const s = String(v ?? '').trim();
  if (!HEX.test(s)) return fallback;
  if (s.length === 4) return '#' + [...s.slice(1)].map((c) => c + c).join('').toLowerCase();
  return s.toLowerCase();
}

export const clampStr = (v, max, fallback = '') => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return (s || fallback).slice(0, max);
};

const SUMMARY_RE = /\n?\s*-{2,}\s*RESUMO\s*-{2,}\s*\n?/i;

/** Separa o texto do capítulo do resumo que o modelo anexa após `---RESUMO---`. */
export function splitChapterAndSummary(raw) {
  const s = String(raw ?? '').trim();
  const m = SUMMARY_RE.exec(s);
  if (!m) return { text: s, summary: '' };
  return {
    text: s.slice(0, m.index).trim(),
    summary: s.slice(m.index + m[0].length).trim().replace(/\s+/g, ' ').slice(0, 600),
  };
}

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Remove o título repetido no começo do texto ("# Capítulo 2: X", "Capítulo 2 — X") e comentários do modelo. */
export function cleanChapterText(text, title = '') {
  let lines = String(text ?? '').replace(/\r\n?/g, '\n').trim().split('\n');
  // preâmbulos do tipo "Claro! Aqui está o capítulo:"
  while (lines.length && /^(claro|certo|ok|aqui est[aá]|segue|sure|here is|here's|por supuesto|aqu[ií] tienes)/i.test(lines[0].trim()) && lines[0].trim().length < 120) {
    lines.shift();
    while (lines.length && !lines[0].trim()) lines.shift();
  }
  const nt = norm(title);
  for (let guard = 0; guard < 2 && lines.length; guard++) {
    const first = lines[0].replace(/^#{1,6}\s*/, '').replace(/\*+/g, '').trim();
    const nf = norm(first);
    const looksHeading = /^#{1,6}\s/.test(lines[0]) || /^(cap[ií]tulo|chapter)\s+\d+/i.test(first);
    if (looksHeading || (nt && nf === nt)) {
      lines.shift();
      while (lines.length && !lines[0].trim()) lines.shift();
    } else break;
  }
  return lines.join('\n').trim();
}

/** Valida e normaliza o outline devolvido pelo modelo. */
export function normalizeOutline(obj, { maxChapters = 20 } = {}) {
  if (!obj || typeof obj !== 'object') throw new Error('Estrutura inválida.');
  const chaptersRaw = Array.isArray(obj.chapters) ? obj.chapters : Array.isArray(obj.capitulos) ? obj.capitulos : null;
  if (!chaptersRaw || !chaptersRaw.length) throw new Error('O modelo não devolveu a lista de capítulos.');
  const chapters = chaptersRaw.slice(0, maxChapters).map((c, i) => {
    const title = typeof c === 'string' ? c : c.title ?? c.titulo;
    const summary = typeof c === 'string' ? '' : c.summary ?? c.resumo ?? c.plan ?? '';
    return { title: clampStr(title, 140, `Capítulo ${i + 1}`), summary: clampStr(summary, 500) };
  });
  return {
    title: clampStr(obj.title ?? obj.titulo, 140, 'Meu ebook'),
    subtitle: clampStr(obj.subtitle ?? obj.subtitulo, 200),
    chapters,
  };
}
