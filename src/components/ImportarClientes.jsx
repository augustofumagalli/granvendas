import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { soDigitos, formataCpfCnpj } from '../lib/format'

// remove acentos + minúsculas para comparar cabeçalhos
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()

// Campos que a planilha pode ter (em qualquer ordem).
// nome_fantasia vem antes de razao_social para "Nome Fantasia" não cair em "nome".
const CAMPOS = ['cnpj', 'nome_fantasia', 'razao_social', 'telefone', 'email', 'logradouro', 'numero', 'bairro', 'municipio', 'uf', 'cep']

const ROTULO = {
  cnpj: 'CNPJ/CPF',
  razao_social: 'Razão social',
  nome_fantasia: 'Nome fantasia',
  telefone: 'Telefone',
  email: 'E-mail',
  logradouro: 'Logradouro',
  numero: 'Número',
  bairro: 'Bairro',
  municipio: 'Município',
  uf: 'UF',
  cep: 'CEP',
}

// candidatos por coluna (já sem acento). Mais específico primeiro.
const CAND = {
  cnpj: ['cnpj', 'cpf/cnpj', 'cpf cnpj', 'cgc', 'documento'],
  nome_fantasia: ['fantasia', 'apelido'],
  razao_social: ['razao social', 'razao', 'cliente', 'nome'],
  telefone: ['telefone', 'fone', 'celular', 'contato'],
  email: ['e-mail', 'email'],
  logradouro: ['logradouro', 'endereco', 'rua'],
  numero: ['numero', 'num.'],
  bairro: ['bairro'],
  municipio: ['municipio', 'cidade'],
  uf: ['uf', 'estado'],
  cep: ['cep'],
}

const idxVazio = () => CAMPOS.reduce((o, k) => ((o[k] = -1), o), {})

function detectarColunas(cab) {
  const idx = idxVazio()
  cab.forEach((c, i) => {
    const n = norm(c)
    if (!n) return
    for (const key of CAMPOS) {
      if (idx[key] === -1 && CAND[key].some((t) => n === t || n.includes(t))) { idx[key] = i; break }
    }
  })
  return idx
}

// reconhece o cabeçalho se achou CNPJ e um nome (razão social ou fantasia)
const reconheceu = (idx) => idx.cnpj >= 0 && (idx.razao_social >= 0 || idx.nome_fantasia >= 0)

function montarLinhas(matriz, idx) {
  const out = []
  let semCnpj = 0
  const col = (row, key) => (idx[key] >= 0 ? String(row[idx[key]] ?? '').trim() : '')
  for (let r = 1; r < matriz.length; r++) {
    const row = matriz[r]
    if (!row) continue
    const razao = col(row, 'razao_social')
    const fantasia = col(row, 'nome_fantasia')
    if (!razao && !fantasia) continue
    const cnpj = soDigitos(col(row, 'cnpj'))
    if (cnpj.length !== 14 && cnpj.length !== 11) { semCnpj++; continue }
    out.push({
      cnpj,
      razao_social: razao || fantasia,
      nome_fantasia: fantasia || null,
      telefone: soDigitos(col(row, 'telefone')) || null,
      email: col(row, 'email') || null,
      logradouro: col(row, 'logradouro') || null,
      numero: col(row, 'numero') || null,
      bairro: col(row, 'bairro') || null,
      municipio: col(row, 'municipio') || null,
      uf: col(row, 'uf').toUpperCase().slice(0, 2) || null,
      cep: soDigitos(col(row, 'cep')) || null,
    })
  }
  return { linhas: out, semCnpj }
}

// campos comparados/atualizados no cliente existente
const CAMPOS_DADOS = ['razao_social', 'nome_fantasia', 'telefone', 'email', 'logradouro', 'numero', 'bairro', 'municipio', 'uf', 'cep']

export default function ImportarClientes({ onClose, onConcluido }) {
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
  const [semCnpj, setSemCnpj] = useState(0)
  const [mapaClientes, setMapaClientes] = useState({}) // cnpj -> cliente existente

  useEffect(() => {
    supabase
      .from('clientes')
      .select('cnpj,razao_social,nome_fantasia,telefone,email,logradouro,numero,bairro,municipio,uf,cep')
      .then(({ data }) => {
        const m = {}
        ;(data || []).forEach((c) => {
          const d = soDigitos(c.cnpj)
          if (d) m[d] = c
        })
        setMapaClientes(m)
      })
  }, [])

  function resetar() {
    setMatriz(null)
    setCabecalho([])
    setMapCol(idxVazio())
    setPrecisaMapear(false)
    setLinhas([])
    setSemCnpj(0)
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
      const { linhas: ls, semCnpj: sc } = montarLinhas(mat, idx)
      if (!ls.length) throw new Error('Colunas reconhecidas, mas nenhuma linha com CNPJ válido.')
      setLinhas(ls)
      setSemCnpj(sc)
      setPrecisaMapear(false)
    } else {
      // não reconheceu -> deixa o usuário mapear (já pré-preenchido com o que detectou)
      setPrecisaMapear(true)
      setLinhas([])
    }
  }

  async function aoSelecionar(e) {
    const file = e.target.files?.[0]
    if (!file) return
    resetar()
    setNomeArquivo(file.name)
    setCarregando(true)
    try {
      await lerExcel(file)
    } catch (err) {
      toast('Erro ao ler arquivo: ' + (err.message || err))
      resetar()
      setNomeArquivo('')
    } finally {
      setCarregando(false)
    }
  }

  function aplicarMapeamento() {
    if (mapCol.cnpj < 0 || (mapCol.razao_social < 0 && mapCol.nome_fantasia < 0)) {
      toast('Selecione ao menos o CNPJ e um nome (razão social ou fantasia).')
      return
    }
    const { linhas: ls, semCnpj: sc } = montarLinhas(matriz, mapCol)
    if (!ls.length) {
      toast('Nenhuma linha com CNPJ válido nesse mapeamento.')
      return
    }
    setLinhas(ls)
    setSemCnpj(sc)
    setPrecisaMapear(false)
  }

  function situacao(l) {
    const ex = mapaClientes[l.cnpj]
    if (!ex) return 'Novo'
    const mudou = CAMPOS_DADOS.some((k) => l[k] != null && String(l[k]) !== String(ex[k] ?? ''))
    return mudou ? 'Atualiza' : 'Sem mudança'
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
      const novos = []
      const atualizar = []
      linhas.forEach((l) => {
        const ex = mapaClientes[l.cnpj]
        if (!ex) {
          novos.push({ ...l, criado_por: user.id })
        } else if (situacao(l) === 'Atualiza') {
          // campo vazio na planilha não apaga o que já existe no app
          const reg = { cnpj: l.cnpj }
          CAMPOS_DADOS.forEach((k) => { reg[k] = l[k] ?? ex[k] ?? null })
          atualizar.push(reg)
        }
      })

      if (novos.length) {
        const { error } = await supabase.from('clientes').insert(novos)
        if (error) throw error
      }
      if (atualizar.length) {
        const { error } = await supabase.from('clientes').upsert(atualizar, { onConflict: 'cnpj' })
        if (error) throw error
      }

      toast(`${atualizar.length} atualizados, ${novos.length} novos`)
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
        <label>Arquivo (Excel ou CSV exportado do sistema)</label>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={aoSelecionar} />
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
            <p className="section-title" style={{ margin: 0 }}>Pré-visualização ({linhas.length} clientes)</p>
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
          {semCnpj > 0 && (
            <p className="muted mb" style={{ fontSize: 12 }}>
              ⚠️ {semCnpj} linha(s) ignorada(s) por CNPJ/CPF ausente ou inválido.
            </p>
          )}
          <div style={{ overflowX: 'auto', maxHeight: '40vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px' }}>CNPJ</th>
                  <th style={{ padding: '6px 8px' }}>Razão social</th>
                  <th style={{ padding: '6px 8px' }}>Fantasia</th>
                  <th style={{ padding: '6px 8px' }}>Município/UF</th>
                  <th style={{ padding: '6px 8px' }}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const sit = situacao(l)
                  return (
                    <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="mono" style={{ padding: '6px 8px' }}>{formataCpfCnpj(l.cnpj)}</td>
                      <td style={{ padding: '6px 8px' }}>{l.razao_social}</td>
                      <td style={{ padding: '6px 8px' }}>{l.nome_fantasia || '—'}</td>
                      <td style={{ padding: '6px 8px' }}>{l.municipio || '—'}{l.uf ? `/${l.uf}` : ''}</td>
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
              {salvando ? 'Salvando...' : 'Confirmar importação'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
