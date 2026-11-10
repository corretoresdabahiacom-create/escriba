import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const p = await b.newPage({ viewport: { width: 2400, height: 1500 } });
await p.goto('http://127.0.0.1:8797/estudio.html');
await p.evaluate(async () => {
  const { renderCoverCanvas } = await import('/js/cover.js');
  const cases = [
    { title: 'Finanças', subtitle: 'Guia rápido', tagline: 'Comece hoje', author: 'Ana' },
    { title: 'Guia de Finanças para consultório odontológico', subtitle: 'O essencial, passo a passo para quem quer lucrar', tagline: 'Pare de adiar. Comece hoje.', author: 'Dra. Teste Silva' },
    { title: 'Como organizar absolutamente todas as finanças pessoais e profissionais de um pequeno consultório odontológico em sete passos', subtitle: 'Um método completo, direto e prático para dentistas que querem sair do vermelho e planejar o crescimento da clínica com segurança', tagline: 'Uma frase longa de contracapa que também precisa caber sem estourar a margem', author: 'Dra. Maria Fernanda de Albuquerque e Silva Neto' },
  ];
  const wrap = document.body; wrap.innerHTML = ''; wrap.style.cssText = 'background:#333;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:8px';
  for (const c of cases) for (const t of ['classico', 'moderno', 'minimal', 'bold']) {
    const cv = renderCoverCanvas({ ...c, template: t, palette: ['#14171F', '#9A3B32', '#C9A227'], motif: 'arcos' });
    cv.style.cssText = 'width:100%;height:auto'; wrap.appendChild(cv);
  }
});
await p.screenshot({ path: '/tmp/claude-0/shots/cover-matrix.png', fullPage: true });
await b.close();
