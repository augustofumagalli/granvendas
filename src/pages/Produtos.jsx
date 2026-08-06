import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import ImportarPrecos from '../components/ImportarPrecos'
import { brl, numero } from '../lib/format'

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')

export default function Produtos() {
  const toast = useToast()

  const [produtos, setProdutos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')

  const [sel, setSel] = useState(null) // produto em edição
  const [editForm, setEditForm] = useState({ preco_vista: '', preco_prazo: '', margem: '', estoque: '' })
  const [salvando, setSalvando] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [showNovo, setShowNovo] = useState(false)
  const [novo, setNovo] = useState({ codigo: '', descricao: '', unidade: '', preco_vista: '', preco_prazo: '', margem: '', estoque: '' })

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase.from('produtos').select('*').order('descricao')
    if (error) toast('Erro ao carregar produtos: ' + error.message)
    setProdutos(data || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const filtrados = useMemo(() => {
    const b = norm(busca).trim()
    if (!b) return produtos
    return produtos.filter(
      (p) => norm(p.descricao).includes(b) || norm(p.codigo).includes(b)
    )
  }, [produtos, busca])

  function abrirEdicao(p) {
    setSel(p)
    setEditForm({
      preco_vista: p.preco_vista ?? p.preco ?? '',
      preco_prazo: p.preco_prazo ?? '',
      margem: p.margem ?? '',
      estoque: p.estoque ?? '',
    })
  }

  async function salvarEdicao() {
    if (!sel) return
    setSalvando(true)
    const vista = editForm.preco_vista === '' ? null : Number(editForm.preco_vista)
    const prazo = editForm.preco_prazo === '' ? null : Number(editForm.preco_prazo)
    const { error } = await supabase
      .from('produtos')
      .update({
        // preço principal (usado nos orçamentos) segue o à vista
        preco: vista ?? prazo ?? 0,
        preco_vista: vista,
        preco_prazo: prazo,
        margem: editForm.margem === '' ? null : Number(editForm.margem),
        estoque: Number(editForm.estoque) || 0,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', sel.id)
    setSalvando(false)
    if (error) {
      toast('Erro ao salvar: ' + error.message)
      return
    }
    toast('Produto atualizado')
    setSel(null)
    carregar()
  }

  async function criarProduto() {
    if (!novo.codigo.trim() || !novo.descricao.trim()) {
      toast('Preencha código e descrição.')
      return
    }
    setSalvando(true)
    const vista = novo.preco_vista === '' ? null : Number(novo.preco_vista)
    const prazo = novo.preco_prazo === '' ? null : Number(novo.preco_prazo)
    const { error } = await supabase.from('produtos').insert({
      codigo: novo.codigo.trim(),
      descricao: novo.descricao.trim(),
      unidade: novo.unidade.trim() || null,
      preco: vista ?? prazo ?? 0,
      preco_vista: vista,
      preco_prazo: prazo,
      margem: novo.margem === '' ? null : Number(novo.margem),
      estoque: Number(novo.estoque) || 0,
      atualizado_em: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) {
      toast('Erro ao criar produto: ' + error.message)
      return
    }
    toast('Produto criado')
    setShowNovo(false)
    setNovo({ codigo: '', descricao: '', unidade: '', preco_vista: '', preco_prazo: '', margem: '', estoque: '' })
    carregar()
  }

  return (
    <div>
      <div className="between mb">
        <h1 className="section-title">Produtos</h1>
        <div className="flex" style={{ gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>
            ⬆ Importar preços
          </button>
          <button className="btn btn-azul btn-sm" onClick={() => setShowNovo(true)}>
            + Novo produto
          </button>
        </div>
      </div>

      <div className="field">
        <input
          type="search"
          placeholder="Buscar por descrição ou código..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="card">
        {carregando ? (
          <p className="center muted">
            <span className="spin" /> Carregando...
          </p>
        ) : filtrados.length === 0 ? (
          <div className="empty">
            {busca ? 'Nenhum produto encontrado para a busca.' : 'Nenhum produto cadastrado ainda.'}
          </div>
        ) : (
          filtrados.map((p) => (
            <div key={p.id} className="list-item" onClick={() => abrirEdicao(p)} style={{ cursor: 'pointer' }}>
              <div className="grow">
                <div className="title">{p.descricao}</div>
                <div className="sub">
                  Cód: {p.codigo} · Estoque: {numero(p.estoque)} {p.unidade || ''}
                  {p.margem != null ? ` · MG ${numero(p.margem, 1)}%` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="mono" style={{ color: '#173D5C', fontWeight: 700 }}>
                  {brl(p.preco_vista ?? p.preco)}
                </div>
                {p.preco_prazo != null && (
                  <div className="mono muted" style={{ fontSize: 12 }}>
                    {brl(p.preco_prazo)} a prazo
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {sel && (
        <Modal titulo={sel.descricao} onClose={() => setSel(null)}>
          <p className="muted mb">Cód: {sel.codigo}</p>
          <div className="row">
            <div className="field">
              <label>Preço à vista (R$)</label>
              <input
                type="number"
                step="0.01"
                value={editForm.preco_vista}
                onChange={(e) => setEditForm({ ...editForm, preco_vista: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Preço a prazo (R$)</label>
              <input
                type="number"
                step="0.01"
                value={editForm.preco_prazo}
                onChange={(e) => setEditForm({ ...editForm, preco_prazo: e.target.value })}
              />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Margem (MG %)</label>
              <input
                type="number"
                step="0.01"
                value={editForm.margem}
                onChange={(e) => setEditForm({ ...editForm, margem: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Estoque</label>
              <input
                type="number"
                step="1"
                value={editForm.estoque}
                onChange={(e) => setEditForm({ ...editForm, estoque: e.target.value })}
              />
            </div>
          </div>
          <div className="row mt">
            <button className="btn btn-outline" onClick={() => setSel(null)} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn btn-verde" onClick={salvarEdicao} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {showNovo && (
        <Modal titulo="Novo produto" onClose={() => setShowNovo(false)}>
          <div className="field">
            <label>Código</label>
            <input value={novo.codigo} onChange={(e) => setNovo({ ...novo, codigo: e.target.value })} />
          </div>
          <div className="field">
            <label>Descrição</label>
            <input value={novo.descricao} onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
          </div>
          <div className="row">
            <div className="field">
              <label>Unidade</label>
              <input placeholder="UN, PC, M..." value={novo.unidade} onChange={(e) => setNovo({ ...novo, unidade: e.target.value })} />
            </div>
            <div className="field">
              <label>Preço à vista (R$)</label>
              <input type="number" step="0.01" value={novo.preco_vista} onChange={(e) => setNovo({ ...novo, preco_vista: e.target.value })} />
            </div>
            <div className="field">
              <label>Preço a prazo (R$)</label>
              <input type="number" step="0.01" value={novo.preco_prazo} onChange={(e) => setNovo({ ...novo, preco_prazo: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Margem (MG %)</label>
              <input type="number" step="0.01" value={novo.margem} onChange={(e) => setNovo({ ...novo, margem: e.target.value })} />
            </div>
            <div className="field">
              <label>Estoque</label>
              <input type="number" step="1" value={novo.estoque} onChange={(e) => setNovo({ ...novo, estoque: e.target.value })} />
            </div>
          </div>
          <div className="row mt">
            <button className="btn btn-outline" onClick={() => setShowNovo(false)} disabled={salvando}>
              Cancelar
            </button>
            <button className="btn btn-verde" onClick={criarProduto} disabled={salvando}>
              {salvando ? 'Salvando...' : 'Criar'}
            </button>
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal titulo="Importar preços" onClose={() => setShowImport(false)}>
          <ImportarPrecos
            onClose={() => setShowImport(false)}
            onConcluido={() => {
              setShowImport(false)
              carregar()
            }}
          />
        </Modal>
      )}
    </div>
  )
}
