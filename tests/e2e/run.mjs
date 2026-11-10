// E2E: sobe o Worker local (provedor mock) e conduz o estúdio num Chromium real.
import { spawn, execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 8799, DPORT = 8798;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'escriba-e2e-'));
const SHOTS = process.env.SHOTS || '';
let pass = 0; const step = async (name, fn) => { try { await fn(); pass++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name, '\n   ', e.message); throw e; } };

async function waitFor(url, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.ok) return; } catch { /* aguarda */ } await new Promise((r) => setTimeout(r, 500)); }
  throw new Error('timeout esperando ' + url);
}

const wr = spawn('npx', ['wrangler', 'dev', '-c', 'wrangler.e2e.toml', '--port', String(PORT), '--ip', '127.0.0.1'], { stdio: 'ignore', detached: true });
// servidor estático sem API (simula GitHub Pages)
const staticSrv = http.createServer((req, res) => {
  const p = path.join('public', decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  fs.readFile(p, (err, buf) => { if (err) { res.writeHead(404); res.end('nf'); return; } const ext = path.extname(p); res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'application/octet-stream' }); res.end(buf); });
}).listen(DPORT, '127.0.0.1');
const cleanup = () => { try { process.kill(-wr.pid); } catch { /* já saiu */ } staticSrv.close(); };
process.on('exit', cleanup);

let browser;
try {
  await waitFor(`${BASE}/api/health`);
  browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_(NAME|INTERNET|CONNECTION|BLOCKED|FAILED|TUNNEL)|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.dismiss());
  const shot = async (n) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
  const dl = async (btnText) => { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.getByRole('button', { name: btnText }).click()]); const f = path.join(OUT, d.suggestedFilename()); await d.saveAs(f); return f; };

  console.log('Landing');
  await step('landing carrega e aponta para o estúdio', async () => {
    await page.goto(BASE + '/');
    assert.match(await page.title(), /Escriba/);
    assert.equal(await page.locator('a[href="estudio.html"]').first().isVisible(), true);
    const txt = await page.locator('body').innerText();
    assert.ok(!/MOBI\)/.test(txt.replace(/descontinuado/g, '')) || /descontinuado/.test(txt), 'não deve prometer MOBI');
    assert.ok(!/R\$ 47|R\$ 197/.test(txt), 'não deve ter planos pagos fictícios');
    await shot('01-landing');
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1); assert.equal(ov, false, 'overflow horizontal');
  });

  console.log('Estúdio (servidor + mock)');
  await page.goto(BASE + '/estudio.html');
  await step('abre vazio e cria projeto', async () => {
    await page.getByRole('button', { name: 'Novo ebook' }).first().click();
    await page.getByLabel('Sobre o que é o seu ebook?').fill('Finanças para consultório odontológico');
    await page.getByLabel('Nome do autor').fill('Dra. Teste');
    await shot('02-brief');
  });
  await step('gera estrutura e permite editar/reordenar', async () => {
    await page.getByLabel('Nº de capítulos').fill('4');
    await page.getByRole('button', { name: 'Gerar estrutura com IA' }).click();
    await page.getByRole('heading', { name: 'Estrutura' }).waitFor();
    assert.equal(await page.locator('.ol-item').count(), 4);
    await page.getByLabel('Título do capítulo 2').fill('Capítulo editado');
    await page.getByRole('button', { name: 'Mover capítulo 2 para cima' }).click();
    assert.equal(await page.getByLabel('Título do capítulo 1').inputValue(), 'Capítulo editado');
    await page.getByRole('button', { name: '+ Adicionar capítulo' }).click();
    assert.equal(await page.locator('.ol-item').count(), 5);
    await page.getByRole('button', { name: 'Remover capítulo 5' }).click();
    assert.equal(await page.locator('.ol-item').count(), 4);
    await shot('03-outline');
    await page.getByRole('button', { name: /Aprovar e escrever/ }).click();
  });
  await step('escreve capítulo, pré-visualiza, reescreve e desfaz', async () => {
    await page.getByRole('button', { name: 'Escrever com IA' }).click();
    await page.waitForFunction(() => document.querySelector('#c-text')?.value.length > 0);
    const v = await page.locator('#c-text').inputValue();
    assert.match(v, /texto de teste do capítulo 1/); assert.ok(!/---RESUMO---/.test(v), 'resumo deve ser separado');
    await page.getByRole('button', { name: 'Pré-visualizar' }).click();
    assert.ok(await page.locator('.prose h2').count() >= 2); assert.ok(await page.locator('.prose ul li').count() >= 2);
    await page.getByRole('button', { name: 'Editar' }).click();
    await page.locator('#rw').fill('deixe mais curto');
    await page.getByRole('button', { name: 'Reescrever' }).click();
    await page.waitForFunction(() => document.querySelector('#c-text')?.value.includes('reescrito: deixe mais curto'));
    await page.getByRole('button', { name: 'Desfazer última geração' }).click();
    assert.ok(!(await page.locator('#c-text').inputValue()).includes('reescrito'));
    await shot('04-chapters');
  });
  await step('edição manual persiste e atualiza contagem', async () => {
    await page.locator('#c-text').fill('Texto manual com **negrito**. '.repeat(10));
    assert.match(await page.locator('#wc').innerText(), /^\d+ palavras/);
  });
  await step('escreve todos os pendentes', async () => {
    await page.getByRole('button', { name: /Escrever os 3 pendentes/ }).click();
    await page.getByRole('button', { name: /Escrever os 0 pendentes/ }).waitFor({ timeout: 30000 });
    assert.equal(await page.locator('.ch-list .badge.ok').count(), 4);
  });
  await step('capa: modelos, motivo, PNG real', async () => {
    await page.getByRole('button', { name: /Capa/ }).first().click();
    await page.getByRole('button', { name: 'Sugerir conceito com IA' }).click();
    await page.waitForFunction(() => document.querySelector('#cv-title')?.value.startsWith('Guia de'));
    const hasInk = async () => { await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); return page.evaluate(() => { const c = document.querySelector('#coverCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const first = [d[0], d[1], d[2]]; let diff = 0; for (let i = 0; i < d.length; i += 4 * 997) if (Math.abs(d[i] - first[0]) + Math.abs(d[i + 1] - first[1]) > 30) diff++; return { w: c.width, h: c.height, diff }; }); };
    for (const t of ['Clássico', 'Moderno', 'Minimalista', 'Impacto']) { await page.getByRole('button', { name: t }).click(); const r = await hasInk(); assert.equal(r.w, 1600); assert.equal(r.h, 2560); assert.ok(r.diff > 20, `capa ${t} vazia`); if (SHOTS) await page.locator('#coverCanvas').screenshot({ path: path.join(SHOTS, `05-capa-${t}.png`) }); }
    const f = await dl('Baixar PNG'); const b = fs.readFileSync(f); assert.equal(b.readUInt32BE(16), 1600); assert.equal(b.readUInt32BE(20), 2560);
  });
  await step('kit KDP e kit de venda', async () => {
    await page.getByRole('button', { name: /Publicação/ }).first().click();
    await page.getByRole('button', { name: 'Gerar kit KDP', exact: true }).click();
    await page.getByRole('heading', { name: 'Títulos sugeridos' }).waitFor();
    assert.equal(await page.locator('.title-opt').filter({ hasText: 'Usar este' }).count(), 5);
    await page.getByRole('button', { name: 'Gerar kit de venda', exact: true }).click();
    await page.getByRole('heading', { name: 'Kit de venda' }).waitFor();
    await page.getByRole('button', { name: 'Usar este' }).first().click();
    assert.match(await page.locator('#projName').innerText(), /Título 1/);
    await shot('06-sell');
  });
  await step('exporta EPUB/DOCX/PDF/HTML/MD e arquivos são válidos', async () => {
    await page.getByRole('button', { name: /Exportar/ }).first().click();
    await shot('07-export');
    const names = ['EPUB', 'PDF', 'DOCX', 'HTML', 'Markdown'];
    const files = {};
    for (const n of names) { const card = page.locator('.exp', { has: page.getByRole('heading', { name: n, exact: true }) }); const [d] = await Promise.all([page.waitForEvent('download', { timeout: 40000 }), card.getByRole('button', { name: 'Baixar' }).click()]); files[n] = path.join(OUT, d.suggestedFilename()); await d.saveAs(files[n]); }
    execFileSync('unzip', ['-tq', files.EPUB]); execFileSync('unzip', ['-tq', files.DOCX]);
    const listing = execFileSync('unzip', ['-l', files.EPUB], { encoding: 'utf8' });
    assert.match(listing, /images\/cover\.png/); assert.equal((listing.match(/chapter\d+\.xhtml/g) || []).length, 4);
    assert.equal(fs.readFileSync(files.PDF).subarray(0, 5).toString(), '%PDF-');
    let hasPoppler = true; try { execFileSync('pdfinfo', ['-v'], { stdio: 'ignore' }); } catch (e) { hasPoppler = e.code !== 'ENOENT'; }
    if (hasPoppler) {
      const pdfInfo = execFileSync('pdfinfo', [files.PDF], { encoding: 'utf8' }); assert.match(pdfInfo, /Page size:\s+432 x 648/);
      assert.match(execFileSync('pdftotext', [files.PDF, '-'], { encoding: 'utf8' }), /Sumário/);
    } else console.log('    (poppler ausente: validação detalhada do PDF ignorada)');
    const html = fs.readFileSync(files.HTML, 'utf8'); assert.match(html, /data:image\/png;base64/);
    assert.match(fs.readFileSync(files.Markdown, 'utf8'), /^# /);
    fs.copyFileSync(files.EPUB, path.join(OUT, 'final.epub')); fs.copyFileSync(files.DOCX, path.join(OUT, 'final.docx'));
  });
  await step('persistência: recarrega e mantém tudo', async () => {
    await page.reload();
    await page.locator('.proj-card').first().waitFor();
    assert.match(await page.locator('.proj-card').first().innerText(), /4\/4 capítulos/);
    await page.getByRole('button', { name: 'Abrir' }).click();
    assert.match(await page.locator('#projName').innerText(), /Título 1/);
  });
  await step('backup e importação (sem sobrescrever)', async () => {
    await page.getByRole('button', { name: 'Meus livros' }).click();
    const f = await dl('Baixar backup de tudo'); const j = JSON.parse(fs.readFileSync(f, 'utf8')); assert.equal(j.projects.length, 1);
    await page.locator('#importFile').setInputFiles(f);
    await page.waitForFunction(() => document.querySelectorAll('.proj-card').length === 2);
  });
  await step('XSS: conteúdo malicioso é tratado como texto', async () => {
    await page.evaluate(() => { window.__xss = 0; });
    await page.getByRole('button', { name: 'Novo ebook' }).first().click();
    await page.getByLabel('Sobre o que é o seu ebook?').fill('<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>');
    await page.getByLabel('Nome do autor').fill('"><svg onload="window.__xss=3">');
    await page.getByRole('button', { name: 'Gerar estrutura com IA' }).click();
    await page.getByRole('heading', { name: 'Estrutura' }).waitFor();
    await page.getByRole('button', { name: /Aprovar/ }).click();
    await page.getByRole('button', { name: 'Escrever com IA' }).click(); await page.waitForFunction(() => document.querySelector('#c-text')?.value.length > 0);
    await page.getByRole('button', { name: 'Pré-visualizar' }).click();
    await page.getByRole('button', { name: 'Meus livros' }).click();
    assert.equal(await page.evaluate(() => window.__xss), 0);
    assert.equal(await page.locator('svg[onload], img[onerror]').count(), 0);
  });
  await step('mobile: sem overflow horizontal', async () => {
    await page.setViewportSize({ width: 390, height: 800 });
    for (const u of ['/', '/estudio.html']) { await page.goto(BASE + u); const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(ov <= 1, `${u} overflow ${ov}`); }
    await page.getByRole('button', { name: 'Abrir' }).first().click();
    await page.getByRole('button', { name: /Capítulos/ }).first().click();
    const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert.ok(ov <= 1, `capítulos overflow ${ov}`);
    await shot('08-mobile');
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  console.log('Modo direto (site estático, sem servidor; provedor simulado)');
  const p2 = await ctx.newPage();
  await p2.route('https://api.groq.com/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST' } });
    const body = JSON.parse(route.request().postData());
    assert.equal(route.request().headers().authorization, 'Bearer gsk_teste');
    const { mockGenerate } = await import('../../public/js/mock.js');
    const text = mockGenerate({ task: body.messages.some((m) => m.content.includes('NUMERO_DE_CAPITULOS')) ? 'outline' : 'chapter', messages: body.messages });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: text } }], model: 'llama-x' }) });
  });
  await step('sem servidor: mostra aviso, aceita chave e gera direto no provedor', async () => {
    await p2.goto(`http://127.0.0.1:${DPORT}/estudio.html`);
    await p2.getByRole('button', { name: 'Novo ebook' }).first().click();
    await p2.getByText('Falta conectar uma IA').waitFor();
    await p2.getByLabel('Sobre o que é o seu ebook?').fill('Jardinagem urbana');
    await p2.getByRole('button', { name: 'Gerar estrutura com IA' }).click();
    await p2.getByText(/informe sua chave/).first().waitFor();
    await p2.getByRole('button', { name: 'Configurações de IA' }).click();
    await p2.locator('#s-prov').selectOption('groq');
    await p2.locator('#s-key').fill('gsk_teste');
    await p2.getByRole('button', { name: 'Salvar' }).click();
    await p2.getByRole('button', { name: 'Gerar estrutura com IA' }).click();
    await p2.getByRole('heading', { name: 'Estrutura' }).waitFor();
    assert.ok(await p2.locator('.ol-item').count() >= 3);
    // a chave não foi persistida em localStorage (padrão: só na sessão)
    const inLocal = await p2.evaluate(() => Object.keys(localStorage).some((k) => /apikey/.test(k)) || JSON.stringify(localStorage).includes('gsk_teste'));
    assert.equal(inLocal, false);
  });

  assert.deepEqual(errors, [], 'erros de console/página:\n' + errors.join('\n'));
  console.log(`\nE2E OK — ${pass} etapas. Arquivos em ${OUT}`);
} catch (e) {
  console.error('\nE2E FALHOU:', e.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  cleanup();
}
