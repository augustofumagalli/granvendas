import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import { brl, numero, data, soDigitos } from '../lib/format'

const STATUS_FILTROS = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'rascunho', label: 'Rascunho' },
  { valor: 'enviado', label: 'Enviado' },
  { valor: 'fechado', label: 'Fechado' },
  { valor: 'perdido', label: 'Perdido' },
]

const BADGE_STATUS = {
  rascunho: 'badge-cinza',
  enviado: 'badge-azul',
  fechado: 'badge-verde',
  perdido: 'badge-erro',
}

export default function Orcamentos() {
  const { user, perfil } = useAuth()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [orcamentos, setOrcamentos] = useState([])
  const [filtro, setFiltro] = useState('todos')

  const [clientes, setClientes] = useState([])
  const [produtos, setProdutos] = useState([])
  const [condicoes, setCondicoes] = useState([])

  const [modalNovo, setModalNovo] = useState(false)
  const [detalhe, setDetalhe] = useState(null)

  async function carregar() {
    if (!user) return
    setLoading(true)
    const { data: rows } = await supabase
      .from('orcamentos')
      .select('*')
      .eq('perfil_id', user.id)
      .order('criado_em', { ascending: false })
    setOrcamentos(rows || [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function carregarAuxiliares() {
    const [rCli, rProd, rCond] = await Promise.all([
      supabase.from('clientes').select('*').order('razao_social', { ascending: true }),
      supabase.from('produtos').select('*').eq('ativo', true).order('descricao', { ascending: true }),
      supabase.from('condicoes_pagamento').select('*').eq('ativo', true).order('criado_em', { ascending: true }),
    ])
    setClientes(rCli.data || [])
    setProdutos(rProd.data || [])
    setCondicoes(rCond.data || [])
  }

  function abrirNovo() {
    carregarAuxiliares()
    setModalNovo(true)
  }

  const lista =
    filtro === 'todos' ? orcamentos : orcamentos.filter((o) => o.status === filtro)

  return (
    <div>
      <div className="between mb">
        <div className="section-title">Orçamentos</div>
        <button className="btn btn-azul btn-sm" onClick={abrirNovo}>+ Novo orçamento</button>
      </div>

      <div className="row mb" style={{ flexWrap: 'wrap' }}>
        {STATUS_FILTROS.map((f) => (
          <button
            key={f.valor}
            className={'badge ' + (filtro === f.valor ? 'badge-azul' : 'badge-cinza')}
            onClick={() => setFiltro(f.valor)}
            style={{ cursor: 'pointer', border: 'none' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="center"><div className="spin" /></div>
      ) : lista.length === 0 ? (
        <div className="empty">Nenhum orçamento por aqui.</div>
      ) : (
        lista.map((o) => (
          <div
            key={o.id}
            className="list-item"
            onClick={() => setDetalhe(o)}
            style={{ cursor: 'pointer' }}
          >
            <div className="grow">
              <div className="title">Nº{o.numero} · {o.cliente_nome || 'Cliente'}</div>
              <div className="sub">
                {data(o.criado_em)}{' '}
                <span className={'badge ' + (BADGE_STATUS[o.status] || 'badge-cinza')}>
                  {o.status}
                </span>
              </div>
            </div>
            <div className="mono">{brl(o.total)}</div>
          </div>
        ))
      )}

      {modalNovo && (
        <ModalNovo
          user={user}
          clientes={clientes}
          produtos={produtos}
          condicoes={condicoes}
          toast={toast}
          onClose={() => setModalNovo(false)}
          onSalvo={() => { setModalNovo(false); carregar() }}
        />
      )}

      {detalhe && (
        <ModalDetalhe
          orcamento={detalhe}
          vendedor={perfil}
          toast={toast}
          onClose={() => setDetalhe(null)}
          onMudou={() => { carregar() }}
        />
      )}
    </div>
  )
}

function ModalNovo({ user, clientes, produtos, condicoes, toast, onClose, onSalvo }) {
  const [clienteId, setClienteId] = useState('')
  const [itens, setItens] = useState([])
  const [observacao, setObservacao] = useState('')
  const [validadeDias, setValidadeDias] = useState(7)
  const [condicaoPagamento, setCondicaoPagamento] = useState('')
  const [salvando, setSalvando] = useState(false)

  // form de item
  const [produtoId, setProdutoId] = useState('')
  const [qtd, setQtd] = useState(1)
  const [preco, setPreco] = useState(0)

  function aoEscolherProduto(id) {
    setProdutoId(id)
    const p = produtos.find((x) => x.id === id)
    setPreco(p ? Number(p.preco) || 0 : 0)
    setQtd(1)
  }

  function adicionarItem() {
    const p = produtos.find((x) => x.id === produtoId)
    if (!p) { toast('Selecione um produto'); return }
    const quantidade = Number(qtd) || 0
    const precoUnit = Number(preco) || 0
    if (quantidade <= 0) { toast('Quantidade inválida'); return }
    const subtotal = quantidade * precoUnit
    setItens((atual) => [
      ...atual,
      {
        produto_id: p.id,
        descricao: p.descricao,
        quantidade,
        preco_unit: precoUnit,
        subtotal,
      },
    ])
    setProdutoId('')
    setQtd(1)
    setPreco(0)
  }

  function removerItem(i) {
    setItens((atual) => atual.filter((_, idx) => idx !== i))
  }

  const total = itens.reduce((s, it) => s + (Number(it.subtotal) || 0), 0)

  async function salvar() {
    if (!clienteId) { toast('Selecione um cliente'); return }
    if (itens.length === 0) { toast('Adicione ao menos um item'); return }
    setSalvando(true)
    const cliente = clientes.find((c) => c.id === clienteId)
    const clienteNome = cliente?.razao_social || cliente?.nome_fantasia || 'Cliente'

    const { data: orc, error } = await supabase
      .from('orcamentos')
      .insert({
        status: 'rascunho',
        total,
        perfil_id: user.id,
        cliente_id: clienteId,
        cliente_nome: clienteNome,
        observacao,
        validade_dias: Number(validadeDias) || 7,
        condicao_pagamento: condicaoPagamento || null,
      })
      .select()
      .single()

    if (error || !orc) {
      setSalvando(false)
      toast('Erro ao salvar orçamento')
      return
    }

    const linhas = itens.map((it) => ({
      orcamento_id: orc.id,
      produto_id: it.produto_id,
      descricao: it.descricao,
      quantidade: it.quantidade,
      preco_unit: it.preco_unit,
      subtotal: it.subtotal,
    }))
    const { error: errItens } = await supabase.from('orcamento_itens').insert(linhas)

    setSalvando(false)
    if (errItens) {
      toast('Orçamento salvo, mas houve erro nos itens')
    } else {
      toast('Orçamento criado')
    }
    onSalvo()
  }

  return (
    <Modal titulo="Novo orçamento" onClose={onClose}>
      <div className="field">
        <label>Cliente</label>
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">Selecione…</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razao_social || c.nome_fantasia || 'Cliente'}
            </option>
          ))}
        </select>
      </div>

      <div className="section-title mt">Itens</div>

      <div className="field">
        <label>Produto</label>
        <select value={produtoId} onChange={(e) => aoEscolherProduto(e.target.value)}>
          <option value="">Selecione…</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.descricao} — {brl(p.preco)}
            </option>
          ))}
        </select>
      </div>

      <div className="row">
        <div className="field grow">
          <label>Qtd</label>
          <input
            type="number"
            min="0"
            step="1"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
          />
        </div>
        <div className="field grow">
          <label>Preço unit.</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
          />
        </div>
      </div>

      <button className="btn btn-outline btn-sm mb" onClick={adicionarItem}>+ Adicionar item</button>

      {itens.length === 0 ? (
        <div className="empty">Nenhum item adicionado.</div>
      ) : (
        itens.map((it, i) => (
          <div key={i} className="list-item">
            <div className="grow">
              <div className="title">{it.descricao}</div>
              <div className="sub">
                {numero(it.quantidade)} × {brl(it.preco_unit)} = {brl(it.subtotal)}
              </div>
            </div>
            <button className="btn-ghost" onClick={() => removerItem(i)} aria-label="Remover">✕</button>
          </div>
        ))
      )}

      <div className="between mt mb">
        <span className="muted">Total</span>
        <span className="mono">{brl(total)}</span>
      </div>

      <div className="field">
        <label>Observação</label>
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
      </div>

      <div className="field">
        <label>Validade (dias)</label>
        <input
          type="number"
          min="1"
          value={validadeDias}
          onChange={(e) => setValidadeDias(e.target.value)}
        />
      </div>

      <div className="field">
        <label>Condição de pagamento</label>
        <select value={condicaoPagamento} onChange={(e) => setCondicaoPagamento(e.target.value)}>
          <option value="">— nenhuma —</option>
          {condicoes.map((c) => (
            <option key={c.id} value={c.nome}>{c.nome}</option>
          ))}
        </select>
        {condicoes.length === 0 && (
          <div className="muted mt">Cadastre condições em Configurações.</div>
        )}
      </div>

      <div className="row mt">
        <button className="btn btn-azul grow" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar orçamento'}
        </button>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalDetalhe({ orcamento, vendedor, toast, onClose, onMudou }) {
  const [itens, setItens] = useState([])
  const [cliente, setCliente] = useState(null)
  const [status, setStatus] = useState(orcamento.status)
  const [carregando, setCarregando] = useState(true)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true
    async function carregar() {
      setCarregando(true)
      const [rItens, rCli] = await Promise.all([
        supabase.from('orcamento_itens').select('*').eq('orcamento_id', orcamento.id),
        orcamento.cliente_id
          ? supabase.from('clientes').select('*').eq('id', orcamento.cliente_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!vivo) return
      setItens(rItens.data || [])
      setCliente(rCli.data || null)
      setCarregando(false)
    }
    carregar()
    return () => { vivo = false }
  }, [orcamento.id, orcamento.cliente_id])

  const total = Number(orcamento.total) || 0

  async function gerar() {
    const { gerarPdfOrcamento } = await import('../lib/pdf')
    return gerarPdfOrcamento({ ...orcamento, status }, itens, cliente, vendedor)
  }

  async function marcarStatus(novo, campoData) {
    const patch = { status: novo }
    if (campoData) patch[campoData] = new Date().toISOString()
    const { error } = await supabase.from('orcamentos').update(patch).eq('id', orcamento.id)
    if (error) { toast('Erro ao atualizar'); return false }
    setStatus(novo)
    orcamento.status = novo
    if (campoData) orcamento[campoData] = patch[campoData]
    onMudou()
    return true
  }

  async function enviarWhatsapp() {
    setOcupado(true)
    try {
      const pdf = await gerar()

      const resumoItens = itens
        .map((it) => `- ${it.descricao} (${numero(it.quantidade)}x ${brl(it.preco_unit)})`)
        .join('\n')
      const texto =
        `Olá ${orcamento.cliente_nome || 'cliente'}, segue orçamento Nº${orcamento.numero} ` +
        `no valor de ${brl(total)}.\n\nItens:\n${resumoItens}\n\n` +
        (orcamento.condicao_pagamento ? `Condição de pagamento: ${orcamento.condicao_pagamento}\n` : '') +
        `Válido por ${orcamento.validade_dias ?? 7} dias.`

      // Preferência: compartilhamento nativo (anexa o PDF direto no WhatsApp)
      const arquivo = new File([pdf.blob], pdf.nomeArquivo, { type: 'application/pdf' })
      let enviado = false
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], text: texto })
          enviado = true
        } catch (e) {
          if (e?.name === 'AbortError') { setOcupado(false); return } // usuário cancelou
          // outro erro -> cai no fallback abaixo
        }
      }

      // Fallback (desktop ou sem share): baixa o PDF e abre o WhatsApp com o texto
      if (!enviado) {
        pdf.baixar()
        const tel = soDigitos(cliente?.telefone)
        const url = tel
          ? `https://wa.me/55${tel}?text=${encodeURIComponent(texto)}`
          : `https://wa.me/?text=${encodeURIComponent(texto)}`
        window.open(url, '_blank')
      }

      // Marca como enviado por último — a página ainda está viva aqui, então o status é gravado.
      if (status !== 'enviado' && status !== 'fechado') {
        await marcarStatus('enviado', 'enviado_em')
      }
    } catch {
      toast('Erro ao enviar')
    }
    setOcupado(false)
  }

  return (
    <Modal titulo={`Nº${orcamento.numero} · ${orcamento.cliente_nome || 'Cliente'}`} onClose={onClose}>
      <div className="between mb">
        <span className="muted">{data(orcamento.criado_em)}</span>
        <span className={'badge ' + (BADGE_STATUS[status] || 'badge-cinza')}>{status}</span>
      </div>

      {carregando ? (
        <div className="center"><div className="spin" /></div>
      ) : (
        <>
          {itens.length === 0 ? (
            <div className="empty">Sem itens.</div>
          ) : (
            itens.map((it) => (
              <div key={it.id} className="list-item">
                <div className="grow">
                  <div className="title">{it.descricao}</div>
                  <div className="sub">{numero(it.quantidade)} × {brl(it.preco_unit)}</div>
                </div>
                <div className="mono">{brl(it.subtotal)}</div>
              </div>
            ))
          )}

          <div className="between mt mb">
            <span className="muted">Total</span>
            <span className="mono">{brl(total)}</span>
          </div>

          {orcamento.condicao_pagamento && (
            <div className="between mb">
              <span className="muted">Condição de pagamento</span>
              <span>{orcamento.condicao_pagamento}</span>
            </div>
          )}

          <div className="row mb">
            <button className="btn btn-verde grow" onClick={enviarWhatsapp} disabled={ocupado}>
              {ocupado ? <span className="spin" /> : '🟢 Enviar por WhatsApp'}
            </button>
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button
              className="btn btn-verde grow"
              onClick={() => marcarStatus('fechado', 'fechado_em')}
              disabled={ocupado || status === 'fechado'}
            >
              ✔ Marcar fechado
            </button>
            <button
              className="btn btn-outline grow"
              onClick={() => marcarStatus('perdido', null)}
              disabled={ocupado || status === 'perdido'}
            >
              ✖ Perdido
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
