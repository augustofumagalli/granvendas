import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import ImportarClientes from '../components/ImportarClientes'
import { soDigitos, formataCpfCnpj, formataTelefone } from '../lib/format'
import { pegarPosicao, buscarCoordenadas } from '../lib/geo'

const VAZIO = {
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  telefone: '',
  email: '',
  logradouro: '',
  numero: '',
  bairro: '',
  municipio: '',
  uf: '',
  cep: '',
  observacao: '',
  lat: null,
  lng: null,
}

export default function Clientes() {
  const { user } = useAuth()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')

  const [modalAberto, setModalAberto] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState(VAZIO)
  const [editandoId, setEditandoId] = useState(null)
  const [buscandoCnpj, setBuscandoCnpj] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [gps, setGps] = useState(false)

  async function carregar() {
    setLoading(true)
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .order('razao_social', { ascending: true })
    if (error) toast('Erro ao carregar clientes')
    setClientes(data || [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  const termo = soDigitos(busca)
  const filtrados = clientes.filter((c) => {
    const q = busca.trim().toLowerCase()
    if (!q) return true
    const alvo = `${c.razao_social || ''} ${c.nome_fantasia || ''}`.toLowerCase()
    const cnpj = soDigitos(c.cnpj)
    return alvo.includes(q) || (termo && cnpj.includes(termo))
  })

  function abrirNovo() {
    setForm(VAZIO)
    setEditandoId(null)
    setModalAberto(true)
  }

  function abrirEdicao(c) {
    setForm({
      cnpj: c.cnpj || '',
      razao_social: c.razao_social || '',
      nome_fantasia: c.nome_fantasia || '',
      telefone: c.telefone || '',
      email: c.email || '',
      logradouro: c.logradouro || '',
      numero: c.numero || '',
      bairro: c.bairro || '',
      municipio: c.municipio || '',
      uf: c.uf || '',
      cep: c.cep || '',
      observacao: c.observacao || '',
      lat: c.lat ?? null,
      lng: c.lng ?? null,
    })
    setEditandoId(c.id)
    setModalAberto(true)
  }

  function fechar() {
    setModalAberto(false)
  }

  function set(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }))
  }

  async function buscarCnpj() {
    const digitos = soDigitos(form.cnpj)
    if (digitos.length !== 14) {
      toast('A busca automática só funciona para CNPJ (14 dígitos)')
      return
    }
    setBuscandoCnpj(true)
    try {
      const resp = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + digitos)
      if (!resp.ok) throw new Error('nao encontrado')
      const d = await resp.json()
      const logradouro = d.descricao_tipo_de_logradouro
        ? `${d.descricao_tipo_de_logradouro} ${d.logradouro || ''}`.trim()
        : d.logradouro || ''
      setForm((f) => ({
        ...f,
        razao_social: d.razao_social || f.razao_social,
        nome_fantasia: d.nome_fantasia || f.nome_fantasia,
        logradouro: logradouro || f.logradouro,
        numero: d.numero || f.numero,
        bairro: d.bairro || f.bairro,
        municipio: d.municipio || f.municipio,
        uf: d.uf || f.uf,
        cep: d.cep ? soDigitos(d.cep) : f.cep,
        telefone: d.ddd_telefone_1 || f.telefone,
        email: d.email || f.email,
      }))
    } catch (e) {
      toast('CNPJ não encontrado, preencha manualmente')
    } finally {
      setBuscandoCnpj(false)
    }
  }

  async function usarLocalizacao() {
    setGps(true)
    try {
      const p = await pegarPosicao()
      setForm((f) => ({ ...f, lat: p.lat, lng: p.lng }))
      toast('Localização capturada')
    } catch (e) {
      toast('Não foi possível obter a localização')
    } finally {
      setGps(false)
    }
  }

  const [buscandoEndereco, setBuscandoEndereco] = useState(false)

  // acha o ponto no mapa a partir do endereço digitado (sem precisar estar lá)
  async function localizarPorEndereco() {
    if (!form.logradouro.trim() || !form.municipio.trim()) {
      toast('Preencha ao menos logradouro e município')
      return
    }
    setBuscandoEndereco(true)
    try {
      const texto = [form.logradouro, form.numero, form.bairro, form.municipio, form.uf, 'Brasil']
        .filter((x) => String(x || '').trim())
        .join(', ')
      const r = await buscarCoordenadas(texto)
      if (!r) {
        toast('Endereço não encontrado no mapa — confira o cadastro ou capture no local')
        return
      }
      setForm((f) => ({ ...f, lat: r.lat, lng: r.lng }))
      toast('Localização encontrada pelo endereço')
    } catch {
      toast('Não foi possível buscar o endereço agora')
    } finally {
      setBuscandoEndereco(false)
    }
  }

  async function salvar() {
    const digitos = soDigitos(form.cnpj)
    if (digitos.length !== 14 && digitos.length !== 11) {
      toast('Informe um CNPJ (14 dígitos) ou CPF (11 dígitos)')
      return
    }
    if (!form.razao_social.trim()) {
      toast('Informe a razão social')
      return
    }
    setSalvando(true)
    const payload = {
      cnpj: digitos,
      razao_social: form.razao_social.trim(),
      nome_fantasia: form.nome_fantasia.trim() || null,
      telefone: form.telefone ? soDigitos(form.telefone) : null,
      email: form.email.trim() || null,
      logradouro: form.logradouro.trim() || null,
      numero: form.numero.trim() || null,
      bairro: form.bairro.trim() || null,
      municipio: form.municipio.trim() || null,
      uf: form.uf.trim().toUpperCase() || null,
      cep: form.cep ? soDigitos(form.cep) : null,
      observacao: form.observacao.trim() || null,
      lat: form.lat,
      lng: form.lng,
    }

    let error
    if (editandoId) {
      const r = await supabase.from('clientes').update(payload).eq('id', editandoId)
      error = r.error
    } else {
      const r = await supabase.from('clientes').insert({ ...payload, criado_por: user.id })
      error = r.error
    }

    setSalvando(false)
    if (error) {
      if (error.code === '23505' || /duplicate|unique/i.test(error.message || '')) {
        toast('Já existe um cliente com este CNPJ/CPF')
      } else {
        toast('Erro ao salvar cliente')
      }
      return
    }
    toast(editandoId ? 'Cliente atualizado' : 'Cliente cadastrado')
    setModalAberto(false)
    carregar()
  }

  return (
    <div>
      <div className="between mb">
        <div className="section-title">Clientes</div>
        <div className="row">
          <button className="btn btn-outline btn-sm" onClick={() => setShowImport(true)}>Importar</button>
          <button className="btn btn-azul btn-sm" onClick={abrirNovo}>+ Novo cliente</button>
        </div>
      </div>

      <div className="field mb">
        <input
          type="text"
          placeholder="Buscar por nome, fantasia ou CNPJ"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="center"><div className="spin" /></div>
      ) : filtrados.length === 0 ? (
        <div className="empty">
          {clientes.length === 0
            ? 'Nenhum cliente cadastrado ainda. Toque em "+ Novo cliente" para começar.'
            : 'Nenhum cliente encontrado para esta busca.'}
        </div>
      ) : (
        filtrados.map((c) => (
          <div key={c.id} className="list-item" onClick={() => abrirEdicao(c)}>
            <div className="grow">
              <div className="title">{c.nome_fantasia || c.razao_social}</div>
              <div className="sub">
                {c.municipio || '—'}/{c.uf || '—'}
                {c.telefone ? ` · ${formataTelefone(c.telefone)}` : ''}
              </div>
            </div>
          </div>
        ))
      )}

      {showImport && (
        <Modal titulo="Importar clientes" onClose={() => setShowImport(false)}>
          <ImportarClientes
            onClose={() => setShowImport(false)}
            onConcluido={() => {
              setShowImport(false)
              carregar()
            }}
          />
        </Modal>
      )}

      {modalAberto && (
        <Modal titulo={editandoId ? 'Editar cliente' : 'Novo cliente'} onClose={fechar}>
          <div className="field">
            <label>CNPJ / CPF</label>
            <div className="row">
              <input
                className="grow mono"
                type="text"
                inputMode="numeric"
                placeholder="00.000.000/0000-00 ou 000.000.000-00"
                value={formataCpfCnpj(form.cnpj)}
                onChange={(e) => set('cnpj', soDigitos(e.target.value))}
                disabled={!!editandoId}
              />
              {!editandoId && (
                <button className="btn btn-outline btn-sm" onClick={buscarCnpj} disabled={buscandoCnpj}>
                  {buscandoCnpj ? <span className="spin" /> : 'Buscar CNPJ'}
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <label>Razão social</label>
            <input type="text" value={form.razao_social} onChange={(e) => set('razao_social', e.target.value)} />
          </div>

          <div className="field">
            <label>Nome fantasia</label>
            <input type="text" value={form.nome_fantasia} onChange={(e) => set('nome_fantasia', e.target.value)} />
          </div>

          <div className="row">
            <div className="field grow">
              <label>Telefone</label>
              <input
                type="text"
                inputMode="numeric"
                value={formataTelefone(form.telefone)}
                onChange={(e) => set('telefone', soDigitos(e.target.value))}
              />
            </div>
            <div className="field grow">
              <label>E-mail</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>

          <div className="field">
            <label>Logradouro</label>
            <input type="text" value={form.logradouro} onChange={(e) => set('logradouro', e.target.value)} />
          </div>

          <div className="row">
            <div className="field grow">
              <label>Número</label>
              <input type="text" value={form.numero} onChange={(e) => set('numero', e.target.value)} />
            </div>
            <div className="field grow">
              <label>Bairro</label>
              <input type="text" value={form.bairro} onChange={(e) => set('bairro', e.target.value)} />
            </div>
          </div>

          <div className="row">
            <div className="field grow">
              <label>Município</label>
              <input type="text" value={form.municipio} onChange={(e) => set('municipio', e.target.value)} />
            </div>
            <div className="field">
              <label>UF</label>
              <input
                type="text"
                maxLength={2}
                value={form.uf}
                onChange={(e) => set('uf', e.target.value.toUpperCase())}
              />
            </div>
            <div className="field grow">
              <label>CEP</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.cep}
                onChange={(e) => set('cep', soDigitos(e.target.value))}
              />
            </div>
          </div>

          <div className="field">
            <label>Observação</label>
            <input type="text" value={form.observacao} onChange={(e) => set('observacao', e.target.value)} />
          </div>

          <div className="row mt">
            <button className="btn btn-outline grow" onClick={usarLocalizacao} disabled={gps || buscandoEndereco}>
              {gps ? <span className="spin" /> : '📍 Usar minha localização'}
            </button>
            <button className="btn btn-outline grow" onClick={localizarPorEndereco} disabled={gps || buscandoEndereco}>
              {buscandoEndereco ? <span className="spin" /> : '🔎 Localizar pelo endereço'}
            </button>
          </div>
          {form.lat != null && form.lng != null && (
            <div className="muted mono mt">📍 {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)}</div>
          )}

          <div className="row mt">
            <button className="btn btn-verde grow" onClick={salvar} disabled={salvando}>
              {salvando ? <span className="spin" /> : editandoId ? 'Salvar alterações' : 'Cadastrar cliente'}
            </button>
            <button className="btn btn-outline" onClick={fechar} disabled={salvando}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}
