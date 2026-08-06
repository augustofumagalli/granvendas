import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { brl, numero } from '../lib/format'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// remove acentos + minúsculas para comparar cabeçalhos
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

// Campos que a planilha pode ter (em qualquer ordem)
const CAMPOS = ['codigo', 'descricao', 'preco_vista', 'preco_prazo', 'margem_vista', 'margem_prazo', 'estoque']

const ROTULO = {
  codigo: 'Código',
  descricao: 'Descrição',
  preco_vista: 'Preço à vista',
  preco_prazo: 'Preço a prazo',
  margem_vista: 'Margem à vista (MG %)',
  margem_prazo: 'Margem a prazo (MG %)',
  estoque: 'Estoque',
}

// candidatos por tipo de coluna (já sem acento). Mais específico primeiro.
// As margens (MG %) são detectadas à parte, por proximidade dos preços.
const CAND = {
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref'],
  descricao: ['descricao', 'discriminacao', 'produto', 'item', 'nome'],
  preco_vista: ['a vista', 'avista', 'preco a vista', 'vista', 'preco venda', 'preco', 'valor'],
  preco_prazo: ['a prazo', 'aprazo', 'preco a prazo', 'prazo'],
  estoque: ['estoque', 'saldo', 'quantidade', 'qtd', 'disponivel'],
}
const CAND_MARGEM = ['margem', 'markup', 'mg %', 'mg%', 'mg']
const CAMPOS_SIMPLES = ['codigo', 'descricao', 'preco_vista', 'preco_prazo', 'estoque']

const idxVazio = () => CAMPOS.reduce((o, k) => ((o[k] = -1), o), {})

// converte número BR (ou number) -> Number. Remove R$, % e separadores.
function parseNum(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim().replace(/r\$/i, '').replace(/%/g, '').replace(/\s/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  return parseFloat(s)
}

function detectarColunas(cab) {
  const idx = idxVazio()
  const margens = [] // índices de todas as colunas "MG %"
  cab.forEach((c, i) => {
    const n = norm(c)
    if (!n) return
    if (CAND_MARGEM.some((t) => n === t || n.includes(t))) { margens.push(i); return }
    for (const key of CAMPOS_SIMPLES) {
      if (idx[key] === -1 && CAND[key].some((t) => n === t || n.includes(t))) { idx[key] = i; break }
    }
  })

  // associa cada margem ao preço mais próximo (prioriza a que vem logo à direita do preço)
  const livres = [...margens]
  const atribuir = (precoKey, margemKey) => {
    if (idx[precoKey] < 0 || !livres.length) return
    let best = -1
    let bestScore = Infinity
    livres.forEach((mi) => {
      const dist = mi - idx[precoKey]
      const score = dist > 0 ? dist : Math.abs(dist) + 0.5 // prefere logo após o preço
      if (score < bestScore) { bestScore = score; best = mi }
    })
    if (best >= 0) {
      idx[margemKey] = best
      livres.splice(livres.indexOf(best), 1)
    }
  }
  atribuir('preco_prazo', 'margem_prazo')
  atribuir('preco_vista', 'margem_vista')
  // margem que sobrou sem par -> preenche o slot vazio, se houver
  if (livres.length && idx.margem_vista < 0) idx.margem_vista = livres.shift()
  if (livres.length && idx.margem_prazo < 0) idx.margem_prazo = livres.shift()

  return idx
}

// reconhece o cabeçalho se achou código e ao menos um preço
const reconheceu = (idx) => idx.codigo >= 0 && (idx.preco_vista >= 0 || idx.preco_prazo >= 0)

function montarLinhas(matriz, idx) {
  const out = []
  for (let r = 1; r < matriz.length; r++) {
    const row = matriz[r]
    if (!row) continue
    const codigo = idx.codigo >= 0 ? String(row[idx.codigo] ?? '').trim() : ''
    if (!codigo) continue
    const descricao = idx.descricao >= 0 ? String(row[idx.descricao] ?? '').trim() : ''
    const pv = idx.preco_vista >= 0 ? parseNum(row[idx.preco_vista]) : NaN
    const pp = idx.preco_prazo >= 0 ? parseNum(row[idx.preco_prazo]) : NaN
    const mv = idx.margem_vista >= 0 ? parseNum(row[idx.margem_vista]) : NaN
    const mp = idx.margem_prazo >= 0 ? parseNum(row[idx.margem_prazo]) : NaN
    const est = idx.estoque >= 0 ? parseNum(row[idx.estoque]) : NaN
    const preco = !isNaN(pv) ? pv : !isNaN(pp) ? pp : 0
    out.push({
      codigo,
      descricao,
      preco,
      preco_vista: isNaN(pv) ? null : pv,
      preco_prazo: isNaN(pp) ? null : pp,
      margem_vista: isNaN(mv) ? null : mv,
      margem_prazo: isNaN(mp) ? null : mp,
      estoque: isNaN(est) ? null : est,
    })
  }
  return out
}

export default function ImportarPrecos({ onClose, onConcluido }) {
  const { user } = useAuth()
  const toast = useToast()

  const [nomeArquivo, setNomeArquivo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [matriz, setMatriz] = useState(null) // guardada p/ remapear
  const [cabecalho, setCabecalho] = useState([])
  const [mapCol, setMapCol] = useState(idxVazio())
  const [precisaMapear, setPrecisaMapear] = useState(false)

  const [linhas, setLinhas] = useState([])
  const [mapaProdutos, setMapaProdutos] = useState({}) // codigo -> produto existente

  useEffect(() => {
    supabase
      .from('produtos')
      .select('codigo,preco,descricao,preco_vista,preco_prazo,margem_vista,margem_prazo,estoque')
      .then(({ data }) => {
        const m = {}
        ;(data || []).forEach((p) => {
          if (p.codigo != null) m[String(p.codigo).trim()] = p
        })
        setMapaProdutos(m)
      })
  }, [])

  function resetar() {
    setMatriz(null)
    setCabecalho([])
    setMapCol(idxVazio())
    setPrecisaMapear(false)
    setLinhas([])
  }

  async function lerExcel(file) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) throw new Error('Planilha vazia.')
    const mat = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (!mat.length) throw new Error('Nenhuma linha encontrada no arquivo.')
    const cab = mat[0] || []
    const idx = detectarColunas(cab)
    setCabecalho(cab)
    setMatriz(mat)
    setMapCol(idx)
    if (reconheceu(idx)) {
      const ls = montarLinhas(mat, idx)
      if (!ls.length) throw new Error('Colunas reconhecidas, mas nenhuma linha válida.')
      setLinhas(ls)
      setPrecisaMapear(false)
    } else {
      // não reconheceu -> deixa o usuário mapear (já pré-preenchido com o que detectou)
      setPrecisaMapear(true)
      setLinhas([])
    }
  }

  async function lerPdf(file) {
    const buf = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    const linhasTexto = []
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p)
      const tc = await page.getTextContent()
      const porY = {}
      tc.items.forEach((it) => {
        if (!it.str) return
        const y = Math.round(it.transform[5])
        if (!porY[y]) porY[y] = []
        porY[y].push(it)
      })
      Object.keys(porY)
        .map(Number)
        .sort((a, b) => b - a)
        .forEach((y) => {
          const texto = porY[y]
            .sort((a, b) => a.transform[4] - b.transform[4])
            .map((i) => i.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
          if (texto) linhasTexto.push(texto)
        })
    }

    const rePreco = /(\d{1,3}(?:\.\d{3})*,\d{2})/
    const reCodigo = /^([A-Za-z0-9][A-Za-z0-9\-.\/]*)/
    const out = []
    linhasTexto.forEach((texto) => {
      const mPreco = texto.match(rePreco)
      if (!mPreco) return
      const preco = parseNum(mPreco[1])
      if (isNaN(preco)) return
      const mCod = texto.match(reCodigo)
      const codigo = mCod ? mCod[1] : ''
      if (!codigo) return
      let descricao = texto.replace(mPreco[0], '')
      if (mCod) descricao = descricao.replace(mCod[0], '')
      descricao = descricao.replace(/\s+/g, ' ').trim()
      out.push({ codigo, descricao, preco, preco_vista: preco, preco_prazo: null, margem_vista: null, margem_prazo: null, estoque: null })
    })
    if (!out.length) throw new Error('Não foi possível extrair preços do PDF.')
    setLinhas(out)
    setPrecisaMapear(false)
  }

  async function aoSelecionar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    resetar()
    setNomeArquivo(file.name)
    setCarregando(true)
    try {
      const nome = file.name.toLowerCase()
      if (nome.endsWith('.pdf')) await lerPdf(file)
      else await lerExcel(file)
    } catch (err) {
      toast('Erro ao ler arquivo: ' + (err.message || err))
      resetar()
      setNomeArquivo('')
    } finally {
      setCarregando(false)
    }
  }

  function aplicarMapeamento() {
    if (mapCol.codigo < 0 || (mapCol.preco_vista < 0 && mapCol.preco_prazo < 0)) {
      toast('Selecione ao menos o código e um preço (à vista ou a prazo).')
      return
    }
    const ls = montarLinhas(matriz, mapCol)
    if (!ls.length) {
      toast('Nenhuma linha válida com esse mapeamento.')
      return
    }
    setLinhas(ls)
    setPrecisaMapear(false)
  }

  function situacao(l) {
    const ex = mapaProdutos[l.codigo]
    if (!ex) return 'Novo'
    if (Number(ex.preco) !== Number(l.preco)) return 'Atualiza'
    return 'Sem mudança'
  }

  function badgeSit(sit) {
    if (sit === 'Novo') return 'badge badge-verde'
    if (sit === 'Atualiza') return 'badge badge-azul'
    return 'badge badge-cinza'
  }

  async function confirmar() {
    if (!linhas.length) return
    setSalvando(true)
    try {
      let qtdAtual = 0
      let qtdNovo = 0
      const registros = linhas.map((l) => {
        const ex = mapaProdutos[l.codigo]
        if (!ex) qtdNovo++
        else if (Number(ex.preco) !== Number(l.preco)) qtdAtual++
        return {
          codigo: l.codigo,
          descricao: l.descricao || ex?.descricao || l.codigo,
          preco: l.preco,
          preco_vista: l.preco_vista ?? ex?.preco_vista ?? null,
          preco_prazo: l.preco_prazo ?? ex?.preco_prazo ?? null,
          margem_vista: l.margem_vista ?? ex?.margem_vista ?? null,
          margem_prazo: l.margem_prazo ?? ex?.margem_prazo ?? null,
          estoque: l.estoque ?? ex?.estoque ?? 0,
          atualizado_em: new Date().toISOString(),
        }
      })

      const { error } = await supabase.from('produtos').upsert(registros, { onConflict: 'codigo' })
      if (error) throw error

      await supabase.from('importacoes_preco').insert({
        perfil_id: user.id,
        arquivo: nomeArquivo,
        qtd_atualizada: qtdAtual,
        qtd_criada: qtdNovo,
      })

      toast(`${qtdAtual} atualizados, ${qtdNovo} novos`)
      onConcluido && onConcluido()
    } catch (err) {
      toast('Erro ao salvar: ' + (err.message || err))
    } finally {
      setSalvando(false)
    }
  }

  const opcoesColuna = cabecalho.map((c, i) => (
    <option key={i} value={i}>
      {String(c || '').trim() || `Coluna ${i + 1}`}
    </option>
  ))

  // colunas detectadas (para o resumo)
  const detectadas = CAMPOS.filter((k) => mapCol[k] >= 0)

  return (
    <div>
      <div className="field">
        <label>Arquivo (Excel, CSV ou PDF)</label>
        <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={aoSelecionar} />
      </div>

      {carregando && (
        <p className="center muted">
          <span className="spin" /> Lendo arquivo...
        </p>
      )}

      {precisaMapear && (
        <div className="card mb">
          <p className="section-title">Indique as colunas da planilha:</p>
          <p className="muted mb">Reconheci automaticamente o que deu — confira e ajuste se precisar.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {CAMPOS.map((k) => (
              <div className="field" key={k} style={{ minWidth: 150 }}>
                <label>{ROTULO[k]}</label>
                <select
                  value={mapCol[k]}
                  onChange={(e) => setMapCol({ ...mapCol, [k]: Number(e.target.value) })}
                >
                  <option value={-1}>—</option>
                  {opcoesColuna}
                </select>
              </div>
            ))}
          </div>
          <button className="btn btn-azul" onClick={aplicarMapeamento}>
            Aplicar mapeamento
          </button>
        </div>
      )}

      {linhas.length > 0 && (
        <>
          <div className="between mb">
            <p className="section-title" style={{ margin: 0 }}>Pré-visualização ({linhas.length} linhas)</p>
            {cabecalho.length > 0 && (
              <button className="btn btn-outline btn-sm" onClick={() => setPrecisaMapear(true)}>
                Ajustar colunas
              </button>
            )}
          </div>
          {detectadas.length > 0 && (
            <p className="muted mb" style={{ fontSize: 12 }}>
              Colunas reconhecidas: {detectadas.map((k) => ROTULO[k]).join(' · ')}
            </p>
          )}
          <div style={{ overflowX: 'auto', maxHeight: '40vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Código</th>
                  <th style={{ padding: '6px 8px' }}>Descrição</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>À vista</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>MG %</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>A prazo</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>MG %</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Estoque</th>
                  <th style={{ padding: '6px 8px' }}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const sit = situacao(l)
                  return (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="mono" style={{ padding: '6px 8px' }}>{l.codigo}</td>
                      <td style={{ padding: '6px 8px' }}>{l.descricao || '—'}</td>
                      <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {l.preco_vista != null ? brl(l.preco_vista) : '—'}
                      </td>
                      <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {l.margem_vista != null ? numero(l.margem_vista, 1) + '%' : '—'}
                      </td>
                      <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {l.preco_prazo != null ? brl(l.preco_prazo) : '—'}
                      </td>
                      <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {l.margem_prazo != null ? numero(l.margem_prazo, 1) + '%' : '—'}
                      </td>
                      <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {l.estoque != null ? numero(l.estoque) : '—'}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <span className={badgeSit(sit)}>{sit}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="row mt">
            <button className="btn btn-outline" onClick={onClose} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn btn-verde" onClick={confirmar} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Confirmar atualização'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
