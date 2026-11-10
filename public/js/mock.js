// Provedor "mock": respostas determinísticas para desenvolvimento, testes unitários e E2E.
// Só é alcançável no Worker quando MOCK_LLM=1 (nunca em produção).

const pick = (re, s, d = '') => (re.exec(s) || [])[1]?.trim() ?? d;

export function mockGenerate({ task, messages }) {
  const user = messages?.[messages.length - 1]?.content || '';
  const tema = pick(/TEMA:\s*(.+)/, user, 'Tema de teste');

  if (task === 'outline') {
    const n = parseInt(pick(/NUMERO_DE_CAPITULOS:\s*(\d+)/, user, '5'), 10);
    return JSON.stringify({
      title: `O guia de ${tema}`.slice(0, 60),
      subtitle: 'Do zero ao primeiro resultado, sem enrolação',
      chapters: Array.from({ length: n }, (_, i) => ({
        title: i === 0 ? 'Por que começar agora' : i === n - 1 ? 'Seu plano de ação' : `Passo ${i}: fundamentos de ${tema}`.slice(0, 80),
        summary: `O leitor entende o ponto ${i + 1} e sabe aplicar.`,
      })),
    });
  }

  if (task === 'chapter' || task === 'rewrite') {
    const m = /CAPITULO_ALVO:\s*(\d+)\s*\|\s*(.+)/.exec(user) || [];
    const n = m[1] || '1';
    const title = (m[2] || '').trim();
    const extra = task === 'rewrite' ? ` (reescrito: ${pick(/INSTRUÇÃO DO AUTOR:\s*(.+)/, user, 'sem instrução')})` : '';
    return `Imagine um leitor que acabou de abrir este livro, curioso sobre ${tema}.${extra}

Este é o texto de teste do capítulo ${n}, "${title}". Ele traz **conceitos-chave** e um exemplo hipotético, com acentuação: ação, coração, ânimo, você, é, à.

## O que importa primeiro

Parágrafo com *ênfase* e um caractere especial: R$ 47 & <tag> "aspas".

- Primeiro ponto prático
- Segundo ponto prático

## Como aplicar

1. Faça isto.
2. Depois isto.

> Uma frase de destaque para fixar a ideia.

---RESUMO---
Capítulo ${n} apresenta ${title || 'o tema'} e mostra como aplicar em dois passos.`;
  }

  if (task === 'cover') {
    return '```json\n' + JSON.stringify({
      title: `Guia de ${tema}`.slice(0, 60),
      subtitle: 'O essencial, passo a passo',
      tagline: 'Pare de adiar. Comece hoje.',
      palette: ['#14171F', '#9A3B32', '#C9A227'],
      motif: 'arcos',
    }) + '\n```';
  }

  if (task === 'kdp') {
    return JSON.stringify({
      titles: Array.from({ length: 5 }, (_, i) => ({ title: `Título ${i + 1} sobre ${tema}`.slice(0, 80), subtitle: `Subtítulo ${i + 1}` })),
      keywords: ['como começar', 'guia prático', 'passo a passo', 'para iniciantes', 'manual completo', 'dicas essenciais', 'estratégias simples'],
      categories: ['Negócios e Economia', 'Autoajuda', 'Empreendedorismo'],
      description: '<p><b>Você quer aprender sobre ' + tema + '?</b></p><p>Este livro mostra o caminho.</p><ul><li>Fundamentos</li><li>Prática</li></ul>',
    });
  }

  if (task === 'sales') {
    return JSON.stringify({
      headline: `Domine ${tema} sem enrolação`,
      subheadline: 'Um guia direto ao ponto',
      bullets: ['Benefício 1', 'Benefício 2', 'Benefício 3', 'Benefício 4', 'Benefício 5', 'Benefício 6'],
      forWhom: ['Quem está começando', 'Quem já tentou e travou', 'Quem quer método'],
      faq: [{ q: 'Serve para iniciantes?', a: 'Sim.' }, { q: 'Quanto tempo leva?', a: 'Depende de você.' }, { q: 'Tem suporte?', a: 'Não incluído.' }],
      cta: 'Comece a ler agora',
      posts: ['Post 1', 'Post 2', 'Post 3'],
    });
  }

  return 'ok';
}
