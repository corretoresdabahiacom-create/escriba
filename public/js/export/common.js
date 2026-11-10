// Utilidades comuns aos exportadores.

export const LABELS = {
  'pt-BR': { chapter: 'Capítulo', contents: 'Sumário', cover: 'Capa', by: 'por', title: 'Folha de rosto' },
  en: { chapter: 'Chapter', contents: 'Contents', cover: 'Cover', by: 'by', title: 'Title page' },
  es: { chapter: 'Capítulo', contents: 'Índice', cover: 'Portada', by: 'por', title: 'Portada interior' },
};
export const labelsFor = (lang) => LABELS[lang] || LABELS['pt-BR'];

export const slugify = (s, fallback = 'ebook') =>
  String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || fallback;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const h = [...Array(16)].map(() => Math.floor(Math.random() * 256));
  h[6] = (h[6] & 0x0f) | 0x40; h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

/** Lê largura/altura de um PNG a partir do cabeçalho IHDR. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { w: dv.getUint32(16), h: dv.getUint32(20) };
}

export const isoNow = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
