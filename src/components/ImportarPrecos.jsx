import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { brl } from '../lib/format'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

// remove acentos + minúsculas para comparar cabeçalhos
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

// candidatos por tipo de coluna (já sem acento)
const CAND = {
  codigo: ['codigo', 'cod', 'sku', 'referencia', 'ref'],
  descricao: ['descricao', 'produto', 'item', 'nome'],
  preco: ['preco venda', 'valor unitario', 'preco unitario', 'preco', 'valor'],
}

// converte preço BR (ou número) -> Number
function parsePreco(v) {
  if (v == null || v === '') return NaN
  if (typeof v === 'number') return v
  let s = String(v).trim().replace(/r\$/i, '').replace(/\s/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  return parseFloat(s)
}

function detectarColunas(cab) {
  const idx = { codigo: -1, descricao: -1, preco: -1 }
  cab.forEach((c, i) => {
    const n = norm(c)
    if (!n) return
    for (const key of Object.keys(CAND)) {
      if (idx[key] === -1 && CAND[key].some((t) => n === t || n.includes(t))) idx[key] = i
    }
  })
  return idx
}

function montarLinhas(matriz, idx) {
  const out = []
  for (let r = 1; r < matriz.length; r++) {
    const row = matriz[r]
    if (!row) continue
    const codigo = idx.codigo >= 0 ? String(row[idx.codigo] ?? '').trim() : ''
    const descricao = idx.descricao >= 0 ? String(row[idx.descricao] ?? '').trim() : ''
    const preco = idx.preco >= 0 ? parsePreco(row[idx.preco]) : NaN
    if (!codigo) continue
    out.push({ codigo, descricao, preco: isNaN(preco) ? 0 : preco })
  }
  return out
}

export default function ImportarPrecos({ onClose, onConcluido }) {
  const { user } = useAuth()
  const toast = useToast()

  const [nomeArquivo, setNomeArquivo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const [matriz, setMatriz] = useState(null) // guardada quando precisa mapear manualmente
  const [cabecalho, setCabecalho] = useState([])
  const [mapCol, setMapCol] = useState({ codigo: -1, descricao: -1, preco: -1 })
  const [precisaMapear, setPrecisaMapear] = useState(false)

  const [linhas, setLinhas] = useState([])
  const [mapaProdutos, setMapaProdutos] = useState({}) // codigo -> { preco, descricao }

  useEffect(() => {
    supabase
      .from('produtos')
      .select('codigo,preco,descricao')
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
    setMapCol({ codigo: -1, descricao: -1, preco: -1 })
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
    if (idx.codigo >= 0 && idx.preco >= 0) {
      const ls = montarLinhas(mat, idx)
      if (!ls.length) throw new Error('Colunas encontradas, mas nenhuma linha válida.')
      setMapCol(idx)
      setLinhas(ls)
      setPrecisaMapear(false)
    } else {
      // não reconheceu -> deixa o usuário mapear
      setMapCol(idx)
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
      const preco = parsePreco(mPreco[1])
      if (isNaN(preco)) return
      const mCod = texto.match(reCodigo)
      const codigo = mCod ? mCod[1] : ''
      if (!codigo) return
      let descricao = texto.replace(mPreco[0], '')
      if (mCod) descricao = descricao.replace(mCod[0], '')
      descricao = descricao.replace(/\s+/g, ' ').trim()
      out.push({ codigo, descricao, preco })
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
    if (mapCol.codigo < 0 || mapCol.preco < 0) {
      toast('Selecione ao menos as colunas de código e preço.')
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
          <p className="section-title">Não reconheci o cabeçalho — indique as colunas:</p>
          <div className="row">
            <div className="field">
              <label>Código</label>
              <select value={mapCol.codigo} onChange={(e) => setMapCol({ ...mapCol, codigo: Number(e.target.value) })}>
                <option value={-1}>—</option>
                {opcoesColuna}
              </select>
            </div>
            <div className="field">
              <label>Descrição</label>
              <select value={mapCol.descricao} onChange={(e) => setMapCol({ ...mapCol, descricao: Number(e.target.value) })}>
                <option value={-1}>—</option>
                {opcoesColuna}
              </select>
            </div>
            <div className="field">
              <label>Preço</label>
              <select value={mapCol.preco} onChange={(e) => setMapCol({ ...mapCol, preco: Number(e.target.value) })}>
                <option value={-1}>—</option>
                {opcoesColuna}
              </select>
            </div>
          </div>
          <button className="btn btn-azul" onClick={aplicarMapeamento}>
            Aplicar mapeamento
          </button>
        </div>
      )}

      {linhas.length > 0 && (
        <>
          <p className="section-title">Pré-visualização ({linhas.length} linhas)</p>
          <div style={{ overflowX: 'auto', maxHeight: '40vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>Código</th>
                  <th style={{ padding: '6px 8px' }}>Descrição</th>
                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>Preço</th>
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
                      <td className="mono" style={{ padding: '6px 8px', textAlign: 'right' }}>{brl(l.preco)}</td>
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
