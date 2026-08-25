import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import { brl, numero, data, soDigitos, curingaParaIlike, combinaCuringa, formataTelefone, formataCpfCnpj } from '../lib/format'

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
  const [condicoes, setCondicoes] = useState([])

  const [modalNovo, setModalNovo] = useState(false)
  const [editando, setEditando] = useState(null)
  const [detalhe, setDetalhe] = useState(null)

  async function carregar() {
    if (!user) return
    setLoading(true)
    // orçamentos são visíveis a toda a equipe (edição/exclusão: dono ou gestor)
    const { data: rows } = await supabase
      .from('orcamentos')
      .select('*')
      .order('criado_em', { ascending: false })
    setOrcamentos(rows || [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // recarrega ao voltar para o app (ex.: celular que ficou em segundo plano)
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') carregar()
    }
    window.addEventListener('focus', aoVoltar)
    document.addEventListener('visibilitychange', aoVoltar)
    return () => {
      window.removeEventListener('focus', aoVoltar)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // produtos não são pré-carregados: a busca é feita no servidor dentro do modal
  // (o Supabase devolve no máximo 1000 linhas, e o catálogo inteiro passa disso)
  async function carregarAuxiliares() {
    const [rCli, rCond] = await Promise.all([
      supabase.from('clientes').select('*').order('razao_social', { ascending: true }),
      supabase.from('condicoes_pagamento').select('*').eq('ativo', true).order('criado_em', { ascending: true }),
    ])
    setClientes(rCli.data || [])
    setCondicoes(rCond.data || [])
  }

  function abrirNovo() {
    carregarAuxiliares()
    setModalNovo(true)
  }

  function abrirEdicao(orc) {
    carregarAuxiliares()
    setDetalhe(null)
    setEditando(orc)
  }

  async function excluirOrcamento(o) {
    if (!window.confirm(`Excluir o orçamento Nº${o.numero}? Esta ação não pode ser desfeita.`)) return
    const { error } = await supabase.from('orcamentos').delete().eq('id', o.id)
    if (error) { toast('Erro ao excluir'); return }
    toast('Orçamento excluído')
    carregar()
  }

  const lista =
    filtro === 'todos' ? orcamentos : orcamentos.filter((o) => o.status === filtro)

  const podeGerir = (o) => o.perfil_id === user?.id || perfil?.papel === 'gestor'

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
                {data(o.criado_em)}
                {o.vendedor_nome ? ` · ${o.vendedor_nome}` : ''}{' '}
                <span className={'badge ' + (BADGE_STATUS[o.status] || 'badge-cinza')}>
                  {o.status}
                </span>
              </div>
            </div>
            <div className="mono">{brl(o.total)}</div>
            {podeGerir(o) && (
              <>
                <button
                  className="btn-ghost"
                  aria-label="Editar orçamento"
                  onClick={(e) => { e.stopPropagation(); abrirEdicao(o) }}
                >
                  ✏️
                </button>
                <button
                  className="btn-ghost"
                  aria-label="Excluir orçamento"
                  onClick={(e) => { e.stopPropagation(); excluirOrcamento(o) }}
                >
                  🗑
                </button>
              </>
            )}
          </div>
        ))
      )}

      {(modalNovo || editando) && (
        <ModalNovo
          user={user}
          perfil={perfil}
          clientes={clientes}
          condicoes={condicoes}
          orcamentoExistente={editando}
          recarregarAux={carregarAuxiliares}
          toast={toast}
          onClose={() => { setModalNovo(false); setEditando(null) }}
          onSalvo={() => { setModalNovo(false); setEditando(null); carregar() }}
        />
      )}

      {detalhe && (
        <ModalDetalhe
          orcamento={detalhe}
          vendedor={perfil}
          gerir={podeGerir(detalhe)}
          toast={toast}
          onEditar={abrirEdicao}
          onClose={() => setDetalhe(null)}
          onMudou={() => { carregar() }}
        />
      )}
    </div>
  )
}

function ModalNovo({ user, perfil, clientes, condicoes, orcamentoExistente, recarregarAux, toast, onClose, onSalvo }) {
  const edicao = !!orcamentoExistente
  const [clienteId, setClienteId] = useState(orcamentoExistente?.cliente_id || '')
  const [itens, setItens] = useState([])
  const [observacao, setObservacao] = useState(orcamentoExistente?.observacao || '')
  const [validadeDias, setValidadeDias] = useState(orcamentoExistente?.validade_dias ?? 7)
  const [condicaoPagamento, setCondicaoPagamento] = useState(orcamentoExistente?.condicao_pagamento || '')
  const [salvando, setSalvando] = useState(false)
  const [carregandoItens, setCarregandoItens] = useState(edicao)

  // clientes criados na hora via cadastro rápido
  const [clientesExtra, setClientesExtra] = useState([])
  const todosClientes = [...clientesExtra, ...clientes]

  // busca de cliente: digita para procurar (curinga % também vale)
  const [buscaCli, setBuscaCli] = useState('')

  // form de item — a busca de produto roda no servidor, com % como curinga
  const [buscaProd, setBuscaProd] = useState('')
  const [resultadosProd, setResultadosProd] = useState([])
  const [buscandoProd, setBuscandoProd] = useState(false)
  const [prodSel, setProdSel] = useState(null)
  const [qtd, setQtd] = useState(1)
  const [preco, setPreco] = useState(0)
  const [unidade, setUnidade] = useState('')

  useEffect(() => {
    const padrao = curingaParaIlike(buscaProd)
    if (!padrao) { setResultadosProd([]); setBuscandoProd(false); return }
    let vivo = true
    setBuscandoProd(true)
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('produtos')
        .select('id,codigo,descricao,unidade,preco,preco_vista,preco_prazo,margem_vista,margem_prazo,preco_revenda_vista,preco_revenda_prazo,margem_revenda_vista,margem_revenda_prazo,estoque')
        .eq('ativo', true)
        .or(`descricao.ilike."${padrao}",codigo.ilike."${padrao}"`)
        .order('descricao')
        .limit(50)
      if (!vivo) return
      setResultadosProd(data || [])
      setBuscandoProd(false)
    }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [buscaProd])

  // cadastro rápido
  const [novoCliente, setNovoCliente] = useState(false)
  const [novoProduto, setNovoProduto] = useState(false)

  // No modo edição, carrega os itens existentes
  useEffect(() => {
    if (!edicao) return
    let vivo = true
    supabase.from('orcamento_itens').select('*').eq('orcamento_id', orcamentoExistente.id)
      .then(({ data }) => {
        if (!vivo) return
        setItens((data || []).map((it) => ({
          produto_id: it.produto_id,
          descricao: it.descricao,
          unidade: it.unidade || '',
          quantidade: Number(it.quantidade) || 0,
          preco_unit: Number(it.preco_unit) || 0,
          subtotal: Number(it.subtotal) || 0,
        })))
        setCarregandoItens(false)
      })
    return () => { vivo = false }
  }, [edicao, orcamentoExistente])

  const clienteSel = todosClientes.find((c) => c.id === clienteId)
  const nomeClienteSel = clienteSel?.razao_social || clienteSel?.nome_fantasia || orcamentoExistente?.cliente_nome || ''
  const clientesFiltrados = buscaCli.trim()
    ? todosClientes
        .filter((c) => combinaCuringa(`${c.razao_social || ''} ${c.nome_fantasia || ''} ${c.cnpj || ''}`, buscaCli))
        .slice(0, 20)
    : []

  function escolherCliente(c) {
    setClienteId(c.id)
    setBuscaCli('')
  }

  function escolherProduto(p) {
    setProdSel(p)
    setPreco(Number(p.preco) || 0)
    setUnidade(p.unidade || '')
    setQtd(1)
    setBuscaProd('')
    setResultadosProd([])
  }

  function adicionarItem() {
    if (!prodSel) { toast('Selecione um produto'); return }
    const quantidade = Number(qtd) || 0
    const precoUnit = Number(preco) || 0
    if (quantidade <= 0) { toast('Quantidade inválida'); return }
    setItens((atual) => [
      ...atual,
      {
        produto_id: prodSel.id,
        descricao: prodSel.descricao,
        unidade: (unidade || prodSel.unidade || '').trim(),
        quantidade,
        preco_unit: precoUnit,
        subtotal: quantidade * precoUnit,
      },
    ])
    setProdSel(null); setQtd(1); setPreco(0); setUnidade('')
  }

  function removerItem(i) {
    setItens((atual) => atual.filter((_, idx) => idx !== i))
  }

  const total = itens.reduce((s, it) => s + (Number(it.subtotal) || 0), 0)

  async function salvar() {
    if (!clienteId) { toast('Selecione um cliente'); return }
    if (itens.length === 0) { toast('Adicione ao menos um item'); return }
    setSalvando(true)
    const clienteNome = nomeClienteSel || 'Cliente'
    const dadosOrc = {
      total,
      cliente_id: clienteId,
      cliente_nome: clienteNome,
      observacao,
      validade_dias: Number(validadeDias) || 7,
      condicao_pagamento: condicaoPagamento || null,
    }

    let orcId = orcamentoExistente?.id
    if (edicao) {
      const { error } = await supabase.from('orcamentos').update(dadosOrc).eq('id', orcId)
      if (error) { setSalvando(false); toast('Erro ao salvar orçamento'); return }
      await supabase.from('orcamento_itens').delete().eq('orcamento_id', orcId)
    } else {
      const { data: orc, error } = await supabase
        .from('orcamentos')
        .insert({ ...dadosOrc, status: 'rascunho', perfil_id: user.id, vendedor_nome: perfil?.nome || null })
        .select()
        .single()
      if (error || !orc) { setSalvando(false); toast('Erro ao salvar orçamento'); return }
      orcId = orc.id
    }

    const linhas = itens.map((it) => ({
      orcamento_id: orcId,
      produto_id: it.produto_id,
      descricao: it.descricao,
      unidade: it.unidade || null,
      quantidade: it.quantidade,
      preco_unit: it.preco_unit,
      subtotal: it.subtotal,
    }))
    const { error: errItens } = await supabase.from('orcamento_itens').insert(linhas)

    setSalvando(false)
    if (errItens) toast('Orçamento salvo, mas houve erro nos itens')
    else toast(edicao ? 'Orçamento atualizado' : 'Orçamento criado')
    onSalvo()
  }

  return (
    <Modal titulo={edicao ? `Editar orçamento Nº${orcamentoExistente.numero}` : 'Novo orçamento'} onClose={onClose}>
      <div className="field">
        <label>Cliente (digite para buscar)</label>
        {clienteId ? (
          <div className="list-item">
            <div className="grow">
              <div className="title">{nomeClienteSel || 'Cliente'}</div>
              {clienteSel?.cnpj && <div className="sub">{formataCpfCnpj(clienteSel.cnpj)}</div>}
            </div>
            <button className="btn-ghost" onClick={() => setClienteId('')} aria-label="Trocar cliente">✕</button>
          </div>
        ) : (
          <>
            <div className="row">
              <input
                className="grow"
                type="text"
                placeholder="Nome, fantasia ou CNPJ/CPF"
                value={buscaCli}
                onChange={(e) => setBuscaCli(e.target.value)}
              />
              <button className="btn btn-outline btn-sm" onClick={() => setNovoCliente(true)}>+ Novo</button>
            </div>
            {buscaCli.trim() && clientesFiltrados.length === 0 && (
              <div className="empty">Nenhum cliente encontrado.</div>
            )}
            {clientesFiltrados.map((c) => (
              <div key={c.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => escolherCliente(c)}>
                <div className="grow">
                  <div className="title">{c.razao_social || c.nome_fantasia || 'Cliente'}</div>
                  <div className="sub">
                    {c.municipio || ''}{c.uf ? `/${c.uf}` : ''}
                    {c.cnpj ? ` · ${formataCpfCnpj(c.cnpj)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="section-title mt">Itens</div>

      <div className="field">
        <label>Produto (digite para buscar; % é curinga)</label>
        {prodSel ? (
          <div className="list-item">
            <div className="grow">
              <div className="title">{prodSel.codigo ? prodSel.codigo + ' · ' : ''}{prodSel.descricao}</div>
              <div className="sub">Estoque: {numero(prodSel.estoque)} {prodSel.unidade || ''}</div>
            </div>
            <button className="btn-ghost" onClick={() => setProdSel(null)} aria-label="Trocar produto">✕</button>
          </div>
        ) : (
          <>
            <div className="row">
              <input
                className="grow"
                type="text"
                placeholder="Ex.: tubo%inox%50"
                value={buscaProd}
                onChange={(e) => setBuscaProd(e.target.value)}
              />
              <button className="btn btn-outline btn-sm" onClick={() => setNovoProduto(true)}>+ Novo</button>
            </div>
            {buscandoProd && <p className="muted mt">Buscando…</p>}
            {!buscandoProd && buscaProd.trim() && resultadosProd.length === 0 && (
              <div className="empty">Nenhum produto encontrado.</div>
            )}
            {resultadosProd.map((p) => (
              <div key={p.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => escolherProduto(p)}>
                <div className="grow">
                  <div className="title">{p.codigo ? p.codigo + ' · ' : ''}{p.descricao}</div>
                  <div className="sub">Estoque: {numero(p.estoque)} {p.unidade || ''}</div>
                </div>
                <div className="mono">{brl(p.preco)}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {prodSel && (
        <>
          <div className="row mb" style={{ flexWrap: 'wrap', gap: 6 }}>
            {[
              ['À vista', prodSel.preco_vista ?? prodSel.preco, prodSel.margem_vista],
              ['A prazo', prodSel.preco_prazo, prodSel.margem_prazo],
              ['Revenda à vista', prodSel.preco_revenda_vista, prodSel.margem_revenda_vista],
              ['Revenda a prazo', prodSel.preco_revenda_prazo, prodSel.margem_revenda_prazo],
            ]
              .filter(([, v]) => v != null)
              .map(([rotulo, valor, margem]) => (
                <button
                  key={rotulo}
                  type="button"
                  className={'badge ' + (Number(preco) === Number(valor) ? 'badge-azul' : 'badge-cinza')}
                  style={{ cursor: 'pointer', border: 'none' }}
                  onClick={() => setPreco(Number(valor))}
                >
                  {rotulo} {brl(valor)}{margem != null ? ` · MG ${numero(margem, 1)}%` : ''}
                </button>
              ))}
          </div>

          <div className="row">
            <div className="field grow">
              <label>Qtd</label>
              <input type="number" min="0" step="1" value={qtd} onChange={(e) => setQtd(e.target.value)} />
            </div>
            <div className="field" style={{ maxWidth: 88 }}>
              <label>Un</label>
              <input type="text" value={unidade} placeholder="UN" onChange={(e) => setUnidade(e.target.value)} />
            </div>
            <div className="field grow">
              <label>Preço unit.</label>
              <input type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </div>
          </div>

          <button className="btn btn-outline btn-sm mb" onClick={adicionarItem}>+ Adicionar item</button>
        </>
      )}

      {carregandoItens ? (
        <div className="center"><div className="spin" /></div>
      ) : itens.length === 0 ? (
        <div className="empty">Nenhum item adicionado.</div>
      ) : (
        itens.map((it, i) => (
          <div key={i} className="list-item">
            <div className="grow">
              <div className="title">{it.descricao}</div>
              <div className="sub">
                {numero(it.quantidade)} {it.unidade || ''} × {brl(it.preco_unit)} = {brl(it.subtotal)}
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
        <input type="number" min="1" value={validadeDias} onChange={(e) => setValidadeDias(e.target.value)} />
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
          {salvando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Salvar orçamento'}
        </button>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
      </div>

      {novoCliente && (
        <QuickCliente
          user={user}
          toast={toast}
          onClose={() => setNovoCliente(false)}
          onCriado={(c) => {
            setClientesExtra((a) => [c, ...a])
            setClienteId(c.id)
            setBuscaCli('')
            setNovoCliente(false)
            recarregarAux && recarregarAux()
          }}
        />
      )}
      {novoProduto && (
        <QuickProduto
          toast={toast}
          onClose={() => setNovoProduto(false)}
          onCriado={(p) => {
            escolherProduto(p)
            setNovoProduto(false)
          }}
        />
      )}
    </Modal>
  )
}

function QuickCliente({ user, toast, onClose, onCriado }) {
  const [razao, setRazao] = useState('')
  const [fantasia, setFantasia] = useState('')
  const [telefone, setTelefone] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!razao.trim()) { toast('Informe a razão social / nome'); return }
    setSalvando(true)
    const digitos = soDigitos(cnpj)
    const { data, error } = await supabase
      .from('clientes')
      .insert({
        cnpj: digitos.length === 14 || digitos.length === 11 ? digitos : null,
        razao_social: razao.trim(),
        nome_fantasia: fantasia.trim() || null,
        telefone: telefone ? soDigitos(telefone) : null,
        criado_por: user.id,
      })
      .select()
      .single()
    setSalvando(false)
    if (error || !data) {
      toast(error?.code === '23505' ? 'Já existe cliente com este CNPJ' : 'Erro ao criar cliente')
      return
    }
    toast('Cliente cadastrado')
    onCriado(data)
  }

  return (
    <Modal titulo="Novo cliente" onClose={onClose}>
      <div className="field">
        <label>Razão social / Nome</label>
        <input value={razao} onChange={(e) => setRazao(e.target.value)} />
      </div>
      <div className="field">
        <label>Nome fantasia</label>
        <input value={fantasia} onChange={(e) => setFantasia(e.target.value)} />
      </div>
      <div className="row">
        <div className="field grow">
          <label>Telefone</label>
          <input inputMode="numeric" value={formataTelefone(telefone)} onChange={(e) => setTelefone(soDigitos(e.target.value))} />
        </div>
        <div className="field grow">
          <label>CNPJ / CPF (opcional)</label>
          <input inputMode="numeric" value={formataCpfCnpj(cnpj)} onChange={(e) => setCnpj(soDigitos(e.target.value))} />
        </div>
      </div>
      <div className="muted">Para o cadastro completo (endereço, busca por CNPJ), use a aba Clientes.</div>
      <div className="row mt">
        <button className="btn btn-verde grow" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Cadastrar cliente'}
        </button>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}

function QuickProduto({ toast, onClose, onCriado }) {
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [unidade, setUnidade] = useState('UN')
  const [preco, setPreco] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!descricao.trim()) { toast('Informe a descrição'); return }
    setSalvando(true)
    const vista = preco === '' ? null : Number(preco)
    const { data, error } = await supabase
      .from('produtos')
      .insert({
        codigo: codigo.trim() || null,
        descricao: descricao.trim(),
        unidade: unidade.trim() || 'UN',
        preco: vista ?? 0,
        preco_vista: vista,
        atualizado_em: new Date().toISOString(),
      })
      .select()
      .single()
    setSalvando(false)
    if (error || !data) {
      toast(error?.code === '23505' ? 'Já existe produto com este código' : 'Erro ao criar produto')
      return
    }
    toast('Produto criado')
    onCriado(data)
  }

  return (
    <Modal titulo="Novo produto" onClose={onClose}>
      <div className="row">
        <div className="field" style={{ maxWidth: 120 }}>
          <label>Código</label>
          <input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <div className="field grow">
          <label>Descrição</label>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ maxWidth: 100 }}>
          <label>Unidade</label>
          <input value={unidade} placeholder="UN" onChange={(e) => setUnidade(e.target.value)} />
        </div>
        <div className="field grow">
          <label>Preço (R$)</label>
          <input type="number" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} />
        </div>
      </div>
      <div className="row mt">
        <button className="btn btn-verde grow" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Criar produto'}
        </button>
        <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
      </div>
    </Modal>
  )
}

function ModalDetalhe({ orcamento, vendedor, gerir, toast, onEditar, onClose, onMudou }) {
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

  async function excluir() {
    if (!window.confirm(`Excluir o orçamento Nº${orcamento.numero}? Esta ação não pode ser desfeita.`)) return
    setOcupado(true)
    const { error } = await supabase.from('orcamentos').delete().eq('id', orcamento.id)
    setOcupado(false)
    if (error) { toast('Erro ao excluir'); return }
    toast('Orçamento excluído')
    onMudou()
    onClose()
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
        <span className="muted">
          {data(orcamento.criado_em)}
          {orcamento.vendedor_nome ? ` · ${orcamento.vendedor_nome}` : ''}
        </span>
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
                  <div className="sub">{numero(it.quantidade)} {it.unidade || ''} × {brl(it.preco_unit)}</div>
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

          {gerir ? (
            <>
              <div className="row mb">
                <button className="btn btn-outline grow" onClick={() => onEditar(orcamento)} disabled={ocupado}>
                  ✏️ Editar orçamento
                </button>
              </div>

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

              <div className="row mt">
                <button className="btn btn-outline grow" onClick={excluir} disabled={ocupado} style={{ color: '#c0392b', borderColor: '#e6b0aa' }}>
                  🗑 Excluir orçamento
                </button>
              </div>
            </>
          ) : (
            <div className="muted mt">Orçamento de {orcamento.vendedor_nome || 'outro vendedor'} — somente visualização.</div>
          )}
        </>
      )}
    </Modal>
  )
}
