// Descobre a estrutura do banco Firebird do SiSCom e grava em schema-siscom.txt.
// Não altera nada no banco (somente SELECTs em tabelas de sistema).
//
// Uso (no PC que enxerga o servidor do SiSCom):
//   npm install
//   node descobrir-schema.js --db "C:\Siscom\DADOS.FDB"
//   node descobrir-schema.js --host gransalus --db "C:\Siscom\DADOS.FDB"
//
// Opções:
//   --host   servidor Firebird (padrão: localhost). Pode ser o nome da máquina, ex.: gransalus
//   --porta  porta do Firebird (padrão: 3050)
//   --db     caminho do arquivo .FDB/.GDB NO SERVIDOR (obrigatório)
//   --user   usuário (padrão: SYSDBA)
//   --senha  senha (padrão: masterkey)
//   --amostra NOME_TABELA  mostra até 5 linhas da tabela no console (para conferir o conteúdo)

const fs = require('fs')
const Firebird = require('node-firebird')

function arg(nome, padrao) {
  const i = process.argv.indexOf('--' + nome)
  return i >= 0 && process.argv[i + 1] != null ? process.argv[i + 1] : padrao
}

const opts = {
  host: arg('host', 'localhost'),
  port: Number(arg('porta', 3050)),
  database: arg('db', ''),
  user: arg('user', 'SYSDBA'),
  password: arg('senha', 'masterkey'),
  lowercase_keys: false,
}
const amostra = arg('amostra', '')

if (!opts.database) {
  console.log('Informe o caminho do banco: node descobrir-schema.js --db "C:\\Siscom\\DADOS.FDB" [--host gransalus]')
  console.log('Dica: o caminho do .FDB costuma aparecer no SiscomHttpSvr.ini ou na tela de login do SiSCom.')
  process.exit(1)
}

const query = (db, sql, params = []) =>
  new Promise((resolve, reject) => db.query(sql, params, (e, r) => (e ? reject(e) : resolve(r))))

// tipos do RDB$FIELDS -> nome legível
function tipoNome(tipo, subtipo, escala) {
  const t = Number(tipo)
  if (t === 7) return subtipo ? `numeric(4,${-escala})` : 'smallint'
  if (t === 8) return subtipo ? `numeric(9,${-escala})` : 'integer'
  if (t === 10) return 'float'
  if (t === 12) return 'date'
  if (t === 13) return 'time'
  if (t === 14) return 'char'
  if (t === 16) return subtipo ? `numeric(18,${-escala})` : 'bigint'
  if (t === 27) return 'double'
  if (t === 35) return 'timestamp'
  if (t === 37) return 'varchar'
  if (t === 261) return subtipo === 1 ? 'blob texto' : 'blob'
  return 'tipo ' + t
}

Firebird.attach(opts, async (err, db) => {
  if (err) {
    console.error('Não conectou no Firebird:', err.message || err)
    console.error('Confira host, caminho do .FDB, usuário e senha (padrão do Firebird: SYSDBA / masterkey).')
    process.exit(1)
  }
  try {
    if (amostra) {
      // só imprime no console — não vai para o arquivo
      const rows = await query(db, `SELECT FIRST 5 * FROM ${amostra.replace(/[^A-Za-z0-9_$]/g, '')}`)
      rows.forEach((r) => {
        const limpo = {}
        Object.keys(r).forEach((k) => { limpo[k] = typeof r[k] === 'function' ? '[blob]' : r[k] })
        console.log(limpo)
      })
      db.detach()
      return
    }

    const tabelas = await query(
      db,
      `SELECT TRIM(RDB$RELATION_NAME) AS TABELA
         FROM RDB$RELATIONS
        WHERE COALESCE(RDB$SYSTEM_FLAG, 0) = 0 AND RDB$VIEW_BLR IS NULL
        ORDER BY 1`
    )
    const colunas = await query(
      db,
      `SELECT TRIM(rf.RDB$RELATION_NAME) AS TABELA,
              TRIM(rf.RDB$FIELD_NAME)    AS COLUNA,
              rf.RDB$FIELD_POSITION      AS POS,
              f.RDB$FIELD_TYPE           AS TIPO,
              f.RDB$FIELD_SUB_TYPE       AS SUBTIPO,
              f.RDB$FIELD_SCALE          AS ESCALA,
              f.RDB$FIELD_LENGTH         AS TAM
         FROM RDB$RELATION_FIELDS rf
         JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
        ORDER BY 1, 3`
    )

    const porTabela = {}
    colunas.forEach((c) => {
      const t = c.TABELA
      if (!porTabela[t]) porTabela[t] = []
      const nome = tipoNome(c.TIPO, c.SUBTIPO, c.ESCALA)
      porTabela[t].push(`  ${c.COLUNA} ${nome}${nome === 'varchar' || nome === 'char' ? `(${c.TAM})` : ''}`)
    })

    const linhas = []
    linhas.push(`Banco: ${opts.host}:${opts.database}`)
    linhas.push(`Tabelas: ${tabelas.length}`)
    linhas.push('')
    // tabelas com cara de cliente/produto primeiro, para facilitar a leitura
    const relevante = (t) => /CLI|PROD|ESTOQ|PRECO|TABELA/i.test(t)
    const ordenadas = [...tabelas.map((t) => t.TABELA)].sort((a, b) => (relevante(b) - relevante(a)) || a.localeCompare(b))
    ordenadas.forEach((t) => {
      linhas.push((relevante(t) ? '>>> ' : '') + t)
      ;(porTabela[t] || []).forEach((c) => linhas.push(c))
      linhas.push('')
    })

    fs.writeFileSync('schema-siscom.txt', linhas.join('\n'), 'utf-8')
    console.log(`OK! ${tabelas.length} tabelas gravadas em schema-siscom.txt`)
    console.log('As marcadas com ">>>" parecem ser de clientes/produtos — são as que interessam.')
    console.log('Esse arquivo tem só nomes de tabelas e colunas, nenhum dado.')
  } catch (e) {
    console.error('Erro:', e.message || e)
  } finally {
    db.detach()
  }
})
