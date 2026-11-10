# Deploy (gratuito, sem cartão)

O workflow `.github/workflows/ci-deploy.yml` roda a cada push na `main`: **testes → deploy**. Pull requests só rodam os testes.

## Opção A — Cloudflare Workers (recomendada: site + API juntos)

Plano gratuito, **sem cartão**. Uma vez:

1. Crie uma conta em <https://dash.cloudflare.com/sign-up>.
2. Anote o **Account ID** (painel → *Workers & Pages* → barra lateral).
3. Crie um **API Token**: *My Profile → API Tokens → Create Token → modelo "Edit Cloudflare Workers"*.
4. No GitHub: *Settings → Secrets and variables → Actions → New repository secret*:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
5. Faça um push na `main` (ou rode o workflow manualmente). O site sobe em `https://escriba.<seu-subdominio>.workers.dev`.

Depois, configure a IA (escolha uma ou mais; todas têm plano gratuito sem cartão):

```bash
npx wrangler secret put GROQ_API_KEY         # https://console.groq.com/keys
npx wrangler secret put GEMINI_API_KEY       # https://aistudio.google.com/apikey
npx wrangler secret put OPENROUTER_API_KEY   # https://openrouter.ai/keys
```

O **Workers AI** já está ligado em `wrangler.toml` (binding `AI`) e funciona sem chave dentro da cota gratuita da conta. A ordem de preferência está em `PROVIDER_ORDER`.

Opcionais (`wrangler secret put` ou `[vars]`): `ACCESS_CODE` (exige código para gerar), `ALLOWED_ORIGINS`, `RATE_LIMIT_PER_10MIN`, `*_MODEL`.

Se o deploy automático estiver sem os secrets, o job apenas emite um aviso e **não falha**.

## Opção B — GitHub Pages (somente front-end, sem secrets)

O mesmo workflow publica a pasta `public/` no GitHub Pages (desative com a variável de repositório `DEPLOY_PAGES=false`).
Como não há servidor, o estúdio funciona no **modo direto**: o usuário cola a própria chave gratuita (Groq/Gemini) em *Configurações de IA* e as chamadas vão do navegador ao provedor.

Se também usar o Worker, aponte o site do Pages para ele:

1. Variável de repositório `ESCRIBA_API_BASE` = `https://escriba.<subdominio>.workers.dev` (o workflow grava isso em `config.js`).
2. No Worker, `ALLOWED_ORIGINS` = `https://<usuario>.github.io`.

Se o Pages não estiver habilitado, ative em *Settings → Pages → Source: GitHub Actions* (o workflow tenta habilitar sozinho).

## Verificação pós-deploy

```bash
curl https://SEU-WORKER.workers.dev/api/health   # lista os provedores ativos (nunca expõe chaves)
```

## Segurança

- Chaves só em *secrets* do Worker; o navegador nunca as vê. A chave do usuário (modo direto) fica só na sessão, a menos que ele marque "lembrar".
- `public/_headers` aplica CSP e cabeçalhos de segurança no Cloudflare. O GitHub Pages não lê esse arquivo.
- Rate limit por IP é *best-effort* (em memória, por instância). Para exposição pública intensa, use `ACCESS_CODE` ou as regras de rate limiting da Cloudflare.
