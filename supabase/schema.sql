-- =====================================================================
-- GranVendas · Schema Supabase (Postgres)
-- Rode este arquivo no Supabase: SQL Editor > New query > cole tudo > Run
-- =====================================================================

-- ---------- PERFIS (vendedores) ----------
create table if not exists perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default 'Vendedor',
  telefone text,
  papel text not null default 'vendedor', -- vendedor | gestor
  criado_em timestamptz default now()
);

-- ---------- CONFIGURAÇÕES do vendedor ----------
create table if not exists configuracoes (
  perfil_id uuid primary key references perfis(id) on delete cascade,
  hora_inicio text not null default '08:00',
  hora_fim text not null default '18:00',
  meta_visitas int not null default 8
);

-- ---------- PRODUTOS (preços e estoque) — compartilhado ----------
create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique,
  descricao text not null,
  unidade text default 'UN',
  preco numeric(12,2) not null default 0,
  estoque numeric(12,2) not null default 0,
  ativo boolean default true,
  atualizado_em timestamptz default now()
);
create index if not exists idx_produtos_desc on produtos using gin (to_tsvector('portuguese', descricao));

-- ---------- CLIENTES — compartilhado ----------
create table if not exists clientes (
  id uuid primary key default gen_random_uuid(),
  cnpj text unique,
  razao_social text not null,
  nome_fantasia text,
  telefone text,
  email text,
  logradouro text, numero text, bairro text, municipio text, uf text, cep text,
  lat double precision, lng double precision,
  observacao text,
  criado_por uuid references perfis(id),
  criado_em timestamptz default now()
);

-- ---------- ORÇAMENTOS ----------
create table if not exists orcamentos (
  id uuid primary key default gen_random_uuid(),
  numero serial,
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nome text,
  perfil_id uuid references perfis(id) on delete cascade,
  status text not null default 'rascunho', -- rascunho | enviado | fechado | perdido
  total numeric(12,2) not null default 0,
  observacao text,
  validade_dias int default 7,
  criado_em timestamptz default now(),
  enviado_em timestamptz,
  fechado_em timestamptz
);

create table if not exists orcamento_itens (
  id uuid primary key default gen_random_uuid(),
  orcamento_id uuid references orcamentos(id) on delete cascade,
  produto_id uuid references produtos(id),
  descricao text not null,
  quantidade numeric(12,2) not null default 1,
  preco_unit numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0
);

-- ---------- VISITAS ----------
create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfis(id) on delete cascade,
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nome text,
  lat double precision, lng double precision,
  foto_url text,
  observacao text,
  data date not null default current_date,
  criado_em timestamptz default now()
);

-- ---------- ROTAS (km rodados por dia) ----------
create table if not exists rotas (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfis(id) on delete cascade,
  data date not null default current_date,
  km numeric(10,2) not null default 0,
  iniciado_em timestamptz,
  encerrado_em timestamptz,
  motivo_fim text,
  unique (perfil_id, data)
);

-- ---------- IMPORTAÇÕES DE PREÇO (histórico) ----------
create table if not exists importacoes_preco (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid references perfis(id),
  arquivo text,
  qtd_atualizada int default 0,
  qtd_criada int default 0,
  criado_em timestamptz default now()
);

-- =====================================================================
-- Cria perfil automaticamente quando um usuário é criado
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.perfis (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', 'Vendedor'))
  on conflict (id) do nothing;
  insert into public.configuracoes (perfil_id) values (new.id) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table perfis enable row level security;
alter table configuracoes enable row level security;
alter table produtos enable row level security;
alter table clientes enable row level security;
alter table orcamentos enable row level security;
alter table orcamento_itens enable row level security;
alter table visitas enable row level security;
alter table rotas enable row level security;
alter table importacoes_preco enable row level security;

-- Perfis: cada um vê/edita o próprio
create policy "perfil_proprio" on perfis for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "config_propria" on configuracoes for all using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

-- Gestor pode LISTAR todos os perfis (tela Equipe). SECURITY DEFINER evita recursão de RLS.
create or replace function public.is_gestor()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and papel = 'gestor'
  );
$$;
create policy "perfil_gestor_le_todos" on perfis for select using (public.is_gestor());

-- Produtos e clientes: todos autenticados leem e escrevem (base compartilhada da empresa)
create policy "produtos_auth" on produtos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "clientes_auth" on clientes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "importacoes_auth" on importacoes_preco for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Orçamentos/itens/visitas/rotas: cada vendedor só o que é seu
create policy "orc_proprio" on orcamentos for all using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);
create policy "orc_itens_proprio" on orcamento_itens for all
  using (exists (select 1 from orcamentos o where o.id = orcamento_id and o.perfil_id = auth.uid()))
  with check (exists (select 1 from orcamentos o where o.id = orcamento_id and o.perfil_id = auth.uid()));
create policy "visitas_proprio" on visitas for all using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);
create policy "rotas_proprio" on rotas for all using (auth.uid() = perfil_id) with check (auth.uid() = perfil_id);

-- =====================================================================
-- STORAGE: bucket para fotos das visitas
-- =====================================================================
insert into storage.buckets (id, name, public) values ('visitas', 'visitas', true)
on conflict (id) do nothing;

create policy "visitas_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'visitas');
create policy "visitas_leitura" on storage.objects for select
  using (bucket_id = 'visitas');
