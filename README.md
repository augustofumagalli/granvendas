# GranVendas · Plataforma de Vendas da Grantubos

App PWA (instala no celular como aplicativo) para o vendedor externo: orçamentos, preços/estoque, cadastro de cliente por CNPJ, envio por WhatsApp, visitas com GPS e foto, relatórios automáticos e controle de KM/expediente.

---

## 1. Pré-requisitos
- **Node.js 18+** instalado (https://nodejs.org)
- Uma conta no **Supabase** (https://supabase.com)

## 2. Rodar na sua máquina (localhost)
```bash
npm install
npm run dev
```
Abra o endereço que aparecer (ex.: http://localhost:5173).
Para testar GPS/câmera no celular, use `npm run dev` (já sobe com `--host`) e acesse pelo IP da sua máquina na mesma rede, **ou** publique (ver item 5). Câmera e GPS só funcionam em **https** ou em **localhost**.

## 3. Configurar o Supabase
1. Crie um projeto no Supabase.
2. Vá em **SQL Editor > New query**, cole todo o conteúdo de `supabase/schema.sql` e clique **Run**. Isso cria as tabelas, as permissões (RLS) e o bucket de fotos.
3. Vá em **Project Settings > API** e copie a **Project URL** e a chave **anon public**.
4. Copie o arquivo `.env.example` para `.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua_chave_anon
   ```
5. Reinicie o `npm run dev`.

## 4. Criar o login do vendedor
No Supabase: **Authentication > Users > Add user** (informe e-mail e senha). O perfil e as configurações são criados automaticamente no primeiro login. Depois é só entrar no app com esse e-mail/senha.
> Dica: em **Authentication > Providers > Email**, desligue "Confirm email" para não precisar confirmar por e-mail no começo.

## 5. Publicar (opcional, recomendado para o celular)
Faça o build e suba a pasta `dist` em qualquer host estático (Vercel, Netlify, Cloudflare Pages):
```bash
npm run build
```
Na Vercel/Netlify, aponte o projeto para este repositório, defina as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` e pronto. Depois, no celular, abra o site e use "Adicionar à tela de início" para instalar como app.

---

## Funcionalidades
- **Início:** botão *Ligar/Desligar plataforma* (os KM só contam com ela ligada — não conta o trajeto de casa), KM do dia, metas e KPIs. Aviso automático de fim de expediente.
- **Produtos:** lista de preços e estoque + **importação de preços por Excel/PDF** (reconhece as colunas e atualiza sem IA, com prévia antes de confirmar).
- **Clientes:** cadastro buscando o **CNPJ** online (BrasilAPI) e preenchendo os dados automaticamente.
- **Orçamentos:** montar itens, **gerar PDF** com o logo, **enviar por WhatsApp** (link) e **salvar o PDF** no celular para anexar. Status: rascunho / enviado / fechado / perdido.
- **Visitas:** check-in por **GPS**, **foto pela câmera**, observação, meta de visitas por dia e saldo (feitas x meta).
- **Relatórios:** automáticos por período (hoje/semana/mês): visitas, orçamentos enviados/fechados, KM rodados e taxa de conversão.
- **Configurações:** horário de expediente e meta diária de visitas.

## Estrutura
```
src/
  pages/        telas (Home, Produtos, Clientes, Orcamentos, Visitas, Relatorios, Configuracoes, Login)
  components/   Layout, Modal, ImportarPrecos
  context/      Auth, Toast, Expediente (GPS/KM/expediente)
  lib/          supabase, pdf, geo, format
supabase/
  schema.sql    banco + permissões + storage
```

## Tecnologia
React + Vite · PWA (vite-plugin-pwa) · Supabase (Postgres + Auth + Storage) · jsPDF · xlsx · pdfjs-dist.

Cores da marca: laranja `#F58220` e azul `#173D5C`.
