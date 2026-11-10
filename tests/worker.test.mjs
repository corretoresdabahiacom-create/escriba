import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { callProvider } from '../public/js/providers.js';

const env0 = { MOCK_LLM: '1', RATE_LIMIT_PER_10MIN: '1000' };
const req = (path, { method = 'GET', body, headers = {} } = {}) =>
  new Request('https://escriba.test' + path, { method, headers: { 'content-type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
const ok = { task: 'outline', system: 'sys', messages: [{ role: 'user', content: 'TEMA: Café\nNUMERO_DE_CAPITULOS: 3' }] };

test('health lista provedores e não vaza chaves', async () => {
  const r = await worker.fetch(req('/api/health'), { ...env0, GROQ_API_KEY: 'gsk_secret' });
  const j = await r.json();
  assert.equal(j.ok, true); assert.deepEqual(j.providers.map((p) => p.id), ['groq', 'mock']);
  assert.ok(!JSON.stringify(j).includes('gsk_secret'));
});
test('generate com mock devolve outline', async () => {
  const r = await worker.fetch(req('/api/generate', { method: 'POST', body: ok }), env0);
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(JSON.parse(j.text).chapters.length, 3); assert.equal(j.provider, 'mock');
});
test('validação rejeita corpo inválido, roles e tamanho', async () => {
  for (const body of [{}, { ...ok, messages: [] }, { ...ok, messages: [{ role: 'system', content: 'x' }] }, { ...ok, system: '' }, { ...ok, messages: [{ role: 'user', content: 'x'.repeat(70000) }] }, { ...ok, model: 'a b' }]) {
    const r = await worker.fetch(req('/api/generate', { method: 'POST', body }), env0);
    assert.ok([400, 413].includes(r.status), JSON.stringify(body).slice(0, 40));
  }
  const r = await worker.fetch(new Request('https://escriba.test/api/generate', { method: 'POST', body: '{nao-json' }), env0);
  assert.equal(r.status, 400);
});
test('sem provedor configurado → 503 claro', async () => {
  const r = await worker.fetch(req('/api/generate', { method: 'POST', body: ok }), {});
  assert.equal(r.status, 503); assert.equal((await r.json()).error.code, 'not_configured');
});
test('código de acesso é exigido quando configurado', async () => {
  const env = { ...env0, ACCESS_CODE: 'abc' };
  assert.equal((await worker.fetch(req('/api/generate', { method: 'POST', body: ok }), env)).status, 401);
  assert.equal((await worker.fetch(req('/api/generate', { method: 'POST', body: ok, headers: { 'x-access-code': 'abc' } }), env)).status, 200);
});
test('CORS: bloqueia origem estranha, libera a permitida e responde preflight', async () => {
  const bad = await worker.fetch(req('/api/health', { headers: { origin: 'https://evil.example' } }), env0);
  assert.equal(bad.status, 403);
  const env = { ...env0, ALLOWED_ORIGINS: 'https://user.github.io' };
  const good = await worker.fetch(req('/api/health', { headers: { origin: 'https://user.github.io' } }), env);
  assert.equal(good.headers.get('access-control-allow-origin'), 'https://user.github.io');
  const pre = await worker.fetch(req('/api/generate', { method: 'OPTIONS', headers: { origin: 'https://user.github.io' } }), env);
  assert.equal(pre.status, 204);
});
test('rate limit por IP', async () => {
  const env = { ...env0, RATE_LIMIT_PER_10MIN: '2' };
  const h = { 'cf-connecting-ip': '9.9.9.9' };
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await worker.fetch(req('/api/generate', { method: 'POST', body: ok, headers: h }), env)).status);
  assert.deepEqual(codes, [200, 200, 429, 429]);
});
test('fallback: provedor com cota esgotada cai para o próximo', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => String(url).includes('groq')
    ? new Response('{"error":{"message":"rate limit"}}', { status: 429 })
    : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'olá do gemini' }] } }] }), { status: 200 });
  try {
    const r = await worker.fetch(req('/api/generate', { method: 'POST', body: ok }), { GROQ_API_KEY: 'k1', GEMINI_API_KEY: 'k2', RATE_LIMIT_PER_10MIN: '1000' });
    const j = await r.json();
    assert.equal(j.provider, 'gemini'); assert.equal(j.text, 'olá do gemini'); assert.deepEqual(j.tried, [{ provider: 'groq', code: 'quota' }]);
  } finally { globalThis.fetch = realFetch; }
});
test('chave própria do usuário: usa só aquele provedor e propaga erro de chave', async () => {
  const realFetch = globalThis.fetch; let seen;
  globalThis.fetch = async (url, init) => { seen = init.headers; return new Response('{}', { status: 401 }); };
  try {
    const r = await worker.fetch(req('/api/generate', { method: 'POST', body: { ...ok, provider: 'groq' }, headers: { 'x-user-api-key': 'minha' } }), env0);
    assert.equal(r.status, 401); assert.equal((await r.json()).error.code, 'bad_key'); assert.equal(seen.authorization, 'Bearer minha');
  } finally { globalThis.fetch = realFetch; }
});
test('providers: Workers AI via binding e erro de cota', async () => {
  const env = { AI: { run: async (m, p) => ({ response: `ok ${m} ${p.messages.length}` }) } };
  const r = await callProvider({ provider: 'workersai', system: 's', messages: [{ role: 'user', content: 'u' }], env });
  assert.match(r.text, /ok @cf\/meta\/llama-3.3-70b-instruct-fp8-fast 2/);
  await assert.rejects(callProvider({ provider: 'workersai', system: 's', messages: [{ role: 'user', content: 'u' }], env: { AI: { run: async () => { throw new Error('4006: you have used up your daily free allocation of 10,000 neurons'); } } } }), (e) => e.code === 'quota');
});
