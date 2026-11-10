// Backend do Escriba — Cloudflare Worker (plano gratuito, sem cartão).
//   GET  /api/health    → provedores disponíveis neste servidor
//   POST /api/generate  → proxy seguro para LLMs, com fallback entre provedores
// As chaves ficam em secrets do Worker; o navegador nunca as vê.
// Opcionalmente o usuário envia a PRÓPRIA chave no cabeçalho x-user-api-key (usada só na chamada, nunca armazenada).

import { callProvider, ProviderError, PROVIDERS, DEFAULT_ORDER } from '../public/js/providers.js';

const LIMITS = { body: 200_000, system: 6_000, message: 60_000, messages: 8, maxTokens: 4_096 };
const hits = new Map(); // limitador best-effort em memória (por isolate)

const baseHeaders = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...baseHeaders, ...extra } });
}
const fail = (status, code, message, extra) => json({ error: { code, message } }, status, extra);

function corsHeaders(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  let sameOrigin = false;
  try { sameOrigin = new URL(origin).host === new URL(request.url).host; } catch { /* origem inválida */ }
  if (sameOrigin || allowed.includes('*') || allowed.includes(origin)) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'content-type, x-user-api-key, x-access-code',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-max-age': '86400',
      vary: 'origin',
    };
  }
  return null; // origem não permitida
}

function rateLimited(ip, env) {
  const max = parseInt(env.RATE_LIMIT_PER_10MIN || '60', 10);
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 600_000) hits.delete(k);
  return arr.length > max;
}

export function serverProviders(env) {
  const out = [];
  for (const [id, meta] of Object.entries(PROVIDERS)) {
    if (id === 'mock') { if (env.MOCK_LLM === '1') out.push(id); continue; }
    if (id === 'workersai') { if (env.AI) out.push(id); continue; }
    if (meta.envKey && env[meta.envKey]) out.push(id);
  }
  return out;
}

function orderedProviders(env) {
  const avail = new Set(serverProviders(env));
  const custom = String(env.PROVIDER_ORDER || '').split(',').map((s) => s.trim()).filter(Boolean);
  const order = [...(custom.length ? custom : DEFAULT_ORDER), 'mock'];
  return order.filter((id, i) => avail.has(id) && order.indexOf(id) === i);
}

function validate(body) {
  if (!body || typeof body !== 'object') return 'Corpo inválido.';
  if (typeof body.system !== 'string' || !body.system.trim() || body.system.length > LIMITS.system) return 'Campo "system" inválido.';
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > LIMITS.messages) return 'Campo "messages" inválido.';
  for (const m of body.messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || !m.content.trim() || m.content.length > LIMITS.message) return 'Mensagem inválida ou grande demais.';
  }
  if (body.messages[body.messages.length - 1].role !== 'user') return 'A última mensagem deve ser do usuário.';
  if (body.model != null && (typeof body.model !== 'string' || body.model.length > 120 || /[\s]/.test(body.model))) return 'Modelo inválido.';
  return null;
}

async function handleGenerate(request, env) {
  if (env.ACCESS_CODE && request.headers.get('x-access-code') !== env.ACCESS_CODE) {
    return fail(401, 'access_code', 'Código de acesso inválido ou ausente.');
  }
  const ip = request.headers.get('cf-connecting-ip') || 'local';
  if (rateLimited(ip, env)) return fail(429, 'rate_limited', 'Muitas requisições. Aguarde alguns minutos.', { 'retry-after': '120' });

  const len = parseInt(request.headers.get('content-length') || '0', 10);
  if (len > LIMITS.body) return fail(413, 'too_large', 'Requisição grande demais.');
  let body;
  try {
    const text = await request.text();
    if (text.length > LIMITS.body) return fail(413, 'too_large', 'Requisição grande demais.');
    body = JSON.parse(text);
  } catch { return fail(400, 'bad_json', 'JSON inválido.'); }

  const bad = validate(body);
  if (bad) return fail(400, 'bad_request', bad);

  const call = {
    task: typeof body.task === 'string' ? body.task.slice(0, 24) : '',
    system: body.system,
    messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
    maxTokens: Math.min(Math.max(parseInt(body.maxTokens, 10) || 1500, 64), LIMITS.maxTokens),
    temperature: Math.min(Math.max(Number(body.temperature ?? 0.7), 0), 1.2),
    model: body.model || undefined,
    env,
  };

  const userKey = request.headers.get('x-user-api-key') || '';
  const wanted = typeof body.provider === 'string' ? body.provider : 'auto';

  // chave própria do usuário → usa exatamente o provedor escolhido, sem fallback
  if (userKey) {
    const meta = PROVIDERS[wanted];
    if (!meta || meta.serverOnly) return fail(400, 'bad_provider', 'Provedor inválido para chave própria.');
    try {
      const r = await callProvider({ ...call, provider: wanted, apiKey: userKey });
      return json({ text: r.text, provider: r.provider, model: r.model, tried: [] });
    } catch (e) { return providerFail(e); }
  }

  const avail = orderedProviders(env);
  if (!avail.length) return fail(503, 'not_configured', 'Nenhum provedor de IA configurado neste servidor. Configure um secret (ex.: GROQ_API_KEY) ou use sua própria chave.');

  let chain;
  if (wanted === 'auto') chain = avail;
  else if (avail.includes(wanted)) chain = [wanted];
  else return fail(400, 'bad_provider', `Provedor “${wanted}” não está disponível neste servidor.`);

  const tried = [];
  let lastErr;
  for (const id of chain) {
    try {
      const keyName = PROVIDERS[id].envKey;
      const r = await callProvider({ ...call, provider: id, apiKey: keyName ? env[keyName] : undefined, model: chain.length === 1 || id === wanted ? call.model : undefined });
      return json({ text: r.text, provider: r.provider, model: r.model, tried });
    } catch (e) {
      lastErr = e;
      tried.push({ provider: id, code: e?.code || 'error' });
      // erro do cliente (modelo inválido, conteúdo bloqueado) não adianta tentar outro provedor? Tenta mesmo assim, exceto bloqueio.
      if (e?.code === 'blocked') break;
    }
  }
  return providerFail(lastErr, tried);
}

function providerFail(e, tried = []) {
  if (e instanceof ProviderError) {
    return json({ error: { code: e.code, message: e.message, provider: e.provider }, tried }, e.status || 502);
  }
  return json({ error: { code: 'internal', message: 'Erro interno ao gerar o texto.' }, tried }, 500);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });
    }

    const cors = corsHeaders(request, env);
    if (cors === null) return fail(403, 'origin', 'Origem não permitida.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let res;
    try {
      if (url.pathname === '/api/health' && request.method === 'GET') {
        res = json({
          ok: true,
          version: '1.0.0',
          needsAccessCode: Boolean(env.ACCESS_CODE),
          providers: serverProviders(env).map((id) => ({ id, label: PROVIDERS[id].label, model: (PROVIDERS[id].envModel && env[PROVIDERS[id].envModel]) || PROVIDERS[id].defaultModel })),
        });
      } else if (url.pathname === '/api/generate' && request.method === 'POST') {
        res = await handleGenerate(request, env);
      } else {
        res = fail(url.pathname.startsWith('/api/') ? 404 : 405, 'not_found', 'Rota não encontrada.');
      }
    } catch (e) {
      res = fail(500, 'internal', 'Erro interno.');
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};
