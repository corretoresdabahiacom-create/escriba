// Configuração em tempo de implantação.
// • Deploy no Cloudflare Workers (front + API no mesmo domínio): deixe apiBase vazio.
// • Front-end no GitHub Pages com a API no Worker: o workflow de deploy sobrescreve este arquivo com a URL do Worker
//   (variável de repositório ESCRIBA_API_BASE). Sem API, o estúdio funciona em "modo direto" com a chave do usuário.
window.ESCRIBA_CONFIG = { apiBase: '' };
