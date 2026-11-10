// Persistência local (localStorage) — os livros ficam no navegador do autor, sem cadastro.
// Tudo envolto em try/catch: o storage pode estar bloqueado, cheio ou vazio (aba anônima).
import { clampStr } from './parse.js';
import { normalizeCover, DEFAULT_COVER } from './cover.js';

const PKEY = 'escriba.v1.projects';
const SKEY = 'escriba.v1.settings';
const AKEY = 'escriba.v1.apikey';

const mem = { projects: null, settings: null, apiKey: '' };

const read = (store, key) => { try { return store.getItem(key); } catch { return null; } };
const write = (store, key, v) => { try { store.setItem(key, v); return true; } catch { return false; } };

export const uid = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export const DEFAULT_BRIEF = { tema: '', publico: 'Empreendedores iniciantes', tom: 'Direto e prático', idioma: 'pt-BR', autor: '', tamanho: 'medio', numCapitulos: 8, observacoes: '' };

export function newProject(brief = {}) {
  const now = Date.now();
  return { id: uid(), createdAt: now, updatedAt: now, brief: { ...DEFAULT_BRIEF, ...brief }, title: '', subtitle: '', chapters: [], cover: { ...DEFAULT_COVER }, kdp: null, sales: null, step: 'brief' };
}

export const newChapter = (title = '', summary = '') => ({ id: uid(), title, summary, text: '', resumo: '', prev: '' });

/** Sanitiza um projeto vindo do storage/backup (tipos, limites) — nunca confia no JSON importado. */
export function sanitizeProject(p) {
  if (!p || typeof p !== 'object') return null;
  const s = (v, n) => String(v ?? '').slice(0, n);
  const b = p.brief || {};
  return {
    id: s(p.id || uid(), 60),
    createdAt: Number(p.createdAt) || Date.now(),
    updatedAt: Number(p.updatedAt) || Date.now(),
    brief: {
      tema: s(b.tema, 500), publico: s(b.publico, 120) || DEFAULT_BRIEF.publico, tom: s(b.tom, 120) || DEFAULT_BRIEF.tom,
      idioma: ['pt-BR', 'en', 'es'].includes(b.idioma) ? b.idioma : 'pt-BR', autor: s(b.autor, 80),
      tamanho: ['curto', 'medio', 'longo'].includes(b.tamanho) ? b.tamanho : 'medio',
      numCapitulos: Math.min(20, Math.max(3, parseInt(b.numCapitulos, 10) || 8)), observacoes: s(b.observacoes, 800),
    },
    title: clampStr(p.title, 140), subtitle: clampStr(p.subtitle, 200),
    chapters: (Array.isArray(p.chapters) ? p.chapters : []).slice(0, 30).map((c) => ({
      id: s(c?.id || uid(), 60), title: clampStr(c?.title, 140, 'Capítulo'), summary: clampStr(c?.summary, 500),
      text: s(c?.text, 60000), resumo: s(c?.resumo, 600), prev: s(c?.prev, 60000),
    })),
    cover: normalizeCover(p.cover),
    kdp: p.kdp && typeof p.kdp === 'object' ? p.kdp : null,
    sales: p.sales && typeof p.sales === 'object' ? p.sales : null,
    step: ['brief', 'outline', 'chapters', 'cover', 'sell', 'export'].includes(p.step) ? p.step : 'brief',
  };
}

function loadAll() {
  if (mem.projects) return mem.projects;
  let list = [];
  try { const raw = read(localStorage, PKEY); if (raw) list = JSON.parse(raw); } catch { list = []; }
  mem.projects = (Array.isArray(list) ? list : []).map(sanitizeProject).filter(Boolean);
  return mem.projects;
}
function persist() {
  const ok = write(localStorage, PKEY, JSON.stringify(mem.projects));
  return ok;
}

export const listProjects = () => [...loadAll()].sort((a, b) => b.updatedAt - a.updatedAt);
export const getProject = (id) => loadAll().find((p) => p.id === id) || null;

/** @returns {boolean} false se não foi possível gravar (storage cheio/bloqueado) */
export function saveProject(p) {
  const all = loadAll();
  p.updatedAt = Date.now();
  const i = all.findIndex((x) => x.id === p.id);
  if (i >= 0) all[i] = p; else all.push(p);
  return persist();
}
export function deleteProject(id) { mem.projects = loadAll().filter((p) => p.id !== id); persist(); }

export function exportBackup() {
  return JSON.stringify({ app: 'escriba', version: 1, exportedAt: new Date().toISOString(), projects: loadAll() }, null, 1);
}
/** Importa backup (ou um único projeto). Retorna quantidade importada. */
export function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Arquivo inválido: não é JSON.'); }
  const arr = Array.isArray(data?.projects) ? data.projects : data?.brief ? [data] : null;
  if (!arr) throw new Error('Arquivo não parece ser um backup do Escriba.');
  let n = 0;
  for (const raw of arr) {
    const p = sanitizeProject(raw); if (!p) continue;
    const all = loadAll();
    if (all.some((x) => x.id === p.id)) p.id = uid(); // nunca sobrescreve
    all.push(p); n++;
  }
  persist();
  return n;
}

// ── Configurações (provedor, modelo, chave própria)
export const DEFAULT_SETTINGS = { provider: 'auto', model: '', accessCode: '', rememberKey: false };
export function getSettings() {
  if (!mem.settings) {
    let s = {}; try { s = JSON.parse(read(localStorage, SKEY) || '{}'); } catch { /* usa padrão */ }
    mem.settings = { ...DEFAULT_SETTINGS, ...s };
  }
  const apiKey = read(sessionStorage, AKEY) || read(localStorage, AKEY) || mem.apiKey || '';
  return { ...mem.settings, apiKey };
}
export function saveSettings({ apiKey, ...rest }) {
  mem.settings = { ...DEFAULT_SETTINGS, ...rest };
  write(localStorage, SKEY, JSON.stringify(mem.settings));
  mem.apiKey = apiKey || '';
  try { sessionStorage.removeItem(AKEY); localStorage.removeItem(AKEY); } catch { /* ok */ }
  if (apiKey) write(rest.rememberKey ? localStorage : sessionStorage, AKEY, apiKey); // por padrão só na sessão
}

export const projectStats = (p) => {
  const words = p.chapters.reduce((n, c) => n + (c.text.match(/\S+/g) || []).length, 0);
  const done = p.chapters.filter((c) => c.text.trim()).length;
  return { words, done, total: p.chapters.length };
};
