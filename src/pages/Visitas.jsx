import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useExpediente } from '../context/ExpedienteContext'
import Modal from '../components/Modal'
import { numero, dataHora, hoje } from '../lib/format'
import { pegarPosicao } from '../lib/geo'

export default function Visitas() {
  const { user } = useAuth()
  const toast = useToast()
  const { config } = useExpediente()

  const [feitasHoje, setFeitasHoje] = useState(0)
  const [meta, setMeta] = useState(0)
  const [metaInput, setMetaInput] = useState('')
  const [salvandoMeta, setSalvandoMeta] = useState(false)

  const [visitas, setVisitas] = useState([])
  const [loading, setLoading] = useState(true)

  const [clientes, setClientes] = useState([])

  const [abrirNova, setAbrirNova] = useState(false)
  const [detalhe, setDetalhe] = useState(null)

  const saldo = feitasHoje - meta

  useEffect(() => {
    const m = Number(config?.meta_visitas || 0)
    setMeta(m)
    setMetaInput(String(m))
  }, [config])

  async function carregar() {
    if (!user) return
    setLoading(true)
    const [rCount, rLista, rClientes] = await Promise.all([
      supabase
        .from('visitas')
        .select('id', { count: 'exact', head: true })
        .eq('perfil_id', user.id)
        .eq('data', hoje()),
      supabase
        .from('visitas')
        .select('*')
        .eq('perfil_id', user.id)
        .order('criado_em', { ascending: false })
        .limit(50),
      supabase
        .from('clientes')
        .select('id, razao_social, nome_fantasia')
        .order('razao_social', { ascending: true }),
    ])
    setFeitasHoje(rCount.count || 0)
    setVisitas(rLista.data || [])
    setClientes(rClientes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function salvarMeta() {
    const valor = Number(metaInput)
    if (!Number.isFinite(valor) || valor < 0) {
      toast('Informe uma meta válida')
      return
    }
    setSalvandoMeta(true)
    const { error } = await supabase
      .from('configuracoes')
      .update({ meta_visitas: valor })
      .eq('perfil_id', user.id)
    setSalvandoMeta(false)
    if (error) {
      toast('Erro ao salvar meta')
      return
    }
    setMeta(valor)
    toast('Meta atualizada')
  }

  return (
    <div>
      <div className="section-title">Visitas</div>

      <div className="card mb">
        <div className="row between mb">
          <div className="field" style={{ maxWidth: 140 }}>
            <label>Meta por dia</label>
            <input
              type="number"
              min="0"
              value={metaInput}
              onChange={(e) => setMetaInput(e.target.value)}
            />
          </div>
          <button className="btn btn-outline btn-sm" onClick={salvarMeta} disabled={salvandoMeta}>
            {salvandoMeta ? 'Salvando…' : 'Salvar meta'}
          </button>
        </div>

        {loading ? (
          <div className="center"><div className="spin" /></div>
        ) : (
          <div className="kpi-grid">
            <div className="kpi">
              <div className="v">{numero(meta)}</div>
              <div className="l">Meta</div>
            </div>
            <div className="kpi">
              <div className="v">{numero(feitasHoje)}</div>
              <div className="l">Feitas hoje</div>
            </div>
            <div className={'kpi' + (saldo < 0 ? ' laranja' : '')}>
              <div className="v">{saldo >= 0 ? '+' + numero(saldo) : numero(saldo)}</div>
              <div className="l">Saldo do dia</div>
              {saldo >= 0 ? (
                <span className="badge badge-verde">+{numero(saldo)} acima da meta</span>
              ) : (
                <span className="badge badge-laranja">Faltam {numero(-saldo)} visitas</span>
              )}
            </div>
          </div>
        )}
      </div>

      <button className="btn btn-azul mb" style={{ width: '100%' }} onClick={() => setAbrirNova(true)}>
        📍 Registrar visita
      </button>

      <div className="section-title">Histórico</div>
      {loading ? (
        <div className="center"><div className="spin" /></div>
      ) : visitas.length === 0 ? (
        <div className="empty">Nenhuma visita registrada ainda.</div>
      ) : (
        visitas.map((v) => (
          <div key={v.id} className="list-item" onClick={() => setDetalhe(v)} style={{ cursor: 'pointer' }}>
            {v.foto_url && (
              <img
                src={v.foto_url}
                alt=""
                style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }}
              />
            )}
            <div className="grow">
              <div className="title">{v.cliente_nome || 'Cliente'}</div>
              <div className="sub">
                {dataHora(v.criado_em)}
                {v.observacao ? ' · ' + v.observacao.slice(0, 40) : ''}
              </div>
            </div>
          </div>
        ))
      )}

      {abrirNova && (
        <NovaVisita
          user={user}
          clientes={clientes}
          toast={toast}
          onClose={() => setAbrirNova(false)}
          onSalvo={() => { setAbrirNova(false); carregar() }}
        />
      )}

      {detalhe && (
        <Modal titulo={detalhe.cliente_nome || 'Visita'} onClose={() => setDetalhe(null)}>
          {detalhe.foto_url && (
            <img
              src={detalhe.foto_url}
              alt=""
              className="mb"
              style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }}
            />
          )}
          <div className="muted mb">{dataHora(detalhe.criado_em)}</div>
          {detalhe.observacao && <p className="mb">{detalhe.observacao}</p>}
          {detalhe.lat != null && detalhe.lng != null && (
            <a
              className="btn btn-outline"
              style={{ width: '100%' }}
              href={`https://www.google.com/maps?q=${detalhe.lat},${detalhe.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              📍 Ver no mapa
            </a>
          )}
        </Modal>
      )}
    </div>
  )
}

function NovaVisita({ user, clientes, toast, onClose, onSalvo }) {
  const [pos, setPos] = useState(null)
  const [erroGps, setErroGps] = useState('')
  const [buscandoGps, setBuscandoGps] = useState(false)

  const [clienteId, setClienteId] = useState('')
  const [clienteNome, setClienteNome] = useState('')

  const [arquivo, setArquivo] = useState(null)
  const [preview, setPreview] = useState('')
  const [observacao, setObservacao] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function capturar() {
    setBuscandoGps(true)
    setErroGps('')
    try {
      const p = await pegarPosicao()
      setPos(p)
    } catch (e) {
      setErroGps(e.message || 'Não foi possível capturar a localização')
    }
    setBuscandoGps(false)
  }

  useEffect(() => {
    capturar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function escolherFoto(e) {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setArquivo(f)
    setPreview(URL.createObjectURL(f))
  }

  function nomeCliente() {
    if (clienteId) {
      const c = clientes.find((x) => String(x.id) === String(clienteId))
      return c ? (c.razao_social || c.nome_fantasia || 'Cliente') : ''
    }
    return clienteNome.trim()
  }

  async function salvar() {
    const nome = nomeCliente()
    if (!nome) {
      toast('Selecione ou digite o cliente')
      return
    }
    setSalvando(true)

    let foto_url = null
    if (arquivo) {
      const caminho = `${user.id}/${Date.now()}-${arquivo.name}`
      const { error: upErr } = await supabase.storage.from('visitas').upload(caminho, arquivo)
      if (upErr) {
        setSalvando(false)
        toast('Erro ao enviar a foto')
        return
      }
      const { data: pub } = supabase.storage.from('visitas').getPublicUrl(caminho)
      foto_url = pub?.publicUrl || null
    }

    const { error } = await supabase.from('visitas').insert({
      perfil_id: user.id,
      cliente_id: clienteId || null,
      cliente_nome: nome,
      lat: pos?.lat ?? null,
      lng: pos?.lng ?? null,
      foto_url,
      observacao: observacao.trim() || null,
      data: hoje(),
    })
    setSalvando(false)
    if (error) {
      toast('Erro ao registrar visita')
      return
    }
    toast('Visita registrada')
    onSalvo()
  }

  return (
    <Modal titulo="Nova visita" onClose={onClose}>
      <div className="mb">
        {buscandoGps ? (
          <div className="muted">Capturando localização…</div>
        ) : pos ? (
          <div className="badge badge-verde">
            Localização capturada ✓ ({numero(pos.lat, 5)}, {numero(pos.lng, 5)})
          </div>
        ) : (
          <div>
            <div className="badge badge-erro mb">{erroGps || 'Localização não capturada'}</div>
            <button className="btn btn-outline btn-sm" onClick={capturar}>Tentar de novo</button>
          </div>
        )}
      </div>

      <div className="field">
        <label>Cliente cadastrado</label>
        <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
          <option value="">— selecionar —</option>
          {clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razao_social || c.nome_fantasia}
            </option>
          ))}
        </select>
      </div>

      {!clienteId && (
        <div className="field">
          <label>Ou nome do cliente (novo)</label>
          <input
            type="text"
            value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)}
            placeholder="Nome da empresa"
          />
        </div>
      )}

      <div className="field">
        <label>Foto da empresa</label>
        <input type="file" accept="image/*" capture="environment" onChange={escolherFoto} />
      </div>
      {preview && (
        <img
          src={preview}
          alt="Prévia"
          className="mb"
          style={{ width: '100%', borderRadius: 8, objectFit: 'cover' }}
        />
      )}

      <div className="field">
        <label>Observação</label>
        <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} />
      </div>

      <button className="btn btn-verde mt" style={{ width: '100%' }} onClick={salvar} disabled={salvando}>
        {salvando ? 'Salvando…' : 'Salvar visita'}
      </button>
    </Modal>
  )
}
