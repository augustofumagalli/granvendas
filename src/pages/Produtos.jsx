import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import ImportarPrecos from '../components/ImportarPrecos'
import { brl, numero, curingaParaIlike } from '../lib/format'

const LIMITE_LISTA = 100

export default function Produtos() {
  const toast = useToast()

  const [produtos, setProdutos] = useState([])
  const [total, setTotal] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')

  const [sel, setSel] = useState(null) // produto em edição
  const [editForm, setEditForm] = useState({ preco_vista: '', preco_prazo: '', margem_vista: '', margem_prazo: '' })
  const [salvando, setSalvando] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [showNovo, setShowNovo] = useState(false)
  const [novo, setNovo] = useState({ codigo: '', descricao: '', unidade: '', preco_vista: '', preco_prazo: '', margem_vista: '', margem_prazo: '' })

  // Busca feita no servidor (o Supabase devolve no máximo 1000 linhas por consulta,
  // então com o catálogo inteiro não dá para filtrar só no navegador).
  async function carregar(termo = busca) {
    setCarregando(true)
    let q = supabase.from('produtos').select('*', { count: 'exact' }).order('descricao').limit(LIMITE_LISTA)
    const padrao = curingaParaIlike(termo)
    if (padrao) q = q.or(`descricao.ilike."${padrao}",codigo.ilike."${padrao}"`)
    const { data, count, error } = await q
    if (error) toast('Erro ao carregar produtos: ' + error.message)
    setProdutos(data || [])
    setTotal(count ?? null)
    setCarregando(false)
  }

  useEffect(() => {
    const t = setTimeout(() => carregar(busca), 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const filtrados = produtos

  function abrirEdicao(p) {
    setSel(p)
    setEditForm({
      preco_vista: p.preco_vista ?? p.preco ?? '',
      preco_prazo: p.preco_prazo ?? '',
      margem_vista: p.margem_vista ?? '',
      margem_prazo: p.margem_prazo ?? '',
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
        margem_vista: editForm.margem_vista === '' ? null : Number(editForm.margem_vista),
        margem_prazo: editForm.margem_prazo === '' ? null : Number(editForm.margem_prazo),
        // estoque não é editável no app: vem só da sincronização com o SiSCom
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
      margem_vista: novo.margem_vista === '' ? null : Number(novo.margem_vista),
      margem_prazo: novo.margem_prazo === '' ? null : Number(novo.margem_prazo),
      estoque: 0,
      atualizado_em: new Date().toISOString(),
    })
    setSalvando(false)
    if (error) {
      toast('Erro ao criar produto: ' + error.message)
      return
    }
    toast('Produto criado')
    setShowNovo(false)
    setNovo({ codigo: '', descricao: '', unidade: '', preco_vista: '', preco_prazo: '', margem_vista: '', margem_prazo: '' })
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
          placeholder="Buscar por descrição ou código (use % como curinga, ex.: tubo%inox%50)"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {total != null && (
          <div className="muted mt" style={{ fontSize: 12 }}>
            {total > filtrados.length
              ? `Mostrando ${filtrados.length} de ${numero(total)} — refine a busca para ver os demais.`
              : `${numero(total)} produto(s)`}
          </div>
        )}
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
                  {p.margem_vista != null ? ` · MG vista ${numero(p.margem_vista, 1)}%` : ''}
                  {p.margem_prazo != null ? ` · MG prazo ${numero(p.margem_prazo, 1)}%` : ''}
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
                {p.preco_revenda_vista != null && (
                  <div className="mono muted" style={{ fontSize: 12 }}>
                    Rev.: {brl(p.preco_revenda_vista)}
                    {p.preco_revenda_prazo != null ? ` / ${brl(p.preco_revenda_prazo)}` : ''}
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
              <label>Margem à vista (MG %)</label>
              <input
                type="number"
                step="0.01"
                value={editForm.margem_vista}
                onChange={(e) => setEditForm({ ...editForm, margem_vista: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Margem a prazo (MG %)</label>
              <input
                type="number"
                step="0.01"
                value={editForm.margem_prazo}
                onChange={(e) => setEditForm({ ...editForm, margem_prazo: e.target.value })}
              />
            </div>
          </div>
          <div className="muted mt">
            Estoque: {numero(sel.estoque)} {sel.unidade || ''} · sincronizado do SiSCom (não editável aqui)
          </div>
          {(sel.preco_revenda_vista != null || sel.preco_revenda_prazo != null) && (
            <div className="muted mt">
              Revenda (piso p/ desconto): {sel.preco_revenda_vista != null ? brl(sel.preco_revenda_vista) + ' à vista' : '—'}
              {sel.preco_revenda_prazo != null ? ` · ${brl(sel.preco_revenda_prazo)} a prazo` : ''}
            </div>
          )}
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
              <label>Margem à vista (MG %)</label>
              <input type="number" step="0.01" value={novo.margem_vista} onChange={(e) => setNovo({ ...novo, margem_vista: e.target.value })} />
            </div>
            <div className="field">
              <label>Margem a prazo (MG %)</label>
              <input type="number" step="0.01" value={novo.margem_prazo} onChange={(e) => setNovo({ ...novo, margem_prazo: e.target.value })} />
            </div>
          </div>
          <div className="muted mt">Estoque entra pela sincronização com o SiSCom.</div>
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
