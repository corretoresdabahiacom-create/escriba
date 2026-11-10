// Gera um EPUB de exemplo (com capa, acentos, listas, citações e títulos longos) para validar no epubcheck.
// Uso: node scripts/make-sample-epub.mjs saida.epub
import fs from 'node:fs';
import { buildEpub } from '../public/js/export/epub.js';
import { mockGenerate } from '../public/js/mock.js';

const out = process.argv[2] || 'sample.epub';
const ch = (n, t) => mockGenerate({ task: 'chapter', messages: [{ content: `TEMA: Café & Ação\nCAPITULO_ALVO: ${n} | ${t}` }] }).split('---RESUMO---')[0];
const png = new Uint8Array(fs.readFileSync(new URL('../tests/fixtures/cover.png', import.meta.url)));

const bytes = buildEpub({
  title: 'Café & Ação <teste>', subtitle: 'Um livro de exemplo', author: 'Fulana de Tal', language: 'pt-BR',
  chapters: [
    { title: 'Começo', text: ch(1, 'Começo') },
    { title: 'Um título de capítulo bem longo para testar quebras e escapes & "aspas"', text: ch(2, 'Meio') },
    { title: 'Fim', text: ch(3, 'Fim') },
  ],
  coverPng: png,
});
fs.writeFileSync(out, bytes);
console.log(`EPUB de exemplo gravado em ${out} (${bytes.length} bytes)`);
