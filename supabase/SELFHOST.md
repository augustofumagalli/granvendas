# Supabase Self-Hosted — passo a passo (GranVendas)

Guia para rodar o Supabase no **seu próprio servidor** (VPS/on-premise) via Docker e conectar o GranVendas nele.

## Pré-requisitos no servidor
- Uma máquina Linux (VPS) com **Docker** e **Docker Compose** instalados.
- Uma porta pública (padrão do Supabase self-host: **8000** para a API/Kong, **3000** para o Studio).
- Recomendado: um domínio (ex.: `supabase.grantubos.com.br`) e HTTPS (Nginx/Caddy na frente).

## 1. Baixar o Supabase
```bash
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env
```

## 2. Gerar segredos (MUITO IMPORTANTE)
Edite o arquivo `.env` e troque TODOS os valores padrão:
- `POSTGRES_PASSWORD` — senha forte do banco.
- `JWT_SECRET` — segredo com 40+ caracteres aleatórios.
- `ANON_KEY` e `SERVICE_ROLE_KEY` — gere a partir do `JWT_SECRET`.
  - Use o gerador oficial: https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys (informe o mesmo `JWT_SECRET` e copie as duas chaves geradas para o `.env`).
- `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` — login do Studio.
- `SITE_URL` — URL do seu app (ex.: `http://localhost:5173` em teste, ou o domínio do app publicado).
- `API_EXTERNAL_URL` e `SUPABASE_PUBLIC_URL` — URL pública da API (ex.: `https://supabase.grantubos.com.br`).

## 3. Subir os serviços
```bash
docker compose up -d
```
Confira: `docker compose ps` (todos "healthy"). Studio: `http://SEU_SERVIDOR:3000`.

## 4. Criar o schema do GranVendas
Abra o **Studio → SQL Editor → New query**, cole todo o `supabase/schema.sql` e execute (Run).
> Alternativa por terminal (dentro de `supabase/docker`):
> ```bash
> docker compose exec -T db psql -U postgres -d postgres < /caminho/para/schema.sql
> ```

## 5. Criar o usuário vendedor
No Studio → **Authentication → Users → Add user** (e-mail + senha). Em **Authentication → Providers → Email**, desligue "Confirm email" para simplificar no começo.

## 6. Conectar o GranVendas
No `.env` do app (raiz do projeto GranVendas):
```
VITE_SUPABASE_URL=https://supabase.grantubos.com.br     # ou http://SEU_SERVIDOR:8000
VITE_SUPABASE_ANON_KEY=<ANON_KEY gerada no passo 2>
```
Reinicie `npm run dev`. Pronto — o app passa a usar o seu Supabase self-hosted.

## Observações importantes
- **Storage (fotos das visitas):** o self-host já inclui o serviço de Storage; o bucket `visitas` é criado pelo `schema.sql`. As fotos ficam no seu servidor.
- **HTTPS obrigatório no celular:** GPS e câmera exigem `https` (ou `localhost`). Coloque um proxy (Caddy/Nginx) com certificado na frente do Kong (porta 8000) e do app.
- **Backup:** faça backup do volume do Postgres (`docker compose` volume `db`) regularmente.
- **Nunca exponha** a `SERVICE_ROLE_KEY` no app — o front-end usa somente a `ANON_KEY`.
- Documentação oficial: https://supabase.com/docs/guides/self-hosting/docker
