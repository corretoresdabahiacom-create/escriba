// Capas tipográficas desenhadas em <canvas> (1600x2560, proporção 1,6:1 recomendada pela Amazon KDP).
// O PNG gerado é o mesmo exibido na prévia, baixado e embutido em EPUB/PDF/DOCX.
import { safeHex, clampStr } from './parse.js';

export const COVER_W = 1600, COVER_H = 2560;
export const TEMPLATES = { classico: 'Clássico', moderno: 'Moderno', minimal: 'Minimalista', bold: 'Impacto' };
export const MOTIF_LABELS = { linhas: 'Linhas', circulos: 'Círculos', faixas: 'Faixas', grade: 'Grade', arcos: 'Arcos', pontos: 'Pontos' };

export const DEFAULT_COVER = { template: 'classico', title: '', subtitle: '', tagline: '', author: '', palette: ['#14171F', '#9A3B32', '#C9A227'], motif: 'arcos' };

const clampWords = (v, max) => {
  const t = clampStr(v, 10000);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return cut.replace(/\s+\S*$/, '') + '…';
};

export function normalizeCover(c = {}) {
  const pal = Array.isArray(c.palette) ? c.palette : [];
  return {
    template: TEMPLATES[c.template] ? c.template : 'classico',
    title: clampWords(c.title, 120),
    subtitle: clampWords(c.subtitle, 160),
    tagline: clampWords(c.tagline, 140),
    author: clampStr(c.author, 80),
    palette: [safeHex(pal[0], '#14171F'), safeHex(pal[1], '#9A3B32'), safeHex(pal[2], '#C9A227')],
    motif: MOTIF_LABELS[c.motif] ? c.motif : 'arcos',
  };
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
export const luminance = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const readable = (bg) => (luminance(bg) > 0.4 ? '#14171F' : '#F6F2EA');
const mix = (a, b, t) => '#' + rgb(a).map((v, i) => Math.round(v + (rgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

/** Quebra o texto em até maxLines linhas reduzindo a fonte até caber. Devolve { lines, size }. */
export function fitText(ctx, text, maxW, maxLines, start, min, fontFn) {
  for (let size = start; size >= min; size -= 4) {
    ctx.font = fontFn(size);
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = []; let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW)) return { lines, size };
  }
  // último recurso: trunca com reticências
  ctx.font = fontFn(min);
  const words = String(text).split(/\s+/); const lines = []; let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; } }
  if (cur) lines.push(cur);
  const cut = lines.slice(0, maxLines);
  if (lines.length > maxLines) cut[maxLines - 1] = cut[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  return { lines: cut, size: min };
}

function drawMotif(ctx, motif, color, box) {
  const { x, y, w, h } = box;
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 6;
  const cx = x + w / 2, cy = y + h / 2;
  if (motif === 'linhas') {
    ctx.globalAlpha = 0.35;
    for (let i = -h; i < w + h; i += 46) { ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + h, y); ctx.stroke(); }
  } else if (motif === 'circulos') {
    for (let i = 1; i <= 9; i++) { ctx.globalAlpha = 0.5 - i * 0.04; ctx.beginPath(); ctx.arc(cx, cy, i * (Math.min(w, h) / 12), 0, Math.PI * 2); ctx.stroke(); }
  } else if (motif === 'faixas') {
    const n = 14, bw = w / n;
    for (let i = 0; i < n; i++) { ctx.globalAlpha = 0.12 + (i % 4) * 0.1; ctx.fillRect(x + i * bw, y + (i % 3) * 30, bw - 14, h - (i % 3) * 30); }
  } else if (motif === 'grade') {
    ctx.globalAlpha = 0.3; ctx.lineWidth = 3;
    for (let gx = x; gx <= x + w; gx += 80) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
    for (let gy = y; gy <= y + h; gy += 80) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  } else if (motif === 'pontos') {
    for (let gx = x + 30; gx < x + w; gx += 64) for (let gy = y + 30; gy < y + h; gy += 64) {
      const d = Math.hypot(gx - cx, gy - cy) / Math.hypot(w, h); ctx.globalAlpha = Math.max(0.08, 0.55 - d); ctx.beginPath(); ctx.arc(gx, gy, 10 - d * 10, 0, Math.PI * 2); ctx.fill();
    }
  } else { // arcos
    for (let i = 1; i <= 8; i++) { ctx.globalAlpha = 0.55 - i * 0.05; ctx.beginPath(); ctx.arc(x + w * 0.5, y + h, i * (w / 9), Math.PI, 0); ctx.stroke(); }
  }
  ctx.restore();
}

/** Desenha a capa em um contexto 2D (canvas 1600x2560). */
export function drawCover(ctx, coverIn) {
  const c = normalizeCover(coverIn);
  const [c1, c2, accent] = c.palette;
  const W = COVER_W, H = COVER_H, PAD = 150;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  const light = c.template === 'minimal';
  const bgTop = light ? mix('#ffffff', c1, 0.06) : c1;
  const bgBot = light ? mix('#ffffff', c2, 0.1) : c2;
  const g = ctx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, bgTop); g.addColorStop(1, c.template === 'bold' ? c1 : bgBot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const baseBg = light ? bgTop : mix(c1, c2, 0.35);
  let fg = readable(baseBg);
  let acc = contrast(accent, baseBg) >= 2.2 ? accent : fg;
  if (c.template === 'bold') { // bloco de destaque
    ctx.fillStyle = contrast(accent, c1) >= 1.6 ? accent : mix(c1, '#ffffff', 0.18);
    ctx.fillRect(0, H * 0.42, W, H * 0.34);
  }

  const motifColor = light ? c2 : acc;
  const motifBox = c.template === 'moderno' ? { x: W * 0.28, y: 0, w: W * 0.72, h: H * 0.5 }
    : c.template === 'bold' ? { x: 0, y: 0, w: W, h: H * 0.4 }
      : { x: PAD, y: PAD, w: W - PAD * 2, h: H * 0.42 };
  drawMotif(ctx, c.motif, motifColor, motifBox);

  if (light) { ctx.strokeStyle = mix('#ffffff', c1, 0.5); ctx.lineWidth = 6; ctx.strokeRect(70, 70, W - 140, H - 140); }

  const title = c.title || 'Título do seu ebook';
  const maxW = W - PAD * 2;
  const align = c.template === 'moderno' ? 'left' : 'center';
  const tx = align === 'left' ? PAD : W / 2;
  const isBold = c.template === 'bold';
  const spaced = (px) => { if (ctx.letterSpacing !== undefined) ctx.letterSpacing = px; };
  ctx.textAlign = align;

  // ── 1) rodapé (autor + frase): medido primeiro, o resto é empilhado acima dele
  const AUTHOR_BASE = H - 170;
  const af = (s) => `600 ${s}px ${SANS}`;
  let afit = null, alh = 0;
  if (c.author) {
    spaced('6px');
    afit = fitText(ctx, c.author.toUpperCase(), maxW, 2, 64, 28, af);
    spaced('0px');
    alh = afit.size * 1.35;
  }
  const authorTop = afit ? AUTHOR_BASE - (afit.lines.length - 1) * alh - afit.size : H - 120;
  const gf = (s) => `500 ${s}px ${SANS}`;
  let gfit = null;
  if (c.tagline && !isBold) {
    spaced('4px');
    gfit = fitText(ctx, c.tagline.toUpperCase(), maxW, 2, 40, 24, gf);
    spaced('0px');
  }
  const taglineH = gfit ? gfit.lines.length * gfit.size * 1.5 : 0;
  const taglineTop = gfit ? authorTop - 70 - taglineH : authorTop;
  const footerTop = gfit ? taglineTop : authorTop;
  const bottomLimit = footerTop - 70;

  // ── 2) título e subtítulo
  let titleColor = fg;
  const blockY = H * 0.42, blockH2 = H * 0.34;
  if (isBold) {
    const blockColor = contrast(accent, c1) >= 1.6 ? accent : mix(c1, '#ffffff', 0.18);
    titleColor = readable(blockColor);
  }
  const tFont = (s) => (isBold ? `800 ${s}px ${SANS}` : c.template === 'moderno' ? `700 ${s}px ${SANS}` : `700 ${s}px ${SERIF}`);
  const tfit = fitText(ctx, isBold ? title.toUpperCase() : title, maxW, 5, isBold ? 150 : 170, 60, tFont);
  const lh = tfit.size * 1.12;
  const titleH = tfit.lines.length * lh;

  const sFont = (s) => `${c.template === 'moderno' ? '400' : 'italic 400'} ${s}px ${c.template === 'moderno' ? SANS : SERIF}`;
  const RULE_GAP = 70, RULE_H = 8, AFTER_RULE = 50;
  let sfit = null;
  if (c.subtitle) {
    // no modelo "bold" o subtítulo fica abaixo do bloco; nos demais acompanha o título
    const avail = isBold ? bottomLimit - (blockY + blockH2 + 40 + RULE_H + AFTER_RULE) : 420;
    for (const lines of [3, 2, 1]) {
      sfit = fitText(ctx, c.subtitle, maxW, lines, 76, 34, sFont);
      if (sfit.lines.length * sfit.size * 1.3 <= avail) break;
    }
  }
  const subLH = sfit ? sfit.size * 1.3 : 0;
  const stackH = titleH + RULE_GAP + RULE_H + AFTER_RULE + (sfit ? sfit.lines.length * subLH : 0);

  let top;
  if (isBold) top = blockY + (blockH2 - titleH) / 2;
  else if (c.template === 'moderno') top = bottomLimit - stackH;
  else top = Math.min(H * 0.6 - stackH / 2, bottomLimit - stackH);
  if (!isBold) top = Math.max(top, H * 0.16);

  ctx.fillStyle = titleColor; ctx.font = tFont(tfit.size);
  const firstBase = top + tfit.size * 0.85;
  tfit.lines.forEach((l, i) => ctx.fillText(l, tx, firstBase + i * lh));

  const ruleY = isBold ? blockY + blockH2 + 40 : top + titleH + RULE_GAP;
  const ruleW = 220;
  ctx.fillStyle = isBold ? readable(baseBg) : acc;
  ctx.fillRect(align === 'left' ? tx : tx - ruleW / 2, ruleY, ruleW, RULE_H);

  if (sfit) {
    ctx.fillStyle = isBold ? readable(baseBg) : fg; ctx.globalAlpha = 0.92; ctx.font = sFont(sfit.size);
    const sy = ruleY + RULE_H + AFTER_RULE + sfit.size * 0.8;
    sfit.lines.forEach((l, i) => ctx.fillText(l, tx, sy + i * subLH));
    ctx.globalAlpha = 1;
  }

  // ── 3) rodapé
  if (gfit) {
    ctx.fillStyle = fg; ctx.globalAlpha = 0.65; ctx.font = gf(gfit.size);
    spaced('4px');
    gfit.lines.forEach((l, i) => ctx.fillText(l, tx, taglineTop + gfit.size + i * gfit.size * 1.5));
    spaced('0px'); ctx.globalAlpha = 1;
  }
  if (afit) {
    ctx.fillStyle = isBold ? readable(baseBg) : fg; ctx.font = af(afit.size);
    spaced('6px');
    afit.lines.forEach((l, i) => ctx.fillText(l, tx, AUTHOR_BASE - (afit.lines.length - 1 - i) * alh));
    spaced('0px');
  }
  ctx.restore();
}

export function renderCoverCanvas(cover, canvas = document.createElement('canvas')) {
  canvas.width = COVER_W; canvas.height = COVER_H;
  drawCover(canvas.getContext('2d'), cover);
  return canvas;
}

export function coverToPng(cover) {
  const canvas = renderCoverCanvas(cover);
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) return reject(new Error('Não foi possível gerar a imagem da capa.'));
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}
