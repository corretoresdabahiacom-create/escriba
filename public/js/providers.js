// Camada de provedores de LLM — compartilhada entre o Worker (servidor) e o navegador (modo direto/BYOK).
// Somente `fetch`, sem SDKs. Modelos padrão são apenas sugestões: planos gratuitos mudam com frequência,
// então todo modelo pode ser sobrescrito (variável de ambiente no Worker ou campo "modelo" na interface).

export class ProviderError extends Error {
  constructor(message, { status = 502, code = 'provider_error', provider = '', retryable = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
    this.provider = provider;
    this.retryable = retryable;
  }
}

export const PROVIDERS = {
  groq: {
    label: 'Groq',
    defaultModel: 'llama-3.3-70b-versatile',
    keyUrl: 'https://console.groq.com/keys',
    note: 'Plano gratuito sem cartão. Rápido e com cota diária generosa.',
    envKey: 'GROQ_API_KEY', envModel: 'GROQ_MODEL',
  },
  gemini: {
    label: 'Google Gemini',
    defaultModel: 'gemini-flash-latest',
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Plano gratuito sem cartão (só conta Google). Cota diária costuma ser pequena.',
    envKey: 'GEMINI_API_KEY', envModel: 'GEMINI_MODEL',
  },
  openrouter: {
    label: 'OpenRouter',
    defaultModel: 'openrouter/free',
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Modelos gratuitos variados (limite diário baixo sem recarga).',
    envKey: 'OPENROUTER_API_KEY', envModel: 'OPENROUTER_MODEL',
  },
  anthropic: {
    label: 'Anthropic (Claude)',
    defaultModel: 'claude-sonnet-5-5',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Pago. Melhor qualidade de texto em português.',
    envKey: 'ANTHROPIC_API_KEY', envModel: 'ANTHROPIC_MODEL',
  },
  workersai: {
    label: 'Cloudflare Workers AI',
    defaultModel: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    serverOnly: true,
    note: 'Sem chave: usa a cota gratuita da própria conta Cloudflare (10 mil neurons/dia).',
    envModel: 'WORKERS_AI_MODEL',
  },
  mock: {
    label: 'Mock (testes)',
    defaultModel: 'mock-1',
    serverOnly: true,
    note: 'Respostas determinísticas, só para desenvolvimento e testes.',
  },
};

export const DEFAULT_ORDER = ['groq', 'gemini', 'openrouter', 'workersai', 'anthropic'];

function classify(status, bodyText, provider) {
  const quota = status === 429 || /quota|rate.?limit|exceeded|RESOURCE_EXHAUSTED|too many/i.test(bodyText);
  if (status === 401 || status === 403) return new ProviderError(`${PROVIDERS[provider]?.label || provider}: chave inválida ou sem permissão.`, { status: 401, code: 'bad_key', provider });
  if (quota) return new ProviderError(`${PROVIDERS[provider]?.label || provider}: limite de uso atingido. Aguarde um pouco ou troque de provedor.`, { status: 429, code: 'quota', provider, retryable: true });
  if (status === 404) return new ProviderError(`${PROVIDERS[provider]?.label || provider}: modelo não encontrado. Ajuste o campo “modelo”.`, { status: 400, code: 'bad_model', provider });
  if (status >= 500) return new ProviderError(`${PROVIDERS[provider]?.label || provider}: serviço indisponível (${status}).`, { status: 502, code: 'upstream', provider, retryable: true });
  let detail = bodyText.slice(0, 240);
  try { const j = JSON.parse(bodyText); detail = j?.error?.message || j?.message || detail; } catch { /* mantém texto */ }
  return new ProviderError(`${PROVIDERS[provider]?.label || provider} (${status}): ${detail}`, { status: 502, code: 'upstream', provider });
}

async function postJson(url, headers, body, provider, fetchImpl, timeoutMs = 120000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    clearTimeout(timer);
    const aborted = e?.name === 'AbortError';
    throw new ProviderError(aborted ? `${PROVIDERS[provider]?.label}: tempo esgotado.` : `${PROVIDERS[provider]?.label}: falha de rede (${e?.message || e}).`, { status: 504, code: aborted ? 'timeout' : 'network', provider, retryable: true });
  }
  clearTimeout(timer);
  const text = await res.text();
  if (!res.ok) throw classify(res.status, text, provider);
  try { return JSON.parse(text); } catch { throw new ProviderError(`${PROVIDERS[provider]?.label}: resposta não é JSON.`, { provider }); }
}

const noText = (provider, data) =>
  new ProviderError(`${PROVIDERS[provider]?.label}: o modelo respondeu sem texto. ${JSON.stringify(data).slice(0, 160)}`, { provider, code: 'empty', retryable: true });

/**
 * @param {object} p
 * @param {'groq'|'gemini'|'openrouter'|'anthropic'|'workersai'|'mock'} p.provider
 * @param {string} [p.model]
 * @param {string} [p.apiKey]
 * @param {string} p.system
 * @param {{role:'user'|'assistant',content:string}[]} p.messages
 * @param {number} [p.maxTokens]
 * @param {number} [p.temperature]
 * @param {object} [p.env]        Worker env (para o binding AI e variáveis)
 * @param {typeof fetch} [p.fetchImpl]
 * @returns {Promise<{text:string, model:string, provider:string}>}
 */
export async function callProvider({ provider, model, apiKey, system, messages, maxTokens = 1500, temperature = 0.7, env = {}, fetchImpl = globalThis.fetch?.bind(globalThis), task = '' }) {
  const meta = PROVIDERS[provider];
  if (!meta) throw new ProviderError(`Provedor desconhecido: ${provider}`, { status: 400, code: 'bad_provider' });
  const mdl = model || (meta.envModel && env[meta.envModel]) || meta.defaultModel;

  if (provider === 'mock') {
    const { mockGenerate } = await import('./mock.js');
    return { text: mockGenerate({ task, system, messages, maxTokens }), model: mdl, provider };
  }

  if (provider === 'workersai') {
    if (!env.AI) throw new ProviderError('Workers AI não está configurado neste servidor (binding AI ausente).', { status: 503, code: 'not_configured', provider });
    try {
      const out = await env.AI.run(mdl, {
        messages: [{ role: 'system', content: system }, ...messages],
        max_tokens: maxTokens,
        temperature,
      });
      // formatos: {response:string} | {choices:[{message:{content}}]}
      const text = (out?.response ?? out?.choices?.[0]?.message?.content ?? '').toString().trim();
      if (!text) throw noText(provider, out);
      return { text, model: mdl, provider };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      const msg = String(e?.message || e);
      if (/neurons|quota|limit|3036|4006/i.test(msg)) throw new ProviderError('Workers AI: cota diária gratuita esgotada (renova às 00:00 UTC).', { status: 429, code: 'quota', provider, retryable: true });
      throw new ProviderError(`Workers AI: ${msg.slice(0, 200)}`, { provider, retryable: true });
    }
  }

  if (!apiKey) throw new ProviderError(`${meta.label}: chave de API ausente.`, { status: 401, code: 'no_key', provider });

  if (provider === 'groq' || provider === 'openrouter') {
    const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
    const headers = { authorization: `Bearer ${apiKey}` };
    if (provider === 'openrouter') { headers['x-title'] = 'Escriba'; }
    const data = await postJson(url, headers, {
      model: mdl, temperature, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }, provider, fetchImpl);
    const text = (data?.choices?.[0]?.message?.content ?? '').trim();
    if (!text) throw noText(provider, data);
    return { text, model: data?.model || mdl, provider };
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(mdl)}:generateContent`;
    const data = await postJson(url, { 'x-goog-api-key': apiKey }, {
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      // margem extra: modelos Gemini com "thinking" gastam parte do orçamento de saída pensando
      generationConfig: { temperature, maxOutputTokens: Math.round(maxTokens * 1.8) },
    }, provider, fetchImpl);
    const cand = data?.candidates?.[0];
    const text = (cand?.content?.parts || []).map((p) => p.text || '').join('').trim();
    if (!text) {
      if (data?.promptFeedback?.blockReason || cand?.finishReason === 'SAFETY') throw new ProviderError('Gemini bloqueou a resposta por política de conteúdo. Reformule o tema.', { status: 422, code: 'blocked', provider });
      throw noText(provider, data);
    }
    return { text, model: mdl, provider };
  }

  if (provider === 'anthropic') {
    const data = await postJson('https://api.anthropic.com/v1/messages', {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true', // necessário apenas no modo direto (navegador)
    }, { model: mdl, max_tokens: maxTokens, temperature: Math.min(temperature, 1), system, messages }, provider, fetchImpl);
    const text = (data?.content || []).map((b) => b.text || '').join('\n').trim();
    if (!text) throw noText(provider, data);
    return { text, model: mdl, provider };
  }

  throw new ProviderError(`Provedor não suportado: ${provider}`, { status: 400, code: 'bad_provider' });
}
