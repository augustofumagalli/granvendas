// Sincroniza clientes e produtos do SiSCom (Firebird) para o GranVendas (Supabase).
// Só LÊ o banco do SiSCom; a escrita acontece apenas no Supabase.
//
// Uso:
//   node sincronizar.js --listas       mostra as listas de preço do SiSCom (para preencher o config)
//   node sincronizar.js --teste        mostra o que seria enviado, sem gravar nada
//   node sincronizar.js                sincroniza clientes + produtos
//   node sincronizar.js --so-clientes  sincroniza só clientes
//   node sincronizar.js --so-produtos  sincroniza só produtos
//
// Configuração: copie config.exemplo.json para config.json e preencha.

const fs = require('fs')
const path = require('path')
const Firebird = require('node-firebird')

const args = process.argv.slice(2)
const tem = (f) => args.includes(f)
const TESTE = tem('--teste')

const cfgPath = path.join(__dirname, 'config.json')
if (!fs.existsSync(cfgPath)) {
  console.error('Falta o config.json nesta pasta. Copie o config.exemplo.json para config.json e preencha.')
  process.exit(1)
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
const EMPRESA = cfg.empresa ?? 1

const fbOpts = {
  host: cfg.firebird.host,
  port: cfg.firebird.porta || 3050,
  database: cfg.firebird.banco,
  user: cfg.firebird.usuario || 'SYSDBA',
  password: cfg.firebird.senha || 'masterkey',
  lowercase_keys: false,
}

const soDigitos = (s) => String(s ?? '').replace(/\D/g, '')
const txt = (v) => {
  const s = String(v ?? '').trim()
  return s || null
}
const num = (v) => {
  const n = Number(v)
  return isNaN(n) ? null : n
}

// ---------- Firebird (somente leitura) ----------

const attach = () =>
  new Promise((resolve, reject) => Firebird.attach(fbOpts, (e, db) => (e ? reject(e) : resolve(db))))
const query = (db, sql, params = []) =>
  new Promise((resolve, reject) => db.query(sql, params, (e, r) => (e ? reject(e) : resolve(r))))

// ---------- Supabase (REST) ----------

async function supaLogin() {
  const r = await fetch(`${cfg.supabase.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: cfg.supabase.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.supabase.email, password: cfg.supabase.senha }),
  })
  const d = await r.json()
  if (!r.ok) throw new Error('Login no Supabase falhou: ' + (d.error_description || d.msg || r.status))
  return { token: d.access_token, userId: d.user.id }
}

async function supa(rota, metodo, sessao, body) {
  const r = await fetch(`${cfg.supabase.url}/rest/v1/${rota}`, {
    method: metodo,
    headers: {
      apikey: cfg.supabase.anonKey,
      Authorization: `Bearer ${sessao.token}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) throw new Error(`Supabase ${metodo} ${rota} falhou (${r.status}): ${await r.text()}`)
  if (metodo === 'GET') return r.json()
}

async function supaGetTudo(rota, sessao) {
  return supa(`${rota}&limit=100000`, 'GET', sessao)
}

async function emLotes(itens, tamanho, fn) {
  for (let i = 0; i < itens.length; i += tamanho) await fn(itens.slice(i, i + tamanho))
}

// ---------- mapeamento SiSCom -> GranVendas ----------

const CAMPOS_CLIENTE = ['razao_social', 'nome_fantasia', 'telefone', 'email', 'logradouro', 'numero', 'bairro', 'municipio', 'uf', 'cep']

function mapearCliente(c) {
  const cnpj = soDigitos(c.CNPJCPF)
  if (cnpj.length !== 14) return null // pessoa física (CPF) ou sem documento: fora por enquanto
  const fone =
    soDigitos(String(c.DDD_FONE ?? '') + String(c.FONE ?? '')) ||
    soDigitos(String(c.DDD_CELULAR ?? '') + String(c.CELULAR ?? '')) ||
    null
  const email = txt(c.EMAIL)
  return {
    cnpj,
    razao_social: txt(c.RAZAOSOCIAL) || cnpj,
    nome_fantasia: txt(c.ABREVIA),
    telefone: fone,
    email: email ? email.split(/[;,\s]+/)[0] : null,
    logradouro: txt(c.ENDERECOPOSTAL),
    numero: txt(c.NUMPOSTAL),
    bairro: txt(c.BAIRROPOSTAL),
    municipio: txt(c.CIDADEPOSTAL),
    uf: txt(c.UFPOSTAL) ? String(c.UFPOSTAL).trim().toUpperCase().slice(0, 2) : null,
    cep: soDigitos(c.CEPPOSTAL) || null,
  }
}

const CAMPOS_PRODUTO = ['descricao', 'unidade', 'preco', 'preco_vista', 'preco_prazo', 'margem_vista', 'margem_prazo', 'estoque', 'ativo']

// Na tela do SiSCom cada lista tem duas linhas de preço:
// linha 1 = PRECOLISTA/MARGEMLISTA (o "a prazo" da Grantubos)
// linha 2 = PRECOMIN/MARGEMMIN (o "à vista", mais barato)
function mapearProduto(p, precos) {
  const pr = precos.get(p.CODPRODUTO)
  const preco_vista = pr?.precoVista ?? null
  const preco_prazo = pr?.precoPrazo ?? null
  return {
    codigo: String(p.CODPRODUTO),
    descricao: txt(p.DESCRICAO) || String(p.CODPRODUTO),
    unidade: txt(p.UNIDADE) || 'UN',
    preco: preco_vista ?? preco_prazo ?? 0,
    preco_vista,
    preco_prazo,
    margem_vista: pr?.margemVista ?? null,
    margem_prazo: pr?.margemPrazo ?? null,
    estoque: num(p.SALDO_ESTOQUE) ?? 0,
    ativo: !Number(p.INATIVO),
  }
}

// compara os campos vindos do SiSCom com o que já está no app.
// null vindo do SiSCom não conta como mudança (não apaga dado preenchido no app).
function diferente(novo, existente, campos) {
  return campos.some((k) => {
    if (novo[k] == null) return false
    const a = typeof novo[k] === 'number' ? Number(novo[k]) : String(novo[k])
    const b = typeof novo[k] === 'number' ? Number(existente[k] ?? NaN) : String(existente[k] ?? '')
    return a !== b
  })
}

// campo vazio no SiSCom preserva o valor que já existe no app
function mesclar(chaveNome, chaveValor, novo, existente, campos) {
  const reg = { [chaveNome]: chaveValor }
  campos.forEach((k) => {
    reg[k] = novo[k] ?? existente?.[k] ?? null
  })
  return reg
}

// ---------- execução ----------

async function main() {
  const db = await attach()
  try {
    if (tem('--listas')) {
      const listas = await query(
        db,
        `SELECT L.CODLISTAPRECO, L.NOMELISTAPRECO, L.DESCLISTAPRECO,
                (SELECT COUNT(*) FROM TBPRODUTOPRECO P
                  WHERE P.CODEMPRESA = L.CODEMPRESA AND P.CODLISTA = L.CODLISTAPRECO) AS QTDPRODUTOS
           FROM TBCADLISTAPRECO L WHERE L.CODEMPRESA = ? ORDER BY 1`,
        [EMPRESA]
      )
      console.log('Listas de preço do SiSCom (empresa ' + EMPRESA + '):\n')
      listas.forEach((l) =>
        console.log(
          `  código ${l.CODLISTAPRECO}: ${String(l.NOMELISTAPRECO || '').trim()} — ${String(l.DESCLISTAPRECO || '').trim()} (${l.QTDPRODUTOS} produtos com preço)`
        )
      )
      console.log('\nPreencha no config.json: "listaPreco" com o código da lista usada nos orçamentos (linha 1 = a prazo, linha 2 = à vista).')
      return
    }

    if (tem('--precos')) {
      const cod = Number(args[args.indexOf('--precos') + 1])
      if (!cod) {
        console.log('Uso: node sincronizar.js --precos CODIGO_DO_PRODUTO')
        return
      }
      const prod = await query(
        db,
        `SELECT CODPRODUTO, DESCRICAO, CUSTOLIQ, PRECOVAREJO, MARGEMVAREJO,
                PRECOMINIMO, MARGEMMINIMO, PRECOREVENDA, MARGEMREVENDA
           FROM TCADPRODUTO WHERE CODEMPRESA = ? AND CODPRODUTO = ?`,
        [EMPRESA, cod]
      )
      if (!prod.length) {
        console.log('Produto ' + cod + ' não encontrado.')
        return
      }
      const p = prod[0]
      console.log(`Produto ${p.CODPRODUTO}: ${String(p.DESCRICAO || '').trim()}`)
      console.log(`  cadastro: custo liq ${p.CUSTOLIQ} | varejo ${p.PRECOVAREJO} (${p.MARGEMVAREJO}%) | minimo ${p.PRECOMINIMO} (${p.MARGEMMINIMO}%) | revenda ${p.PRECOREVENDA} (${p.MARGEMREVENDA}%)`)
      const listas = await query(
        db,
        `SELECT L.CODLISTAPRECO, L.NOMELISTAPRECO,
                P.MARGEMLISTA, P.PRECOLISTA, P.MARGEMMIN, P.PRECOMIN, P.MARGEMMIN2, P.PRECOMIN2
           FROM TBPRODUTOPRECO P
           JOIN TBCADLISTAPRECO L ON L.CODEMPRESA = P.CODEMPRESA AND L.CODLISTAPRECO = P.CODLISTA
          WHERE P.CODEMPRESA = ? AND P.CODPRODUTO = ? ORDER BY 1`,
        [EMPRESA, cod]
      )
      listas.forEach((l) =>
        console.log(
          `  lista ${l.CODLISTAPRECO} ${String(l.NOMELISTAPRECO || '').trim()}: ` +
            `PRECOLISTA ${l.PRECOLISTA} (${l.MARGEMLISTA}%) | PRECOMIN ${l.PRECOMIN} (${l.MARGEMMIN}%) | PRECOMIN2 ${l.PRECOMIN2} (${l.MARGEMMIN2}%)`
        )
      )
      return
    }

    console.log('Conectando no Supabase...')
    const sessao = await supaLogin()

    // ---------- CLIENTES ----------
    if (!tem('--so-produtos')) {
      console.log('Lendo clientes do SiSCom...')
      const rows = await query(
        db,
        `SELECT CODIGOCLIENTE, RAZAOSOCIAL, ABREVIA, CNPJCPF, EMAIL,
                ENDERECOPOSTAL, NUMPOSTAL, BAIRROPOSTAL, CIDADEPOSTAL, UFPOSTAL, CEPPOSTAL,
                DDD_FONE, FONE, DDD_CELULAR, CELULAR
           FROM TCADCLIENTE
          WHERE CODEMPRESA = ? AND COALESCE(INATIVO, 0) = 0`,
        [EMPRESA]
      )
      const porCnpj = new Map()
      let semCnpj = 0
      let duplicados = 0
      rows.forEach((r) => {
        const m = mapearCliente(r)
        if (!m) { semCnpj++; return }
        if (porCnpj.has(m.cnpj)) { duplicados++; return }
        porCnpj.set(m.cnpj, m)
      })

      const existentes = await supaGetTudo(`clientes?select=cnpj,${CAMPOS_CLIENTE.join(',')}`, sessao)
      const mapaApp = new Map(existentes.map((c) => [soDigitos(c.cnpj), c]))

      const novos = []
      const atualizar = []
      porCnpj.forEach((m, cnpj) => {
        const ex = mapaApp.get(cnpj)
        if (!ex) novos.push({ ...m, criado_por: sessao.userId })
        else if (diferente(m, ex, CAMPOS_CLIENTE)) atualizar.push(mesclar('cnpj', cnpj, m, ex, CAMPOS_CLIENTE))
      })

      console.log(
        `Clientes: ${porCnpj.size} no SiSCom | ${novos.length} novos | ${atualizar.length} para atualizar | ` +
          `${semCnpj} sem CNPJ válido (CPF/em branco) | ${duplicados} CNPJs repetidos ignorados`
      )
      if (TESTE) {
        novos.slice(0, 3).forEach((c) => console.log('  novo:', c.cnpj, '-', c.razao_social))
        atualizar.slice(0, 3).forEach((c) => console.log('  atualiza:', c.cnpj, '-', c.razao_social))
      } else {
        await emLotes(novos, 300, (l) => supa('clientes', 'POST', sessao, l))
        await emLotes(atualizar, 300, (l) => supa('clientes?on_conflict=cnpj', 'POST', sessao, l))
        console.log('Clientes sincronizados.')
      }
    }

    // ---------- PRODUTOS ----------
    if (!tem('--so-clientes')) {
      console.log('Lendo produtos do SiSCom...')
      const rows = await query(
        db,
        `SELECT P.CODPRODUTO, P.DESCRICAO, P.UNIDADE, P.INATIVO,
                S.SALDO_ESTOQUE
           FROM TCADPRODUTO P
           LEFT JOIN TBSALDOATUAL S ON S.CODEMPRESA = P.CODEMPRESA AND S.CODPRODUTO = P.CODPRODUTO
          WHERE P.CODEMPRESA = ?`,
        [EMPRESA]
      )

      const precos = new Map()
      if (cfg.listaPreco == null) {
        console.log('Aviso: "listaPreco" não configurada no config.json — preços não serão atualizados. Rode --listas para descobrir o código.')
      } else {
        const linhas = await query(
          db,
          `SELECT CODPRODUTO, PRECOLISTA, MARGEMLISTA, PRECOMIN, MARGEMMIN FROM TBPRODUTOPRECO
            WHERE CODEMPRESA = ? AND CODLISTA = ?`,
          [EMPRESA, cfg.listaPreco]
        )
        linhas.forEach((p) => {
          precos.set(p.CODPRODUTO, {
            precoPrazo: num(p.PRECOLISTA) || null,
            margemPrazo: num(p.MARGEMLISTA),
            precoVista: num(p.PRECOMIN) || null,
            margemVista: num(p.MARGEMMIN),
          })
        })
      }

      const doSiscom = rows.map((p) => mapearProduto(p, precos))
      const existentes = await supaGetTudo(`produtos?select=codigo,${CAMPOS_PRODUTO.join(',')}`, sessao)
      const mapaApp = new Map(existentes.map((p) => [String(p.codigo).trim(), p]))

      const enviar = []
      let novosQtd = 0
      doSiscom.forEach((m) => {
        const ex = mapaApp.get(m.codigo)
        if (!ex) {
          novosQtd++
          enviar.push({ ...m, atualizado_em: new Date().toISOString() })
        } else if (diferente(m, ex, CAMPOS_PRODUTO)) {
          enviar.push({ ...mesclar('codigo', m.codigo, m, ex, CAMPOS_PRODUTO), atualizado_em: new Date().toISOString() })
        }
      })

      console.log(
        `Produtos: ${doSiscom.length} no SiSCom | ${novosQtd} novos | ${enviar.length - novosQtd} para atualizar`
      )
      if (TESTE) {
        enviar.slice(0, 5).forEach((p) =>
          console.log(`  ${p.codigo} - ${p.descricao} | à vista ${p.preco_vista ?? '—'} | a prazo ${p.preco_prazo ?? '—'} | estoque ${p.estoque}`)
        )
      } else {
        await emLotes(enviar, 300, (l) => supa('produtos?on_conflict=codigo', 'POST', sessao, l))
        console.log('Produtos sincronizados.')
      }
    }

    console.log(TESTE ? '\nModo teste: nada foi gravado.' : '\nSincronização concluída!')
  } finally {
    db.detach()
  }
}

main().catch((e) => {
  console.error('Erro:', e.message || e)
  process.exit(1)
})
