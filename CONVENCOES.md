# Convenções internas do GranVendas (para os agentes)

Projeto React + Vite (JSX). Pasta raiz: `/home/claude/granvendas`. Trabalhe SÓ nos arquivos que te foram designados.

## Imports disponíveis
- `import { supabase } from '../lib/supabase'`
- `import { useAuth } from '../context/AuthContext'` → `{ user, perfil }`
- `import { useToast } from '../context/ToastContext'` → `const toast = useToast(); toast('mensagem')`
- `import { useExpediente } from '../context/ExpedienteContext'` → `{ ligada, ligar, desligar, kmHoje, config, avisoFimExpediente, setAvisoFimExpediente }`
- `import Modal from '../components/Modal'` → `<Modal titulo="x" onClose={fn}>...</Modal>`
- `import { brl, numero, data, dataHora, hoje, soDigitos, formataCNPJ, formataTelefone } from '../lib/format'`
- `import { pegarPosicao } from '../lib/geo'` → `await pegarPosicao()` retorna `{lat,lng,precisao}`

## Classes CSS já prontas (theme.css) — use SEMPRE estas, não crie CSS novo
`card`, `section-title`, `btn`, `btn-azul`, `btn-outline`, `btn-verde`, `btn-sm`, `btn-ghost`,
`field` (com label+input dentro), `row` (flex lado a lado), `list-item` (com `.grow .title .sub`),
`badge` + `badge-cinza|laranja|azul|verde|erro`, `kpi-grid` + `kpi` (com `.v` valor e `.l` label), `kpi laranja`,
`empty`, `muted`, `center`, `mt`, `mb`, `flex`, `between`, `mono`, `spin`.

## Cores (se precisar inline): laranja #F58220, azul #173D5C.

## Tabelas Supabase (ver supabase/schema.sql)
- `perfis(id,nome,telefone,papel)`
- `configuracoes(perfil_id,hora_inicio,hora_fim,meta_visitas)`
- `produtos(id,codigo,descricao,unidade,preco,estoque,ativo,atualizado_em)`
- `clientes(id,cnpj,razao_social,nome_fantasia,telefone,email,logradouro,numero,bairro,municipio,uf,cep,lat,lng,observacao,criado_por,criado_em)`
- `orcamentos(id,numero,cliente_id,cliente_nome,perfil_id,status,total,observacao,validade_dias,criado_em,enviado_em,fechado_em)` status: rascunho|enviado|fechado|perdido
- `orcamento_itens(id,orcamento_id,produto_id,descricao,quantidade,preco_unit,subtotal)`
- `visitas(id,perfil_id,cliente_id,cliente_nome,lat,lng,foto_url,observacao,data,criado_em)`
- `rotas(perfil_id,data,km,iniciado_em,encerrado_em,motivo_fim)`
- `importacoes_preco(id,perfil_id,arquivo,qtd_atualizada,qtd_criada,criado_em)`
- Storage bucket público: `visitas` (fotos)

## Regras
- Sempre filtre por `perfil_id = user.id` em orcamentos/visitas/rotas.
- Componentes funcionais, hooks. Sem TypeScript. Sem libs novas além de: xlsx, jspdf, jspdf-autotable, pdfjs-dist (já no package.json).
- Trate estado vazio com `<div className="empty">`.
- Sempre `export default function NomePagina()`.
