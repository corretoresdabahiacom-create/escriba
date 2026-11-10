// Prompts do Escriba (funções puras). Cada função devolve { task, system, messages, maxTokens, temperature }.
// O contexto enviado ao modelo é COMPACTO (briefing + estrutura + resumos curtos), em vez de reenviar todos os
// capítulos a cada chamada — isso evita estourar limites de contexto/cota em planos gratuitos.

export const LANGUAGES = {
  'pt-BR': { label: 'Português (Brasil)', name: 'português do Brasil' },
  en: { label: 'English', name: 'English' },
  es: { label: 'Español', name: 'español' },
};

export const SIZES = {
  curto: { label: 'Curto (~450 palavras/capítulo)', words: 450 },
  medio: { label: 'Médio (~800 palavras/capítulo)', words: 800 },
  longo: { label: 'Longo (~1.300 palavras/capítulo)', words: 1300 },
};

export const TONES = ['Direto e prático', 'Acolhedor e didático', 'Técnico e autoritativo', 'Inspirador', 'Conversacional e bem-humorado'];
export const AUDIENCES = ['Empreendedores iniciantes', 'Profissionais de saúde', 'Criadores de conteúdo', 'Pais e educadores', 'Investidores iniciantes', 'Estudantes e concurseiros', 'Profissionais liberais'];

const lang = (b) => (LANGUAGES[b?.idioma] || LANGUAGES['pt-BR']).name;

const CRAFT_RULES = `Regras de qualidade (obrigatórias):
- Conteúdo concreto e útil: passos, exemplos, analogias, erros comuns. Nada de enrolação, clichês ou frases genéricas de abertura.
- NÃO invente estatísticas, estudos, pesquisas, citações, nomes de pessoas/empresas ou casos reais. Se precisar de exemplo, deixe claro que é hipotético ("Imagine que...").
- NÃO prometa resultados garantidos (financeiros, de saúde ou outros). Em temas de saúde, jurídico ou investimentos, inclua orientação para procurar um profissional quando fizer sentido.
- Não use emojis.`;

const SYSTEM_BASE = (b) =>
  `Você é um coautor e editor experiente de livros digitais de não ficção. Escreva sempre em ${lang(b)}. Tom de voz do livro: ${b?.tom || 'direto e prático'}. Público-alvo: ${b?.publico || 'público geral'}.\n${CRAFT_RULES}`;

const briefBlock = (b) =>
  [
    `TEMA: ${b.tema}`,
    `PÚBLICO: ${b.publico}`,
    `TOM: ${b.tom}`,
    `IDIOMA DO LIVRO: ${lang(b)}`,
    b.autor ? `AUTOR: ${b.autor}` : '',
    b.observacoes ? `OBSERVAÇÕES DO AUTOR (siga-as): ${b.observacoes}` : '',
  ].filter(Boolean).join('\n');

const outlineBlock = (p) =>
  p.chapters.map((c, i) => `${i + 1}. ${c.title}${c.summary ? ` — ${c.summary}` : ''}`).join('\n');

// ───────────────────────── Estrutura ─────────────────────────
export function outlinePrompt(brief) {
  const n = brief.numCapitulos || 8;
  return {
    task: 'outline',
    system: SYSTEM_BASE(brief),
    temperature: 0.8,
    maxTokens: 1400 + n * 90,
    messages: [{
      role: 'user',
      content: `${briefBlock(brief)}
NUMERO_DE_CAPITULOS: ${n}

Planeje o ebook. O primeiro capítulo deve introduzir o problema e a promessa do livro; o último deve consolidar e indicar próximos passos. Cada capítulo avança o raciocínio do anterior, sem sobreposição.

Responda APENAS com JSON válido (sem markdown, sem crases), exatamente neste formato:
{"title":"título vendável e curto","subtitle":"subtítulo que explica a promessa","chapters":[{"title":"título do capítulo","summary":"1-2 frases do que o capítulo cobre e do que o leitor ganha"}]}
Gere exatamente ${n} capítulos.`,
    }],
  };
}

// ───────────────────────── Capítulo ─────────────────────────
export function chapterPrompt(project, index) {
  const { brief, chapters } = project;
  const ch = chapters[index];
  const words = (SIZES[brief.tamanho] || SIZES.medio).words;
  const prev = chapters
    .slice(0, index)
    .map((c, i) => `Cap. ${i + 1} (${c.title}): ${c.resumo || c.summary || '(sem resumo)'}`)
    .join('\n');
  const last = index > 0 ? chapters[index - 1].text : '';
  const tail = last ? last.slice(-500) : '';
  const isFirst = index === 0;
  const isLast = index === chapters.length - 1;

  return {
    task: 'chapter',
    system: SYSTEM_BASE(brief),
    temperature: 0.75,
    maxTokens: Math.round(words * 2.1 + 350),
    messages: [{
      role: 'user',
      content: `${briefBlock(brief)}
TÍTULO DO LIVRO: ${project.title}${project.subtitle ? ` — ${project.subtitle}` : ''}

ESTRUTURA COMPLETA:
${outlineBlock(project)}

${prev ? `O QUE JÁ FOI ESCRITO (não repita):\n${prev}\n` : ''}${tail ? `\nÚLTIMAS LINHAS DO CAPÍTULO ANTERIOR (para continuidade):\n"""${tail}"""\n` : ''}
CAPITULO_ALVO: ${index + 1} | ${ch.title}
PLANO DO CAPÍTULO: ${ch.summary || '(livre, coerente com a estrutura)'}
TAMANHO ALVO: cerca de ${words} palavras.
${isFirst ? 'Este é o capítulo de abertura: prenda o leitor com um gancho e apresente a promessa do livro.' : ''}${isLast ? 'Este é o capítulo final: consolide o aprendizado, entregue um plano de ação curto e encerre com um fechamento marcante.' : ''}

Formato:
- NÃO escreva o título do capítulo nem "Capítulo N" (o título é inserido automaticamente).
- Comece direto pelo conteúdo. Use parágrafos curtos, 2 a 4 subtítulos "## ", e listas com "- " quando ajudarem. Negrito com **...** só para termos-chave.
- Ao final, em uma linha sozinha escreva exatamente ---RESUMO--- e depois um resumo de 2 frases do que este capítulo cobriu (para manter a continuidade do livro).`,
    }],
  };
}

// ───────────────────────── Reescrita ─────────────────────────
export function rewritePrompt(project, index, instruction) {
  const { brief, chapters } = project;
  const ch = chapters[index];
  const words = (SIZES[brief.tamanho] || SIZES.medio).words;
  return {
    task: 'rewrite',
    system: SYSTEM_BASE(brief),
    temperature: 0.7,
    maxTokens: Math.round(words * 2.4 + 350),
    messages: [{
      role: 'user',
      content: `TÍTULO DO LIVRO: ${project.title}
ESTRUTURA:
${outlineBlock(project)}

CAPITULO_ALVO: ${index + 1} | ${ch.title}

TEXTO ATUAL DO CAPÍTULO:
"""
${ch.text}
"""

INSTRUÇÃO DO AUTOR: ${instruction}

Reescreva o capítulo aplicando a instrução, mantendo o que funciona, o tom do livro e a coerência com os outros capítulos. Mesmas regras de formato (sem título, subtítulos "## ", listas "- ").
Ao final, em uma linha sozinha escreva exatamente ---RESUMO--- e um resumo de 2 frases.`,
    }],
  };
}

// ───────────────────────── Capa ─────────────────────────
export const MOTIFS = ['linhas', 'circulos', 'faixas', 'grade', 'arcos', 'pontos'];

export function coverPrompt(project) {
  const { brief } = project;
  return {
    task: 'cover',
    system: SYSTEM_BASE(brief),
    temperature: 0.9,
    maxTokens: 500,
    messages: [{
      role: 'user',
      content: `${briefBlock(brief)}
TÍTULO ATUAL: ${project.title}
SUBTÍTULO ATUAL: ${project.subtitle || ''}
ESTRUTURA:
${outlineBlock(project)}

Crie o conceito de capa tipográfica. Responda APENAS com JSON válido, sem markdown:
{"title":"título curto e forte (máx. 60 caracteres)","subtitle":"subtítulo (máx. 90 caracteres)","tagline":"frase curta de contracapa (máx. 90 caracteres)","palette":["#cor-de-fundo-1","#cor-de-fundo-2","#cor-de-destaque"],"motif":"um de: ${MOTIFS.join(', ')}"}
As cores devem combinar com o tema e o tom; use hexadecimal de 6 dígitos; o fundo deve ser escuro ou claro o bastante para garantir contraste com texto.`,
    }],
  };
}

// ───────────────────────── Publicação (KDP) ─────────────────────────
export function kdpPrompt(project) {
  const { brief } = project;
  return {
    task: 'kdp',
    system: SYSTEM_BASE(brief),
    temperature: 0.7,
    maxTokens: 1800,
    messages: [{
      role: 'user',
      content: `${briefBlock(brief)}
TÍTULO ATUAL: ${project.title}
SUBTÍTULO ATUAL: ${project.subtitle || ''}
ESTRUTURA:
${outlineBlock(project)}

Prepare os metadados de publicação para a Amazon KDP (e plataformas similares). Você NÃO tem dados de vendas em tempo real: baseie-se apenas no tema, em como leitores costumam pesquisar e em boas práticas gerais.
Responda APENAS com JSON válido, sem markdown:
{"titles":[{"title":"...","subtitle":"..."}],"keywords":["7 expressões que um leitor digitaria na busca, até 50 caracteres cada"],"categories":["3 sugestões de categoria/nicho, do mais amplo ao mais específico"],"description":"descrição da página do livro em HTML simples (use apenas <p>, <b>, <i>, <br>, <ul>, <li>), até 3500 caracteres: gancho, para quem é, o que vai aprender (lista), fechamento com chamada para ação. Sem promessas garantidas."}
Dê exatamente 5 opções em "titles" e 7 em "keywords".`,
    }],
  };
}

// ───────────────────────── Kit de vendas ─────────────────────────
export function salesPrompt(project) {
  const { brief } = project;
  return {
    task: 'sales',
    system: SYSTEM_BASE(brief),
    temperature: 0.8,
    maxTokens: 1800,
    messages: [{
      role: 'user',
      content: `${briefBlock(brief)}
TÍTULO: ${project.title}${project.subtitle ? ` — ${project.subtitle}` : ''}
ESTRUTURA:
${outlineBlock(project)}

Crie o kit de venda do ebook (para Hotmart, Kiwify, Amazon, redes sociais). NÃO invente depoimentos, números de vendas, prêmios ou garantias. Copy honesta, específica e sem promessas de resultado garantido.
Responda APENAS com JSON válido, sem markdown:
{"headline":"...","subheadline":"...","bullets":["6 benefícios concretos"],"forWhom":["3 perfis de quem deve ler"],"faq":[{"q":"...","a":"..."}],"cta":"chamada para ação curta","posts":["3 posts curtos para redes sociais, sem hashtags exageradas"]}
Dê exatamente 3 itens em "faq".`,
    }],
  };
}
