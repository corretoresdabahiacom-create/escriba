import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseInline, blocksToHtml, countWords } from '../public/js/md.js';
import { extractJson, safeHex, splitChapterAndSummary, cleanChapterText, normalizeOutline } from '../public/js/parse.js';
import { zip, crc32 } from '../public/js/zip.js';
import { chapterPrompt, outlinePrompt } from '../public/js/prompts.js';

test('md: blocos e inline', () => {
  const b = parseBlocks('# T\n\nUm **forte** e *leve*.\nContinua.\n\n- a\n- b\n\n1. x\n2. y\n\n> cita\n\n---\n\n### sub');
  assert.deepEqual(b.map((x) => x.t), ['h2', 'p', 'ul', 'ol', 'quote', 'hr', 'h3']);
  assert.equal(b[1].runs.map((r) => r.t).join(''), 'Um forte e leve. Continua.');
  assert.ok(b[1].runs.some((r) => r.b) && b[1].runs.some((r) => r.i));
});
test('md: HTML escapa conteúdo', () => {
  const h = blocksToHtml(parseBlocks('<script>alert(1)</script> & "x"'));
  assert.ok(!h.includes('<script>'));
  assert.ok(h.includes('&lt;script&gt;') && h.includes('&amp;'));
});
test('md: snake_case não vira itálico', () => {
  assert.equal(parseInline('use a_variavel_x aqui').length, 1);
});
test('parse: JSON em cerca, com vírgula sobrando e lixo ao redor', () => {
  assert.deepEqual(extractJson('```json\n{"a":1,}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Claro! {"a":{"b":"}"}} fim'), { a: { b: '}' } });
  assert.throws(() => extractJson('{"a": [1,2'), /incompleto/);
  assert.throws(() => extractJson('sem json'), /JSON/);
});
test('parse: cores seguras', () => {
  assert.equal(safeHex('#ABC', '#000'), '#aabbcc');
  assert.equal(safeHex('red;}</style>', '#111111'), '#111111');
});
test('parse: resumo e título repetido', () => {
  const r = splitChapterAndSummary('Texto\n\n---RESUMO---\nResumo aqui.');
  assert.equal(r.text, 'Texto'); assert.equal(r.summary, 'Resumo aqui.');
  assert.equal(cleanChapterText('Claro! Aqui está:\n\n# Capítulo 2: Meu Título\n\nCorpo', 'Meu Título'), 'Corpo');
  assert.equal(cleanChapterText('Corpo direto', 'X'), 'Corpo direto');
});
test('parse: outline normaliza e limita', () => {
  const o = normalizeOutline({ titulo: 'T', capitulos: [{ titulo: 'A', resumo: 'r' }, 'B'] });
  assert.equal(o.chapters.length, 2); assert.equal(o.chapters[1].title, 'B');
  assert.throws(() => normalizeOutline({ chapters: [] }));
});
test('zip: crc32 conhecido', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const z = zip([{ name: 'a.txt', data: 'oi' }]);
  assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b);
});
test('prompts: contexto compacto e marcadores', () => {
  const p = { title: 'T', subtitle: '', brief: { tema: 'x', publico: 'y', tom: 'z', idioma: 'pt-BR', tamanho: 'medio' },
    chapters: [{ title: 'A', summary: 's', text: 'a'.repeat(5000), resumo: 'res A' }, { title: 'B', summary: 's2', text: '' }] };
  const c = chapterPrompt(p, 1);
  assert.ok(c.messages[0].content.includes('CAPITULO_ALVO: 2 | B'));
  assert.ok(c.messages[0].content.includes('res A'));
  assert.ok(c.messages[0].content.length < 3000, 'não deve reenviar o capítulo inteiro');
  assert.ok(outlinePrompt({ ...p.brief, numCapitulos: 6 }).messages[0].content.includes('NUMERO_DE_CAPITULOS: 6'));
  assert.equal(countWords('a b  c'), 3);
});
