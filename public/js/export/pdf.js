// Gerador de PDF 6x9" com jsPDF: capa, folha de rosto, sumário com nº de página, capítulos com
// títulos/listas/citações/negrito/itálico, rodapé numerado e marcadores (bookmarks).
// `jsPDF` é injetado (navegador: window.jspdf.jsPDF; Node/testes: import 'jspdf').

import { parseBlocks } from '../md.js';
import { labelsFor, pngSize } from './common.js';

const PAGE = { w: 432, h: 648 };
const M = { top: 62, bottom: 66, left: 56, right: 56 };
const BODY = 11, LEAD = 15.5;

// Fontes padrão do PDF só cobrem WinAnsi: normaliza o que não existe nela.
const MAP = { '‘': '‘', '’': '’', '“': '“', '”': '”', '…': '…', '–': '–', '—': '—', '•': '•', '€': '€', '™': '™' };
export function pdfSafe(s) {
  return String(s ?? '')
    .replace(/[   ]/g, ' ')
    .replace(/[→⇒]/g, '->').replace(/[←]/g, '<-')
    .replace(/[✓✔]/g, 'v').replace(/[✗✘]/g, 'x')
    .replace(/[​-‏️]/g, '')
    .replace(/[^ -~¡-ÿ\n]/g, (c) => MAP[c] || '');
}

export function buildPdf(book, { jsPDF }) {
  const lang = book.language || 'pt-BR';
  const L = labelsFor(lang);
  const chapters = (book.chapters || []).filter((c) => c && (c.text || '').trim());
  const doc = new jsPDF({ unit: 'pt', format: [PAGE.w, PAGE.h], compress: true });
  doc.setProperties({ title: pdfSafe(book.title), author: pdfSafe(book.author), subject: pdfSafe(book.subtitle || ''), creator: 'Escriba' });

  const textW = PAGE.w - M.left - M.right;
  const bottom = PAGE.h - M.bottom;
  let y = M.top;
  let firstContentPage = 1;

  const setBody = (style = 'normal', size = BODY) => { doc.setFont('times', style); doc.setFontSize(size); doc.setTextColor(25, 25, 25); };
  const setHead = (size, style = 'bold') => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(15, 15, 15); };
  const fontStyle = (r) => (r.b && r.i ? 'bolditalic' : r.b ? 'bold' : r.i ? 'italic' : 'normal');
  const newPage = () => { doc.addPage([PAGE.w, PAGE.h]); y = M.top; };
  const ensure = (h) => { if (y + h > bottom) newPage(); };

  // ── Capa
  const cs = pngSize(book.coverPng);
  if (book.coverPng?.length && cs) {
    const ratio = cs.w / cs.h;
    const w = Math.min(PAGE.w, PAGE.h * ratio), h = w / ratio;
    doc.addImage(book.coverPng, 'PNG', (PAGE.w - w) / 2, (PAGE.h - h) / 2, w, h);
    doc.addPage([PAGE.w, PAGE.h]);
    firstContentPage = 2;
  }

  // ── Folha de rosto
  setHead(26);
  const tl = doc.splitTextToSize(pdfSafe(book.title || 'Sem título'), textW);
  let ty = 190;
  doc.text(tl, PAGE.w / 2, ty, { align: 'center', lineHeightFactor: 1.2 });
  ty += tl.length * 31 + 6;
  if (book.subtitle) {
    setBody('italic', 14);
    const sl = doc.splitTextToSize(pdfSafe(book.subtitle), textW);
    doc.text(sl, PAGE.w / 2, ty, { align: 'center' });
    ty += sl.length * 18 + 30;
  }
  setBody('normal', 13);
  doc.text(pdfSafe(book.author || ''), PAGE.w / 2, Math.max(ty, 330), { align: 'center' });

  // ── Sumário (páginas reservadas; preenchido depois, quando os números de página forem conhecidos)
  const perTocPage = 24;
  const tocPages = Math.max(1, Math.ceil(chapters.length / perTocPage));
  const tocStart = doc.getNumberOfPages() + 1;
  for (let i = 0; i < tocPages; i++) doc.addPage([PAGE.w, PAGE.h]);

  // ── Capítulos
  const starts = [];
  chapters.forEach((c, idx) => {
    newPage();
    starts.push(doc.getNumberOfPages());
    setHead(9, 'normal');
    doc.setTextColor(110, 110, 110);
    doc.text(`${L.chapter} ${idx + 1}`.toUpperCase(), M.left, y + 40, { charSpace: 1.5 });
    y += 62;
    setHead(21);
    const lines = doc.splitTextToSize(pdfSafe(c.title), textW);
    doc.text(lines, M.left, y, { lineHeightFactor: 1.2 });
    y += lines.length * 25 + 4;
    doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.6);
    doc.line(M.left, y, M.left + 40, y);
    y += 26;

    for (const b of parseBlocks(c.text)) drawBlock(b);
  });

  function layoutRuns(runs, width, size, baseStyle = 'normal') {
    // tokeniza em palavras com estilo e quebra em linhas por largura real medida
    const toks = [];
    for (const r of runs) {
      const st = baseStyle === 'italic' ? (r.b ? 'bolditalic' : 'italic') : fontStyle(r);
      const parts = pdfSafe(r.t).split(/(\s+)/);
      for (const p of parts) if (p) toks.push({ t: p, st, space: /^\s+$/.test(p) });
    }
    const lines = [];
    let cur = [], w = 0;
    for (const tk of toks) {
      doc.setFont('times', tk.st); doc.setFontSize(size);
      const tw = doc.getTextWidth(tk.space ? ' ' : tk.t);
      if (tk.space) { if (cur.length) { cur.push({ ...tk, t: ' ', w: tw }); w += tw; } continue; }
      if (w + tw > width && cur.length) {
        while (cur.length && cur[cur.length - 1].space) cur.pop();
        lines.push(cur); cur = []; w = 0;
      }
      cur.push({ ...tk, w: tw }); w += tw;
    }
    while (cur.length && cur[cur.length - 1].space) cur.pop();
    if (cur.length) lines.push(cur);
    return lines;
  }

  function drawLines(lines, x, size, lead) {
    for (const ln of lines) {
      ensure(lead);
      let cx = x;
      for (const tk of ln) {
        doc.setFont('times', tk.st); doc.setFontSize(size); doc.setTextColor(25, 25, 25);
        if (!tk.space) doc.text(tk.t, cx, y);
        cx += tk.w;
      }
      y += lead;
    }
  }

  function drawBlock(b) {
    if (b.t === 'h2' || b.t === 'h3') {
      const size = b.t === 'h2' ? 15 : 12.5;
      ensure(size * 1.4 + LEAD * 3);
      y += b.t === 'h2' ? 10 : 6;
      setHead(size);
      const txt = pdfSafe(b.runs.map((r) => r.t).join(''));
      const ls = doc.splitTextToSize(txt, textW);
      doc.text(ls, M.left, y, { lineHeightFactor: 1.2 });
      y += ls.length * size * 1.25 + 6;
    } else if (b.t === 'p') {
      setBody();
      drawLines(layoutRuns(b.runs, textW, BODY), M.left, BODY, LEAD);
      y += 6;
    } else if (b.t === 'quote') {
      const lines = layoutRuns(b.runs, textW - 30, BODY, 'italic');
      ensure(LEAD * Math.min(lines.length, 3));
      const y0 = y - 10;
      drawLines(lines, M.left + 22, BODY, LEAD);
      doc.setDrawColor(170, 170, 170); doc.setLineWidth(1.2);
      if (doc.getCurrentPageInfo) doc.line(M.left + 10, y0, M.left + 10, y - LEAD + 4);
      y += 8;
    } else if (b.t === 'ul' || b.t === 'ol') {
      b.items.forEach((it, i) => {
        const lines = layoutRuns(it, textW - 20, BODY);
        ensure(LEAD);
        setBody();
        doc.text(b.t === 'ul' ? '•' : `${i + 1}.`, M.left + 4, y);
        drawLines(lines, M.left + 20, BODY, LEAD);
        y += 2;
      });
      y += 5;
    } else if (b.t === 'hr') {
      ensure(30); setBody(); doc.text('*   *   *', PAGE.w / 2, y + 8, { align: 'center' }); y += 28;
    }
  }

  // ── Preenche sumário
  for (let p = 0; p < tocPages; p++) {
    doc.setPage(tocStart + p);
    let ty2 = M.top + 20;
    if (p === 0) { setHead(20); doc.text(pdfSafe(L.contents), M.left, ty2); ty2 += 38; }
    chapters.slice(p * perTocPage, (p + 1) * perTocPage).forEach((c, k) => {
      const i = p * perTocPage + k;
      setBody('normal', 11.5);
      const label = `${i + 1}.  ${pdfSafe(c.title)}`;
      const fit = doc.splitTextToSize(label, textW - 34)[0];
      doc.text(fit + (fit.length < label.length ? '…' : ''), M.left, ty2);
      doc.text(String(starts[i] - firstContentPage + 1), PAGE.w - M.right, ty2, { align: 'right' });
      ty2 += 19;
    });
  }

  // ── Rodapé (nº de página nas páginas de capítulo) e marcadores
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    if (p < starts[0]) continue;
    doc.setPage(p);
    setBody('normal', 9);
    doc.setTextColor(120, 120, 120);
    doc.text(String(p - firstContentPage + 1), PAGE.w / 2, PAGE.h - 34, { align: 'center' });
  }
  if (doc.outline?.add) chapters.forEach((c, i) => doc.outline.add(null, pdfSafe(c.title), { pageNumber: starts[i] }));

  return new Uint8Array(doc.output('arraybuffer'));
}
