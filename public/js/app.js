// Estúdio Escriba — controlador da interface (vanilla JS, sem build).
import { escXml as esc, parseBlocks, blocksToHtml, countWords } from './md.js';
import { splitChapterAndSummary, cleanChapterText, normalizeOutline, clampStr } from './parse.js';
import { outlinePrompt, chapterPrompt, rewritePrompt, coverPrompt, kdpPrompt, salesPrompt, LANGUAGES, SIZES, TONES, AUDIENCES } from './prompts.js';
import { detectBackend, generate, generateJson, BYOK_PROVIDERS } from './api.js';
import * as store from './store.js';
import { TEMPLATES, MOTIF_LABELS, normalizeCover, renderCoverCanvas, coverToPng, contrast } from './cover.js';
import { buildEpub } from './export/epub.js';
import { buildDocx } from './export/docx.js';
import { buildPdf } from './export/pdf.js';
import { buildMarkdown, buildHtml } from './export/misc.js';
import { slugify } from './export/common.js';
import { PROVIDERS } from './providers.js';

const STEPS = [['brief', 'Briefing'], ['outline', 'Estrutura'], ['chapters', 'Capítulos'], ['cover', 'Capa'], ['sell', 'Publicação'], ['export', 'Exportar']];
const REWRITES = ['Deixe mais curto e direto', 'Adicione mais exemplos práticos', 'Simplifique a linguagem', 'Aprofunde com mais detalhes', 'Deixe o tom mais acolhedor', 'Adicione uma lista de passos acionáveis'];
const KDP = { titleMax: 200, keywords: 7, keywordMax: 50, descMax: 4000 };

const S = {
  backend: { mode: 'direct', providers: [], needsAccessCode: false },
  project: null, view: 'projects', sel: 0, preview: false,
  busy: '', cancel: false, err: '', saveWarned: false,
};
const $ = (s, r = document) => r.querySelector(s);
const root = $('#app');

// ───────────── utilidades ─────────────
function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), isErr ? 9000 : 4500);
}
let saveTimer;
function save(now = false) {
  if (!S.project) return;
  const go = () => {
    if (!store.saveProject(S.project) && !S.saveWarned) {
      S.saveWarned = true;
      toast('Não foi possível salvar no navegador (armazenamento cheio ou bloqueado). Baixe um backup em “Meus livros”.', true);
    }
  };
  clearTimeout(saveTimer);
  if (now) go(); else saveTimer = setTimeout(go, 400);
}
function download(name, data, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const setPath = (obj, path, val) => { const k = path.split('.'); let o = obj; while (k.length > 1) o = o[k.shift()]; o[k[0]] = val; };
const fmt = (n) => n.toLocaleString('pt-BR');
const dateStr = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const needsSetup = () => { const s = store.getSettings(); return !s.apiKey && (S.backend.mode === 'direct' || !S.backend.providers.length); };

function confirmDlg(message, okLabel = 'Confirmar') {
  return new Promise((resolve) => {
    const dlg = $('#dlg');
    dlg.innerHTML = `<h2 id="dlgTitle">Confirmar</h2><p class="muted" style="margin-bottom:20px">${esc(message)}</p>
      <div class="btn-row" style="justify-content:flex-end"><button class="btn-ghost sm" data-v="0" type="button">Cancelar</button><button class="btn sm" data-v="1" type="button">${esc(okLabel)}</button></div>`;
    const done = (v) => { dlg.close(); resolve(v); };
    dlg.onclick = (e) => { const b = e.target.closest('[data-v]'); if (b) done(b.dataset.v === '1'); };
    dlg.oncancel = () => resolve(false);
    dlg.showModal();
  });
}

const cur = () => S.project;
const coverFor = (p) => normalizeCover({ ...p.cover, title: p.cover.title || p.title, subtitle: p.cover.subtitle || p.subtitle, author: p.cover.author || p.brief.autor });
const bookFor = (p) => ({ title: p.title || 'Sem título', subtitle: p.subtitle, author: p.brief.autor, language: p.brief.idioma, chapters: p.chapters.map((c) => ({ title: c.title, text: c.text })) });

async function ai(req) { return generate(req, S.backend, store.getSettings()); }
async function aiJson(req) { return generateJson(req, S.backend, store.getSettings()); }

/** Executa uma tarefa assíncrona mostrando estado ocupado e tratando erro de forma uniforme. */
async function run(label, fn) {
  if (S.busy) return;
  S.busy = label; S.err = ''; render();
  try { await fn(); }
  catch (e) {
    S.err = e?.message || String(e);
    if (e?.code === 'no_key' || e?.code === 'not_configured') S.err += ' → abra “Configurações de IA”.';
    toast(S.err, true);
  } finally { S.busy = ''; S.cancel = false; render(); }
}

// ───────────── templates de tela ─────────────
const spinner = (t) => `<span class="spin" aria-hidden="true"></span>${esc(t)}`;
const btnAI = (act, label, extra = '', cls = 'btn') => `<button type="button" class="${cls}" data-act="${act}" ${extra} ${S.busy ? 'disabled' : ''}>${S.busy && extra.includes('data-main') ? spinner(S.busy) : esc(label)}</button>`;
const errBox = () => (S.err ? `<div class="err" role="alert">${esc(S.err)}</div>` : '');
const setupBanner = () => needsSetup() ? `<div class="banner" role="note"><strong>Falta conectar uma IA.</strong> ${S.backend.mode === 'direct' ? 'Este site não tem servidor de IA próprio.' : 'O servidor não tem provedor configurado.'} Crie uma chave gratuita (Groq ou Gemini, sem cartão) e cole nas configurações. <button type="button" class="btn-primary sm" data-act="settings">Configurar IA</button></div>` : '';

function viewProjects() {
  const list = store.listProjects();
  return `<main class="main" style="grid-column:1/-1"><h1>Meus livros</h1>
  <p class="lead">Seus ebooks ficam salvos neste navegador, sem cadastro. Faça backup de vez em quando.</p>
  ${setupBanner()}
  <div class="btn-row"><button class="btn-primary" type="button" data-act="newProject">Novo ebook</button>
  <button class="btn-ghost" type="button" data-act="importPick">Importar backup</button>
  <button class="btn-ghost" type="button" data-act="backupAll" ${list.length ? '' : 'disabled'}>Baixar backup de tudo</button>
  <input type="file" id="importFile" accept="application/json,.json" hidden></div>
  ${list.length ? `<div class="proj-grid">${list.map((p) => { const st = store.projectStats(p); const pct = st.total ? Math.round((st.done / st.total) * 100) : 0; return `
    <article class="proj-card"><h3>${esc(p.title || p.brief.tema || 'Sem título')}</h3>
    <div class="meta">${esc(LANGUAGES[p.brief.idioma]?.label || '')} · atualizado em ${esc(dateStr(p.updatedAt))}</div>
    <div class="bar-prog" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <div class="meta">${st.done}/${st.total} capítulos · ${fmt(st.words)} palavras</div>
    <div class="acts"><button class="btn-primary sm" type="button" data-act="open" data-id="${esc(p.id)}">Abrir</button>
    <button class="btn-danger sm" type="button" data-act="del" data-id="${esc(p.id)}">Excluir</button></div></article>`; }).join('')}</div>`
    : '<div class="empty" style="margin-top:24px">Nenhum livro ainda. Clique em “Novo ebook” para começar.</div>'}</main>`;
}

function viewBrief(p) {
  const b = p.brief;
  const opt = (arr, v) => (arr.includes(v) ? arr : [v, ...arr]).map((x) => `<option ${x === v ? 'selected' : ''}>${esc(x)}</option>`).join('');
  return `<h1>Briefing</h1><p class="lead">Quanto mais específico o tema e o público, melhor o livro. Isso orienta todas as etapas.</p>
  ${setupBanner()}
  <div class="card"><div class="grid-2"><div>
    <label for="f-tema">Sobre o que é o seu ebook?</label>
    <textarea id="f-tema" rows="3" data-bind="brief.tema" placeholder="Ex.: como organizar as finanças de um consultório odontológico">${esc(b.tema)}</textarea>
    <div class="field-row"><div><label for="f-publico">Público-alvo</label><input type="text" id="f-publico" list="aud" data-bind="brief.publico" value="${esc(b.publico)}"><datalist id="aud">${AUDIENCES.map((a) => `<option value="${esc(a)}">`).join('')}</datalist></div>
    <div><label for="f-tom">Tom de voz</label><select id="f-tom" data-bind="brief.tom">${opt(TONES, b.tom)}</select></div></div>
    <label for="f-obs">Observações (opcional)</label>
    <textarea id="f-obs" rows="3" data-bind="brief.observacoes" placeholder="Ex.: incluir exercícios no fim de cada capítulo; evitar jargão">${esc(b.observacoes)}</textarea>
  </div><div>
    <div class="field-row"><div><label for="f-idioma">Idioma do livro</label><select id="f-idioma" data-bind="brief.idioma">${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}" ${k === b.idioma ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></div>
    <div><label for="f-n">Nº de capítulos</label><input type="number" id="f-n" min="3" max="20" data-bind="brief.numCapitulos" data-num="1" value="${b.numCapitulos}"></div></div>
    <label for="f-tam">Tamanho dos capítulos</label>
    <select id="f-tam" data-bind="brief.tamanho">${Object.entries(SIZES).map(([k, v]) => `<option value="${k}" ${k === b.tamanho ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
    <label for="f-autor">Nome do autor (capa e metadados)</label>
    <input type="text" id="f-autor" data-bind="brief.autor" value="${esc(b.autor)}" placeholder="Como você quer assinar o livro">
    <p class="hint">Estimativa: ${b.numCapitulos} capítulos × ~${SIZES[b.tamanho].words} palavras ≈ ${fmt(b.numCapitulos * SIZES[b.tamanho].words)} palavras. Cada capítulo usa 1 requisição de IA.</p>
  </div></div>
  <div class="btn-row">${btnAI('genOutline', 'Gerar estrutura com IA', 'data-main="1"', 'btn-primary')}
  <button type="button" class="btn-ghost" data-act="manualOutline" ${S.busy ? 'disabled' : ''}>Montar a estrutura manualmente</button></div>${errBox()}</div>`;
}

function viewOutline(p) {
  if (!p.chapters.length) return `<h1>Estrutura</h1><p class="lead">Ainda não há estrutura.</p><div class="btn-row"><button class="btn-primary" type="button" data-act="goto" data-v="brief">Voltar ao briefing</button><button class="btn-ghost" type="button" data-act="addCh">Adicionar capítulo</button></div>`;
  return `<h1>Estrutura</h1><p class="lead">Edite títulos e planos, reordene, remova ou adicione capítulos. Só depois de aprovar você escreve o texto.</p>
  <div class="card"><label for="o-title">Título do livro</label><input type="text" id="o-title" data-bind="title" value="${esc(p.title)}">
  <label for="o-sub">Subtítulo</label><input type="text" id="o-sub" data-bind="subtitle" value="${esc(p.subtitle)}" style="margin-bottom:0"></div>
  <div class="card"><h2>Capítulos (${p.chapters.length})</h2>
  ${p.chapters.map((c, i) => `<div class="ol-item"><div class="n">${i + 1}</div><div>
    <label class="sr-only" for="oc-t${i}">Título do capítulo ${i + 1}</label><input type="text" id="oc-t${i}" data-ch="title" data-i="${i}" value="${esc(c.title)}">
    <label class="sr-only" for="oc-s${i}">Plano do capítulo ${i + 1}</label><textarea id="oc-s${i}" rows="2" data-ch="summary" data-i="${i}" placeholder="O que este capítulo cobre">${esc(c.summary)}</textarea></div>
    <div class="mv"><button class="icon-btn" type="button" data-act="up" data-i="${i}" aria-label="Mover capítulo ${i + 1} para cima" ${i === 0 ? 'disabled' : ''}>↑</button>
    <button class="icon-btn" type="button" data-act="down" data-i="${i}" aria-label="Mover capítulo ${i + 1} para baixo" ${i === p.chapters.length - 1 ? 'disabled' : ''}>↓</button>
    <button class="icon-btn" type="button" data-act="rmCh" data-i="${i}" aria-label="Remover capítulo ${i + 1}">✕</button></div></div>`).join('')}
  <div class="btn-row" style="margin-top:12px"><button class="btn-ghost sm" type="button" data-act="addCh">+ Adicionar capítulo</button>
  <button class="btn-ghost sm" type="button" data-act="regenOutline" ${S.busy ? 'disabled' : ''}>${S.busy && S.busy.includes('estrutura') ? spinner(S.busy) : 'Gerar outra estrutura'}</button></div></div>
  ${errBox()}<div class="btn-row"><button class="btn-primary" type="button" data-act="approve">Aprovar e escrever capítulos →</button></div>`;
}

function viewChapters(p) {
  if (!p.chapters.length) return `<h1>Capítulos</h1><p class="lead">Crie a estrutura primeiro.</p><button class="btn-primary" type="button" data-act="goto" data-v="outline">Ir para Estrutura</button>`;
  S.sel = Math.min(S.sel, p.chapters.length - 1);
  const c = p.chapters[S.sel];
  const pending = p.chapters.filter((x) => !x.text.trim()).length;
  const st = store.projectStats(p);
  const busyGen = S.busy && S.busy.startsWith('Escrevendo');
  return `<h1>Capítulos</h1><p class="lead">${st.done}/${st.total} escritos · ${fmt(st.words)} palavras. Escreva com IA, edite à mão e reescreva com instruções.</p>${setupBanner()}
  <div class="toolbar">${busyGen ? `<button class="btn-ghost sm" type="button" data-act="cancel">Parar após este capítulo</button><span class="small">${spinner(S.busy)}</span>` : `<button class="btn-primary sm" type="button" data-act="genAll" ${pending && !S.busy ? '' : 'disabled'}>Escrever os ${pending} pendentes</button>`}</div>
  <div class="ch-layout"><ul class="ch-list" aria-label="Capítulos">${p.chapters.map((x, i) => `<li><button type="button" data-act="sel" data-i="${i}" ${i === S.sel ? 'aria-current="true"' : ''}><span class="t">${i + 1}. ${esc(x.title)}</span><span class="badge ${x.text.trim() ? 'ok' : ''}">${x.text.trim() ? fmt(countWords(x.text)) + ' pal.' : 'vazio'}</span></button></li>`).join('')}</ul>
  <div><div class="card"><label for="c-title">Título do capítulo ${S.sel + 1}</label><input type="text" id="c-title" data-ch="title" data-i="${S.sel}" value="${esc(c.title)}">
  <div class="toolbar">${btnAI('genCh', c.text.trim() ? 'Gerar de novo' : 'Escrever com IA', `data-i="${S.sel}" ${busyGen ? 'data-main="1"' : ''}`, 'btn sm')}
  <button type="button" class="btn-ghost sm" data-act="preview">${S.preview ? 'Editar' : 'Pré-visualizar'}</button>
  <button type="button" class="btn-ghost sm" data-act="undo" data-i="${S.sel}" ${c.prev ? '' : 'disabled'}>Desfazer última geração</button>
  <span class="small" id="wc">${fmt(countWords(c.text))} palavras</span></div>
  ${S.preview ? `<div class="prose">${c.text.trim() ? `<h2 style="font-size:26px;margin-top:0">${esc(c.title)}</h2>` + blocksToHtml(parseBlocks(c.text)) : '<p class="ph">Capítulo vazio.</p>'}</div>`
    : `<label class="sr-only" for="c-text">Texto do capítulo</label><textarea id="c-text" class="editor" data-ch="text" data-i="${S.sel}" placeholder="O texto do capítulo aparece aqui. Você pode escrever à mão ou gerar com IA. Markdown: ## subtítulo, - lista, **negrito**.">${esc(c.text)}</textarea>`}
  ${c.text.trim() ? `<div style="margin-top:16px"><label for="rw">Reescrever com instrução</label><div class="field-row"><div style="flex:3"><input type="text" id="rw" list="rwl" placeholder="Ex.: deixe mais curto e direto" style="margin-bottom:0"><datalist id="rwl">${REWRITES.map((r) => `<option value="${esc(r)}">`).join('')}</datalist></div>
  <div style="flex:0 0 auto"><button type="button" class="btn sm" data-act="rewrite" data-i="${S.sel}" ${S.busy ? 'disabled' : ''} style="padding:12px 16px">${S.busy && S.busy.includes('Reescrevendo') ? spinner(S.busy) : 'Reescrever'}</button></div></div></div>` : ''}
  ${errBox()}</div></div></div>`;
}

function viewCover(p) {
  const cv = p.cover;
  const inputs = [['title', 'Título', p.title], ['subtitle', 'Subtítulo', p.subtitle], ['tagline', 'Frase de efeito (opcional)', ''], ['author', 'Autor', p.brief.autor]];
  const ratio = contrast(normalizeCover(cv).palette[0], normalizeCover(cv).palette[2]);
  return `<h1>Capa</h1><p class="lead">Capa tipográfica em alta resolução (1600×2560 px, a proporção recomendada pela Amazon KDP). Ela vai dentro do EPUB, PDF e DOCX.</p>${setupBanner()}
  <div class="grid-2"><div class="card"><div class="tpl" role="group" aria-label="Modelo">${Object.entries(TEMPLATES).map(([k, v]) => `<button type="button" data-act="tpl" data-v="${k}" aria-pressed="${cv.template === k}">${esc(v)}</button>`).join('')}</div>
  ${inputs.map(([k, l, ph]) => `<label for="cv-${k}">${l}</label><input type="text" id="cv-${k}" data-cover="${k}" value="${esc(cv[k])}" placeholder="${esc(ph)}">`).join('')}
  <div class="field-row">${['Fundo 1', 'Fundo 2', 'Destaque'].map((l, i) => `<div><label for="cv-p${i}">${l}</label><input type="color" id="cv-p${i}" data-cpal="${i}" value="${esc(normalizeCover(cv).palette[i])}"></div>`).join('')}</div>
  ${ratio < 2 ? '<p class="hint" style="color:var(--gold)">Pouco contraste entre fundo e destaque; o destaque pode ser substituído automaticamente.</p>' : ''}
  <label for="cv-motif">Motivo gráfico</label><select id="cv-motif" data-cover="motif">${Object.entries(MOTIF_LABELS).map(([k, v]) => `<option value="${k}" ${cv.motif === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
  <div class="btn-row">${btnAI('genCover', 'Sugerir conceito com IA', 'data-main="1"', 'btn sm')}<button type="button" class="btn-primary sm" data-act="dlCover">Baixar PNG</button></div>${errBox()}</div>
  <div><canvas id="coverCanvas" class="cover-prev" width="1600" height="2560" role="img" aria-label="Prévia da capa"></canvas></div></div>`;
}

function copyBox(label, text, cnt) {
  const over = cnt && cnt.max && text.length > cnt.max;
  return `<div class="copy-head"><span class="lbl">${esc(label)}</span><span><span class="cnt ${over ? 'bad' : ''}">${cnt ? `${text.length}/${cnt.max}` : ''}</span> <button type="button" class="btn-ghost sm" data-act="copy" data-t="${esc(text)}">Copiar</button></span></div><div class="copy-box">${esc(text)}</div>`;
}

function viewSell(p) {
  const k = p.kdp, s = p.sales;
  const kdpHtml = k ? `<div class="card"><h2>Títulos sugeridos</h2>${(k.titles || []).map((t, i) => `<div class="title-opt"><div><strong>${esc(t.title)}</strong><div class="small">${esc(t.subtitle)}</div></div><button class="btn-ghost sm" type="button" data-act="useTitle" data-i="${i}">Usar este</button></div>`).join('')}</div>
  <div class="card"><h2>Palavras-chave (${(k.keywords || []).length}/${KDP.keywords})</h2>${(k.keywords || []).map((w) => `<div class="title-opt"><span>${esc(w)}</span><span class="cnt ${w.length > KDP.keywordMax ? 'bad' : ''}">${w.length}/${KDP.keywordMax}</span></div>`).join('')}
  <h2 style="margin-top:20px">Categorias sugeridas</h2><ul style="margin-left:18px;color:var(--paper-dim)">${(k.categories || []).map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>
  <div class="card">${copyBox('Descrição (HTML simples aceito pela KDP)', k.description || '', { max: KDP.descMax })}</div>` : '';
  const salesHtml = s ? `<div class="card"><h2>Kit de venda</h2>${copyBox('Headline', s.headline || '')}${copyBox('Subheadline', s.subheadline || '')}${copyBox('Benefícios', (s.bullets || []).map((b) => `• ${b}`).join('\n'))}${copyBox('Para quem é', (s.forWhom || []).map((b) => `• ${b}`).join('\n'))}${copyBox('Perguntas frequentes', (s.faq || []).map((f) => `${f.q}\n${f.a}`).join('\n\n'))}${copyBox('Chamada para ação', s.cta || '')}${copyBox('Posts para redes sociais', (s.posts || []).join('\n\n— — —\n\n'))}</div>` : '';
  return `<h1>Publicação e venda</h1><p class="lead">Sugestões geradas a partir do seu tema e do conteúdo. <strong>Não usam dados de vendas reais</strong>: valide palavras-chave e categorias no painel da KDP antes de publicar.</p>${setupBanner()}
  <div class="btn-row" style="margin-bottom:20px">${btnAI('genKdp', k ? 'Gerar kit KDP de novo' : 'Gerar kit KDP', 'data-main="1"', 'btn')}${btnAI('genSales', s ? 'Gerar kit de venda de novo' : 'Gerar kit de venda', '', 'btn-ghost')}</div>${errBox()}
  ${kdpHtml}${salesHtml}${!k && !s ? '<div class="empty">Gere o kit KDP e o kit de venda para ver títulos, palavras-chave, descrição e textos de divulgação.</div>' : ''}`;
}

function checklist(p) {
  const st = store.projectStats(p), k = p.kdp;
  const items = [
    [st.total > 0 && st.done === st.total ? 'ok' : st.done ? 'warn' : 'no', `Capítulos escritos: ${st.done}/${st.total}${st.done < st.total ? ' (capítulos vazios ficam de fora dos arquivos)' : ''}`],
    [st.words >= 5000 ? 'ok' : 'warn', `Extensão: ${fmt(st.words)} palavras${st.words < 5000 ? ' (considere aprofundar o conteúdo se o tema permitir)' : ''}`],
    [p.title.trim() ? (p.title.length + (p.subtitle ? p.subtitle.length : 0) <= KDP.titleMax ? 'ok' : 'warn') : 'no', p.title.trim() ? `Título e subtítulo: ${p.title.length + (p.subtitle || '').length}/${KDP.titleMax} caracteres` : 'Defina o título na etapa Estrutura'],
    [p.brief.autor.trim() ? 'ok' : 'warn', p.brief.autor.trim() ? `Autor: ${p.brief.autor}` : 'Informe o nome do autor no briefing'],
    [p.cover.title || p.title ? 'ok' : 'warn', 'Capa definida (confira a etapa Capa)'],
    [k ? ((k.keywords || []).length === KDP.keywords && (k.keywords || []).every((w) => w.length <= KDP.keywordMax) && (k.description || '').length <= KDP.descMax ? 'ok' : 'warn') : 'warn', k ? 'Kit KDP gerado (palavras-chave e descrição dentro dos limites)' : 'Kit KDP ainda não gerado (opcional)'],
    ['warn', 'Revise o texto: fatos, números e nomes gerados por IA. A KDP pede que você informe se o conteúdo foi gerado por IA ao publicar.'],
  ];
  return `<ul class="checklist">${items.map(([s, t]) => `<li class="${s}"><span class="ic" aria-hidden="true">${s === 'ok' ? '✓' : s === 'no' ? '✕' : '!'}</span><span>${esc(t)}</span></li>`).join('')}</ul>`;
}

function viewExport(p) {
  const f = (act, title, desc, primary) => `<div class="exp"><h3>${title}</h3><p>${desc}</p><button type="button" class="${primary ? 'btn-primary' : 'btn-ghost'} sm" data-act="${act}" ${S.busy ? 'disabled' : ''}>${S.busy && S.busy.includes(title) ? spinner(S.busy) : 'Baixar'}</button></div>`;
  return `<h1>Exportar</h1><p class="lead">Arquivos reais, gerados no seu navegador. Para a Amazon KDP, envie o <strong>EPUB</strong>.</p>
  <div class="card"><h2>Prontidão para publicar</h2>${checklist(p)}</div>
  <div class="export-grid">${f('exEpub', 'EPUB', 'Livro digital reflowable (EPUB 3) com capa e sumário. Formato aceito pela KDP, Kobo e Apple Books.', true)}
  ${f('exPdf', 'PDF', 'Formato 6×9" com capa, sumário com páginas e numeração.', false)}
  ${f('exDocx', 'DOCX', 'Para editar no Word/Google Docs ou levar a um diagramador.', false)}
  ${f('exHtml', 'HTML', 'Página única autocontida, boa para leitura e impressão.', false)}
  ${f('exMd', 'Markdown', 'Texto puro portável, para outros editores.', false)}
  ${f('exJson', 'Backup (JSON)', 'Projeto completo para importar depois, em qualquer navegador.', false)}</div>${errBox()}`;
}

function sidebar(p) {
  const st = store.projectStats(p);
  const done = { brief: !!p.brief.tema.trim() && p.chapters.length > 0, outline: p.chapters.length > 0, chapters: st.total > 0 && st.done === st.total, cover: !!(p.cover.title || p.cover.template) && p.step !== 'brief' && p.chapters.length > 0, sell: !!p.kdp, export: false };
  return `<aside class="side"><ol class="stepper" aria-label="Etapas">${STEPS.map(([k, l], i) => `<li><button type="button" data-act="goto" data-v="${k}" class="${done[k] ? 'done' : ''}" ${S.view === k ? 'aria-current="step"' : ''}><span class="dot">${done[k] ? '✓' : String(i + 1).padStart(2, '0')}</span>${l}</button></li>`).join('')}</ol></aside>`;
}

function render() {
  const p = cur();
  $('#projName').textContent = p && S.view !== 'projects' ? (p.title || p.brief.tema || 'Novo ebook') : '';
  if (!p || S.view === 'projects') { root.innerHTML = viewProjects(); return; }
  const views = { brief: viewBrief, outline: viewOutline, chapters: viewChapters, cover: viewCover, sell: viewSell, export: viewExport };
  root.innerHTML = `${sidebar(p)}<main class="main">${(views[S.view] || viewBrief)(p)}</main>`;
  if (S.view === 'cover') drawCoverPreview();
}

let rafCover = 0;
function drawCoverPreview() {
  cancelAnimationFrame(rafCover);
  rafCover = requestAnimationFrame(() => { const c = $('#coverCanvas'); if (c && cur()) renderCoverCanvas(coverFor(cur()), c); });
}

// ───────────── ações ─────────────
const goto = (v) => { S.view = v; S.err = ''; if (cur() && v !== 'projects') { cur().step = v; save(); } render(); window.scrollTo({ top: 0 }); };

function applyOutline(p, o) {
  p.title = o.title; p.subtitle = o.subtitle;
  p.chapters = o.chapters.map((c) => store.newChapter(c.title, c.summary));
  p.kdp = null; p.sales = null;
  S.sel = 0;
}

async function genOutline(isRegen = false) {
  const p = cur();
  if (p.brief.tema.trim().length < 5) { S.err = 'Descreva o tema do ebook (mínimo de 5 caracteres).'; render(); return; }
  if (p.chapters.some((c) => c.text.trim()) && !(await confirmDlg('Gerar outra estrutura vai descartar os capítulos já escritos. Continuar?', 'Descartar e gerar'))) return;
  await run('Planejando a estrutura…', async () => {
    const o = normalizeOutline(await aiJson(outlinePrompt(p.brief)), { maxChapters: 20 });
    applyOutline(p, o); save(true);
    S.view = 'outline'; p.step = 'outline';
  });
}

async function genChapter(i, { silent = false } = {}) {
  const p = cur(), c = p.chapters[i];
  const req = chapterPrompt(p, i);
  const raw = await ai(req);
  const { text, summary } = splitChapterAndSummary(raw);
  const clean = cleanChapterText(text, c.title);
  if (countWords(clean) < 30) throw new Error('O modelo devolveu um texto curto demais. Tente novamente.');
  c.prev = c.text; c.text = clean;
  c.resumo = summary || clampStr(clean.slice(0, 280), 280);
  save(true);
  if (!silent) toast(`Capítulo ${i + 1} escrito (${fmt(countWords(clean))} palavras).`);
}

async function genAll() {
  const p = cur();
  const idx = p.chapters.map((c, i) => (c.text.trim() ? -1 : i)).filter((i) => i >= 0);
  await run('Escrevendo…', async () => {
    let n = 0;
    for (const i of idx) {
      if (S.cancel) { toast('Geração interrompida.'); break; }
      S.sel = i; S.busy = `Escrevendo capítulo ${i + 1} (${++n}/${idx.length})…`; render();
      await genChapter(i, { silent: true });
      await new Promise((r) => setTimeout(r, 400)); // respira entre requisições (cotas gratuitas)
    }
    if (!S.cancel) toast('Capítulos pendentes escritos.');
  });
}

async function rewrite(i) {
  const instr = ($('#rw')?.value || '').trim();
  if (instr.length < 4) { S.err = 'Escreva uma instrução (ex.: “deixe mais curto”).'; render(); return; }
  const p = cur(), c = p.chapters[i];
  await run('Reescrevendo…', async () => {
    const { text, summary } = splitChapterAndSummary(await ai(rewritePrompt(p, i, instr)));
    const clean = cleanChapterText(text, c.title);
    if (countWords(clean) < 30) throw new Error('O modelo devolveu um texto curto demais. Tente de novo.');
    c.prev = c.text; c.text = clean; if (summary) c.resumo = summary; save(true);
    toast('Capítulo reescrito. Use “Desfazer” para voltar à versão anterior.');
  });
}

const ACTIONS = {
  settings: () => openSettings(),
  newProject: () => { S.project = store.newProject(); store.saveProject(S.project); S.view = 'brief'; render(); },
  open: ({ id }) => { const p = store.getProject(id); if (!p) return; S.project = p; S.sel = 0; S.view = p.step === 'brief' && p.chapters.length ? 'outline' : p.step; render(); },
  del: async ({ id }) => { if (await confirmDlg('Excluir este livro permanentemente? Faça backup antes se precisar.', 'Excluir')) { store.deleteProject(id); if (S.project?.id === id) S.project = null; render(); } },
  importPick: () => $('#importFile').click(),
  backupAll: () => download(`escriba-backup-${new Date().toISOString().slice(0, 10)}.json`, store.exportBackup(), 'application/json'),
  goto: ({ v }) => goto(v),
  genOutline: () => genOutline(),
  regenOutline: () => genOutline(true),
  manualOutline: () => { const p = cur(); if (p.brief.tema.trim().length < 3) { S.err = 'Informe ao menos o tema.'; render(); return; } if (!p.chapters.length) { p.title = p.title || p.brief.tema.slice(0, 80); p.chapters = [store.newChapter('Introdução', '')]; } save(true); goto('outline'); },
  addCh: () => { cur().chapters.push(store.newChapter(`Capítulo ${cur().chapters.length + 1}`, '')); save(); S.view = 'outline'; render(); },
  rmCh: async ({ i }) => { const p = cur(), c = p.chapters[+i]; if (c.text.trim() && !(await confirmDlg(`O capítulo “${c.title}” tem texto escrito. Remover mesmo assim?`, 'Remover'))) return; p.chapters.splice(+i, 1); save(); render(); },
  up: ({ i }) => { const a = cur().chapters, k = +i; if (k > 0) { [a[k - 1], a[k]] = [a[k], a[k - 1]]; save(); render(); } },
  down: ({ i }) => { const a = cur().chapters, k = +i; if (k < a.length - 1) { [a[k + 1], a[k]] = [a[k], a[k + 1]]; save(); render(); } },
  approve: () => { if (!cur().title.trim()) { S.err = 'Defina o título do livro.'; render(); return; } S.sel = 0; goto('chapters'); },
  sel: ({ i }) => { S.sel = +i; S.err = ''; render(); },
  preview: () => { S.preview = !S.preview; render(); },
  genCh: ({ i }) => run('Escrevendo…', () => genChapter(+i)),
  genAll: () => genAll(),
  cancel: () => { S.cancel = true; },
  rewrite: ({ i }) => rewrite(+i),
  undo: ({ i }) => { const c = cur().chapters[+i]; if (!c.prev) return; [c.text, c.prev] = [c.prev, c.text]; save(true); render(); toast('Versão anterior restaurada.'); },
  tpl: ({ v }) => { cur().cover.template = v; save(); render(); },
  genCover: () => run('Criando conceito…', async () => {
    const c = normalizeCover(await aiJson(coverPrompt(cur())));
    cur().cover = { ...c, author: cur().cover.author || cur().brief.autor, template: cur().cover.template }; save(true);
  }),
  dlCover: async () => { const png = await coverToPng(coverFor(cur())); download(`${slugify(cur().title)}-capa.png`, png, 'image/png'); },
  genKdp: () => run('Gerando kit KDP…', async () => {
    const j = await aiJson(kdpPrompt(cur()));
    const arr = (v, n, len) => (Array.isArray(v) ? v : []).map((x) => clampStr(typeof x === 'string' ? x : '', len)).filter(Boolean).slice(0, n);
    cur().kdp = {
      titles: (Array.isArray(j.titles) ? j.titles : []).slice(0, 5).map((t) => ({ title: clampStr(t?.title, 140), subtitle: clampStr(t?.subtitle, 200) })).filter((t) => t.title),
      keywords: arr(j.keywords, 7, 80), categories: arr(j.categories, 3, 120),
      description: String(j.description || '').replace(/<(?!\/?(p|b|i|br|ul|li|em|strong)\b)[^>]*>/gi, '').slice(0, 6000),
    };
    save(true);
  }),
  genSales: () => run('Gerando kit de venda…', async () => {
    const j = await aiJson(salesPrompt(cur()));
    const arr = (v, n, len) => (Array.isArray(v) ? v : []).map((x) => clampStr(typeof x === 'string' ? x : '', len)).filter(Boolean).slice(0, n);
    cur().sales = {
      headline: clampStr(j.headline, 200), subheadline: clampStr(j.subheadline, 300), bullets: arr(j.bullets, 8, 240), forWhom: arr(j.forWhom, 5, 200),
      faq: (Array.isArray(j.faq) ? j.faq : []).slice(0, 5).map((f) => ({ q: clampStr(f?.q, 200), a: clampStr(f?.a, 500) })).filter((f) => f.q),
      cta: clampStr(j.cta, 120), posts: arr(j.posts, 5, 400),
    };
    save(true);
  }),
  useTitle: ({ i }) => { const t = cur().kdp?.titles?.[+i]; if (!t) return; cur().title = t.title; cur().subtitle = t.subtitle; save(true); render(); toast('Título aplicado ao livro.'); },
  copy: async ({ t }) => { try { await navigator.clipboard.writeText(t); toast('Copiado.'); } catch { toast('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.', true); } },
  exEpub: () => exportAs('EPUB'), exPdf: () => exportAs('PDF'), exDocx: () => exportAs('DOCX'), exHtml: () => exportAs('HTML'), exMd: () => exportAs('Markdown'),
  exJson: () => download(`${slugify(cur().title)}.escriba.json`, JSON.stringify({ app: 'escriba', version: 1, projects: [cur()] }, null, 1), 'application/json'),
};

async function exportAs(kind) {
  const p = cur();
  if (!p.chapters.some((c) => c.text.trim())) { S.err = 'Escreva ao menos um capítulo antes de exportar.'; render(); return; }
  await run(`Gerando ${kind}…`, async () => {
    const book = bookFor(p), base = slugify(p.title);
    const png = kind === 'Markdown' ? null : await coverToPng(coverFor(p));
    if (kind === 'EPUB') download(`${base}.epub`, buildEpub({ ...book, coverPng: png }), 'application/epub+zip');
    else if (kind === 'DOCX') download(`${base}.docx`, buildDocx({ ...book, coverPng: png }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    else if (kind === 'PDF') {
      const jsPDF = window.jspdf?.jsPDF; if (!jsPDF) throw new Error('Biblioteca de PDF não carregou. Recarregue a página.');
      download(`${base}.pdf`, buildPdf({ ...book, coverPng: png }, { jsPDF }), 'application/pdf');
    } else if (kind === 'HTML') {
      let url = ''; if (png) { let bin = ''; png.forEach((b) => { bin += String.fromCharCode(b); }); url = 'data:image/png;base64,' + btoa(bin); }
      download(`${base}.html`, buildHtml(book, { coverDataUrl: url }), 'text/html');
    } else download(`${base}.md`, buildMarkdown(book), 'text/markdown');
    toast(`${kind} gerado.`);
  });
}

// ───────────── configurações ─────────────
function openSettings() {
  const s = store.getSettings();
  const dlg = $('#dlg');
  const serverList = S.backend.providers.map((p) => `<li>${esc(p.label)} <span class="small">(${esc(p.model)})</span></li>`).join('');
  dlg.innerHTML = `<h2 id="dlgTitle">Configurações de IA</h2>
  <p class="small" style="margin-bottom:14px">${S.backend.mode === 'server'
    ? (S.backend.providers.length ? `Servidor com IA disponível:</p><ul class="small" style="margin:-6px 0 14px 18px">${serverList}</ul><p class="small" style="margin-bottom:14px">Você também pode usar sua própria chave.` : 'O servidor não tem provedor configurado. Use sua própria chave.')
    : 'Este site é estático (sem servidor de IA): informe sua chave. Ela é enviada direto ao provedor a partir do seu navegador.'}</p>
  <form id="setForm"><label for="s-prov">Provedor</label>
  <select id="s-prov">${S.backend.mode === 'server' && S.backend.providers.length ? `<option value="auto" ${s.provider === 'auto' ? 'selected' : ''}>Automático (servidor, com fallback)</option>` : ''}${BYOK_PROVIDERS.map((p) => `<option value="${p.id}" ${s.provider === p.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
  <p class="hint" id="s-note"></p>
  <label for="s-key">Sua chave de API (opcional se o servidor tiver IA)</label><input type="password" id="s-key" autocomplete="off" value="${esc(s.apiKey)}" placeholder="Cole aqui">
  <label class="check"><input type="checkbox" id="s-rem" ${s.rememberKey ? 'checked' : ''}> Lembrar a chave neste navegador (por padrão ela só dura enquanto a aba estiver aberta)</label>
  <label for="s-model">Modelo (opcional)</label><input type="text" id="s-model" value="${esc(s.model)}" placeholder="Deixe vazio para usar o padrão do provedor">
  ${S.backend.needsAccessCode ? `<label for="s-code">Código de acesso do servidor</label><input type="password" id="s-code" value="${esc(s.accessCode)}">` : ''}
  <div id="s-res" class="small" role="status" style="min-height:20px"></div>
  <div class="btn-row" style="justify-content:flex-end"><button type="button" class="btn-ghost sm" id="s-test">Testar conexão</button><button type="button" class="btn-ghost sm" id="s-cancel">Fechar</button><button type="submit" class="btn-primary sm">Salvar</button></div></form>`;
  const read = () => ({ provider: $('#s-prov').value, apiKey: $('#s-key').value.trim(), rememberKey: $('#s-rem').checked, model: $('#s-model').value.trim(), accessCode: $('#s-code')?.value || '' });
  const note = () => { const m = PROVIDERS[$('#s-prov').value]; $('#s-note').innerHTML = m ? `${esc(m.note || '')} ${m.keyUrl ? `<a href="${esc(m.keyUrl)}" target="_blank" rel="noopener" style="color:var(--gold)">Criar chave</a>` : ''}` : 'Usa os provedores configurados no servidor, trocando automaticamente se a cota de um acabar.'; };
  $('#s-prov').onchange = note; note();
  $('#s-cancel').onclick = () => dlg.close();
  $('#s-test').onclick = async () => {
    const prev = store.getSettings(); store.saveSettings(read());
    $('#s-res').textContent = 'Testando…';
    try { await generate({ task: 'ping', system: 'Responda apenas: ok', messages: [{ role: 'user', content: 'ping' }], maxTokens: 20, temperature: 0 }, S.backend, store.getSettings()); $('#s-res').textContent = '✓ Conexão funcionando.'; $('#s-res').style.color = 'var(--ok)'; }
    catch (e) { $('#s-res').textContent = '✕ ' + (e.message || e); $('#s-res').style.color = 'var(--rubric-light)'; }
    finally { store.saveSettings(prev); }
  };
  $('#setForm').onsubmit = (e) => { e.preventDefault(); store.saveSettings(read()); dlg.close(); toast('Configurações salvas.'); render(); };
  dlg.onclick = null; dlg.oncancel = null;
  dlg.showModal();
}

// ───────────── eventos ─────────────
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el || !root.contains(el) && !el.closest('header')) return;
  const fn = ACTIONS[el.dataset.act]; if (fn) fn({ ...el.dataset });
});
$('#btnProjects').onclick = () => { save(true); S.view = 'projects'; render(); };
$('#btnSettings').onclick = openSettings;

root.addEventListener('input', (e) => {
  const t = e.target, p = cur(); if (!p) return;
  if (t.dataset.bind) { setPath(p, t.dataset.bind, t.dataset.num ? Math.min(20, Math.max(3, parseInt(t.value, 10) || 8)) : t.value); save(); if (t.dataset.bind === 'title') $('#projName').textContent = t.value; }
  else if (t.dataset.ch) { const c = p.chapters[+t.dataset.i]; c[t.dataset.ch] = t.value; save(); if (t.dataset.ch === 'text') { $('#wc').textContent = `${fmt(countWords(t.value))} palavras`; const b = $$badge(+t.dataset.i); if (b) { b.textContent = t.value.trim() ? fmt(countWords(t.value)) + ' pal.' : 'vazio'; b.classList.toggle('ok', !!t.value.trim()); } } else if (t.dataset.ch === 'title') { const s = $(`.ch-list [data-i="${t.dataset.i}"] .t`); if (s) s.textContent = `${+t.dataset.i + 1}. ${t.value}`; } }
  else if (t.dataset.cover) { p.cover[t.dataset.cover] = t.value; save(); drawCoverPreview(); }
  else if (t.dataset.cpal !== undefined) { const pal = normalizeCover(p.cover).palette; pal[+t.dataset.cpal] = t.value; p.cover.palette = pal; save(); drawCoverPreview(); }
});
const $$badge = (i) => $(`.ch-list [data-i="${i}"] .badge`);
root.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'importFile' && t.files[0]) {
    t.files[0].text().then((txt) => { try { const n = store.importBackup(txt); toast(`${n} livro(s) importado(s).`); render(); } catch (err) { toast(err.message, true); } });
  } else if (t.dataset.bind && t.tagName === 'SELECT') { render(); }
  else if (t.dataset.cover === 'motif') drawCoverPreview();
});
window.addEventListener('beforeunload', () => save(true));

// ───────────── início ─────────────
(async function init() {
  S.backend = await detectBackend();
  render();
  if (new URLSearchParams(location.search).get('config')) openSettings();
})();
