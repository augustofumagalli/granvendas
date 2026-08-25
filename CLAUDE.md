# GranVendas — contexto para o Claude Code

App PWA de vendas externas da **Grantubos**. React + Vite + Supabase.

## Comandos
- `npm install` — instala dependências
- `npm run dev` — sobe em http://localhost:5173 (com `--host`, acessível na rede local)
- `npm run build` — build de produção em `dist/`
- `npm run preview` — serve o build

> O Augusto testa localmente no localhost. Ao propor mudanças, deixe rodável em `npm run dev`.

## Variáveis de ambiente (`.env`, veja `.env.example`)
- `VITE_SUPABASE_URL` — URL do Supabase (cloud ou self-hosted)
- `VITE_SUPABASE_ANON_KEY` — chave anon public

## Arquitetura
- `src/pages/` — telas: Home, Produtos, Clientes, Orcamentos, Visitas, Relatorios, Configuracoes, Login
- `src/components/` — Layout (nav), Modal, ImportarPrecos (Excel/PDF), ImportarClientes (Excel/CSV, upsert por CNPJ)
- `src/context/` — AuthContext, ToastContext, ExpedienteContext (GPS/KM/expediente)
- `src/lib/` — supabase (client), pdf (gera orçamento), geo (Haversine/GPS), format (brl, datas, CNPJ)
- `supabase/schema.sql` — tabelas + RLS + storage bucket `visitas`

## Banco (Supabase)
Tabelas: `perfis`, `configuracoes`, `produtos`, `clientes`, `orcamentos`, `orcamento_itens`, `visitas`, `rotas`, `rota_pontos` (pontos GPS do trajeto p/ o mapa da rota), `importacoes_preco`. RLS: produtos/clientes compartilhados entre autenticados; orçamentos/visitas/rotas filtrados por `perfil_id = auth.uid()`.

## Convenções
- JSX (sem TypeScript), componentes funcionais + hooks.
- Estilo via classes em `src/styles/theme.css` (não criar CSS novo espalhado). Cores: laranja `#F58220`, azul `#173D5C`.
- Sempre filtrar dados por `perfil_id = user.id` em orçamentos/visitas/rotas.
- Sem novas dependências sem necessidade. Já instaladas: xlsx, jspdf, jspdf-autotable, pdfjs-dist.

## Pendências / próximos passos possíveis
- WhatsApp hoje é por link `wa.me`; migrar para API oficial (Meta/Twilio) se quiser envio automático.
- Deploy PWA em host https (Vercel/Netlify/Cloudflare) para GPS/câmera no celular.
- Painel do gestor (papel `gestor`) para ver todos os vendedores.
