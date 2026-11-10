// Cliente de geração. Dois modos:
//  • servidor: POST {apiBase}/api/generate (Cloudflare Worker) — usa as chaves/cotas do servidor ou a chave do usuário no header
//  • direto:   chama o provedor direto do navegador com a chave do usuário (para hospedagem 100% estática, ex.: GitHub Pages)
import { callProvider, ProviderError, PROVIDERS } from './providers.js';
import { extractJson } from './parse.js';

const cfg = () => globalThis.ESCRIBA_CONFIG || {};
const apiBase = () => String(cfg().apiBase || '').replace(/\/+$/, '');

export const BYOK_PROVIDERS = Object.entries(PROVIDERS).filter(([, m]) => !m.serverOnly).map(([id, m]) => ({ id, ...m }));

/** Descobre se há um backend utilizável. */
export async function detectBackend() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch(`${apiBase()}/api/health`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    const j = await r.json();
    if (r.ok && j?.ok) return { mode: 'server', providers: j.providers || [], needsAccessCode: !!j.needsAccessCode };
  } catch { /* sem backend */ } finally { clearTimeout(t); }
  return { mode: 'direct', providers: [], needsAccessCode: false };
}

export class GenError extends Error {
  constructor(message, code = 'error') { super(message); this.code = code; }
}

/** Gera texto. `backend` vem de detectBackend(); `settings` de store.getSettings(). */
export async function generate(req, backend, settings) {
  const body = { task: req.task, system: req.system, messages: req.messages, maxTokens: req.maxTokens, temperature: req.temperature };
  const hasKey = !!settings.apiKey;
  let provider = settings.provider || 'auto';

  if (backend.mode === 'direct') {
    if (!hasKey) throw new GenError('Este site não tem servidor de IA. Abra Configurações e informe sua chave gratuita (Groq ou Gemini).', 'no_key');
    if (provider === 'auto' || PROVIDERS[provider]?.serverOnly) provider = 'groq';
    try {
      const r = await callProvider({ provider, apiKey: settings.apiKey, model: settings.model || undefined, ...body });
      return r.text;
    } catch (e) {
      if (e instanceof ProviderError) throw new GenError(e.message, e.code);
      throw new GenError(`Falha de rede ao chamar o provedor: ${e?.message || e}`, 'network');
    }
  }

  const headers = { 'content-type': 'application/json' };
  if (settings.accessCode) headers['x-access-code'] = settings.accessCode;
  if (hasKey) { headers['x-user-api-key'] = settings.apiKey; if (provider === 'auto' || PROVIDERS[provider]?.serverOnly) provider = 'groq'; }
  body.provider = provider;
  if (settings.model) body.model = settings.model;

  let res;
  try {
    res = await fetch(`${apiBase()}/api/generate`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) { throw new GenError('Sem conexão com o servidor. Verifique sua internet e tente de novo.', 'network'); }
  let data = null;
  try { data = await res.json(); } catch { /* corpo não-JSON */ }
  if (!res.ok) throw new GenError(data?.error?.message || `Erro do servidor (${res.status}).`, data?.error?.code || 'error');
  if (!data?.text) throw new GenError('O servidor respondeu sem texto.', 'empty');
  return data.text;
}

/** Gera e faz parse de JSON; tenta uma vez mais pedindo JSON estrito se o modelo se desviar. */
export async function generateJson(req, backend, settings) {
  const raw = await generate(req, backend, settings);
  try { return extractJson(raw); } catch (first) {
    const retry = {
      ...req,
      messages: [...req.messages, { role: 'assistant', content: raw.slice(0, 6000) }, { role: 'user', content: 'Sua resposta não era JSON válido. Responda novamente SOMENTE com o JSON, sem texto antes ou depois e sem crases.' }],
    };
    const raw2 = await generate(retry, backend, settings);
    try { return extractJson(raw2); } catch { throw new GenError(`O modelo não devolveu um JSON válido (${first.message}). Tente novamente ou troque de provedor/modelo.`, 'bad_json'); }
  }
}
