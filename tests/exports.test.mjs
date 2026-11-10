import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { jsPDF } from 'jspdf';
import { buildEpub } from '../public/js/export/epub.js';
import { buildDocx } from '../public/js/export/docx.js';
import { buildPdf, pdfSafe } from '../public/js/export/pdf.js';
import { buildMarkdown, buildHtml } from '../public/js/export/misc.js';
import { mockGenerate } from '../public/js/mock.js';

// leitor ZIP mínimo (store/deflate) para inspecionar os arquivos gerados
function readZip(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22; while (dv.getUint32(e, true) !== 0x06054b50) e--;
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = {}; const order = [];
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl));
    const lnl = dv.getUint16(lo + 26, true), lel = dv.getUint16(lo + 28, true);
    const raw = u8.subarray(lo + 30 + lnl + lel, lo + 30 + lnl + lel + csize);
    out[name] = { method, data: method === 8 ? inflateRawSync(raw) : raw }; order.push(name);
    p += 46 + nl + el + cl;
  }
  return { files: out, order };
}

const chText = mockGenerate({ task: 'chapter', messages: [{ content: 'TEMA: Café\nCAPITULO_ALVO: 1 | Começo' }] }).split('---RESUMO---')[0];
const long = Array.from({ length: 40 }, (_, i) => `Parágrafo ${i} com **negrito** e *itálico*, ação, coração e um texto razoavelmente longo para forçar quebra de linha e de página no PDF gerado pelo teste.`).join('\n\n');
const mk = (extra = {}) => ({ title: 'Café & Ação <x>', subtitle: 'Sub', author: 'Fulana', language: 'pt-BR',
  chapters: [{ title: 'Começo', text: chText }, { title: 'Longo '.repeat(12), text: long }, { title: 'Fim', text: chText }], ...extra });

test('epub: estrutura, mimetype primeiro e XML escapado', () => {
  const { files, order } = readZip(buildEpub(mk()));
  assert.equal(order[0], 'mimetype'); assert.equal(files.mimetype.method, 0);
  assert.equal(new TextDecoder().decode(files.mimetype.data), 'application/epub+zip');
  const opf = new TextDecoder().decode(files['OEBPS/content.opf'].data);
  assert.match(opf, /Café &amp; Ação &lt;x&gt;/); assert.match(opf, /properties="nav"/); assert.match(opf, /<dc:language>pt-BR/);
  const ch = new TextDecoder().decode(files['OEBPS/chapter01.xhtml'].data);
  assert.ok(!ch.includes('<tag>') && ch.includes('&lt;tag&gt;'));
  assert.ok(ch.includes('<h2>') && ch.includes('<ul>') && ch.includes('<blockquote>'));
  assert.equal(Object.keys(files).filter((n) => /chapter\d+\.xhtml/.test(n)).length, 3);
});
test('epub: ignora capítulos vazios e inclui capa quando há PNG', () => {
  const png = new Uint8Array(fs.readFileSync(new URL('./fixtures/cover.png', import.meta.url)));
  const { files } = readZip(buildEpub(mk({ chapters: [{ title: 'A', text: 'x' }, { title: 'B', text: '  ' }], coverPng: png })));
  assert.ok(files['OEBPS/images/cover.png'] && files['OEBPS/cover.xhtml']);
  assert.equal(Object.keys(files).filter((n) => /chapter\d+\.xhtml/.test(n)).length, 1);
});
test('docx: partes obrigatórias e texto escapado', () => {
  const png = new Uint8Array(fs.readFileSync(new URL('./fixtures/cover.png', import.meta.url)));
  const { files } = readZip(buildDocx(mk({ coverPng: png })));
  for (const n of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/media/cover.png']) assert.ok(files[n], n);
  const doc = new TextDecoder().decode(files['word/document.xml'].data);
  assert.match(doc, /Heading1/); assert.ok(!doc.includes('<tag>'));
});
test('pdf: gera páginas, sumário e texto com acentos', () => {
  assert.equal(pdfSafe('a→b “x” 😀'), 'a->b “x” ');
  const bytes = buildPdf(mk(), { jsPDF });
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), '%PDF-');
  const f = path.join(os.tmpdir(), `escriba-${process.pid}.pdf`); fs.writeFileSync(f, bytes);
  try {
    const txt = execFileSync('pdftotext', [f, '-'], { encoding: 'utf8' });
    assert.match(txt, /Sumário/); assert.match(txt, /Ação/); assert.match(txt, /CAPÍTULO 2/i);
    const info = execFileSync('pdfinfo', [f], { encoding: 'utf8' });
    assert.match(info, /Page size:\s+432 x 648/); assert.ok(Number(/Pages:\s+(\d+)/.exec(info)[1]) >= 6);
  } catch (e) { if (e.code !== 'ENOENT') throw e; /* sem poppler: só valida cabeçalho */ }
  finally { fs.rmSync(f, { force: true }); }
});
test('md/html: exportam título, capítulos e escapam HTML', () => {
  const md = buildMarkdown(mk()); assert.match(md, /^# Café/); assert.match(md, /## Capítulo 1: Começo/);
  const h = buildHtml(mk()); assert.ok(!h.includes('<x>') && h.includes('&lt;x&gt;')); assert.match(h, /id="c3"/);
});
