import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { useExpediente } from '../context/ExpedienteContext'
import MapaNavegacao from '../components/MapaNavegacao'
import { combinaCuringa, hoje, formataCpfCnpj } from '../lib/format'
import { buscarCoordenadas } from '../lib/geo'

/*
  Roteiro do dia: o vendedor monta a sequência de clientes que vai visitar.
  O próximo da fila ganha o mapa com a rota pelas ruas e a posição ao vivo
  ("GPS simplificado"), o botão do Google Maps para navegação com voz, e o
  "Cheguei" — que marca o cliente como visitado e liga o modo "Em visita".
*/

const endereco = (c) =>
  [c?.logradouro, c?.numero, c?.bairro, c?.municipio, c?.uf].filter(Boolean).join(', ')

function linkMaps(c) {
  const destino = c?.lat != null && c?.lng != null ? `${c.lat},${c.lng}` : endereco(c)
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}&travelmode=driving`
}

export default function Roteiro() {
  const { user } = useAuth()
  const toast = useToast()
  const { ligada, pausa, pausar } = useExpediente()

  const [carregando, setCarregando] = useState(true)
  const [itens, setItens] = useState([]) // roteiro_itens + dados do cliente
  const [clientes, setClientes] = useState([])
  const [busca, setBusca] = useState('')

  async function carregar() {
    if (!user) return
    setCarregando(true)
    const [rItens, rClientes] = await Promise.all([
      supabase
        .from('roteiro_itens')
        .select('id, cliente_id, ordem, visitado_em')
        .eq('perfil_id', user.id)
        .eq('data', hoje())
        .order('ordem', { ascending: true }),
      supabase
        .from('clientes')
        .select('id, razao_social, nome_fantasia, cnpj, telefone, logradouro, numero, bairro, municipio, uf, lat, lng')
        .order('razao_social', { ascending: true }),
    ])
    if (rItens.error || rClientes.error) toast('Erro ao carregar o roteiro')
    const mapa = new Map((rClientes.data || []).map((c) => [c.id, c]))
    setClientes(rClientes.data || [])
    setItens((rItens.data || []).map((i) => ({ ...i, cliente: mapa.get(i.cliente_id) })))
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const filtrados = busca.trim()
    ? clientes
        .filter((c) => !itens.some((i) => i.cliente_id === c.id))
        .filter((c) => combinaCuringa(`${c.razao_social || ''} ${c.nome_fantasia || ''} ${c.municipio || ''} ${c.cnpj || ''}`, busca))
        .slice(0, 15)
    : []

  async function adicionar(c) {
    const ordem = itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 1
    const { error } = await supabase
      .from('roteiro_itens')
      .insert({ perfil_id: user.id, data: hoje(), cliente_id: c.id, ordem })
    if (error) { toast('Erro ao adicionar ao roteiro'); return }
    setBusca('')
    carregar()
  }

  async function remover(item) {
    const { error } = await supabase.from('roteiro_itens').delete().eq('id', item.id)
    if (error) { toast('Erro ao remover'); return }
    carregar()
  }

  async function mover(item, direcao) {
    const pendentes = itens.filter((i) => !i.visitado_em)
    const idx = pendentes.findIndex((i) => i.id === item.id)
    const vizinho = pendentes[idx + direcao]
    if (!vizinho) return
    await Promise.all([
      supabase.from('roteiro_itens').update({ ordem: vizinho.ordem }).eq('id', item.id),
      supabase.from('roteiro_itens').update({ ordem: item.ordem }).eq('id', vizinho.id),
    ])
    carregar()
  }

  async function cheguei(item) {
    const { error } = await supabase
      .from('roteiro_itens')
      .update({ visitado_em: new Date().toISOString() })
      .eq('id', item.id)
    if (error) { toast('Erro ao marcar'); return }
    if (ligada && !pausa) {
      pausar('visita')
      toast('Modo "Em visita" ligado — registre a visita com foto na aba Visitas')
    } else {
      toast('Cliente marcado como visitado')
    }
    carregar()
  }

  const [localizando, setLocalizando] = useState(false)

  // acha o ponto no mapa pelo endereço do SiSCom e grava no cadastro do cliente
  async function localizarPorEndereco(item) {
    const c = item.cliente
    if (!c?.logradouro || !c?.municipio) {
      toast('Cliente sem endereço completo no cadastro')
      return
    }
    setLocalizando(true)
    try {
      const r = await buscarCoordenadas(endereco(c) + ', Brasil')
      if (!r) {
        toast('Endereço não encontrado no mapa — use "Usar minha localização" quando estiver lá')
        return
      }
      const { error } = await supabase.from('clientes').update({ lat: r.lat, lng: r.lng }).eq('id', item.cliente_id)
      if (error) { toast('Erro ao salvar a localização'); return }
      toast('Localização encontrada pelo endereço!')
      carregar()
    } finally {
      setLocalizando(false)
    }
  }

  const proximo = itens.find((i) => !i.visitado_em)
  const pendentes = itens.filter((i) => !i.visitado_em)
  const feitos = itens.filter((i) => i.visitado_em)

  return (
    <div>
      <div className="between mb">
        <div className="section-title">Roteiro do dia</div>
        {itens.length > 0 && (
          <span className="muted">{feitos.length}/{itens.length} visitados</span>
        )}
      </div>

      <div className="field">
        <label>Adicionar cliente ao roteiro (digite para buscar)</label>
        <input
          type="text"
          placeholder="Nome, cidade ou CNPJ"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {busca.trim() && filtrados.length === 0 && <div className="empty">Nenhum cliente encontrado.</div>}
        {filtrados.map((c) => (
          <div key={c.id} className="list-item" style={{ cursor: 'pointer' }} onClick={() => adicionar(c)}>
            <div className="grow">
              <div className="title">{c.razao_social || c.nome_fantasia}</div>
              <div className="sub">
                {c.municipio || ''}{c.uf ? `/${c.uf}` : ''}
                {c.cnpj ? ` · ${formataCpfCnpj(c.cnpj)}` : ''}
                {c.lat == null ? ' · sem localização salva' : ''}
              </div>
            </div>
            <span className="muted">＋</span>
          </div>
        ))}
      </div>

      {carregando ? (
        <div className="center"><div className="spin" /></div>
      ) : itens.length === 0 ? (
        <div className="empty">Monte seu roteiro: busque os clientes acima na ordem em que pretende visitar.</div>
      ) : (
        <>
          {proximo && (
            <div className="card mb">
              <div className="section-title">Próximo: {proximo.cliente?.razao_social || proximo.cliente?.nome_fantasia || 'Cliente'}</div>
              {endereco(proximo.cliente) && <div className="muted mb">{endereco(proximo.cliente)}</div>}

              {proximo.cliente?.lat != null && proximo.cliente?.lng != null ? (
                <MapaNavegacao
                  destino={{
                    lat: proximo.cliente.lat,
                    lng: proximo.cliente.lng,
                    nome: proximo.cliente.razao_social || proximo.cliente.nome_fantasia,
                  }}
                />
              ) : (
                <>
                  <div className="muted mb">
                    Este cliente ainda não tem localização salva — busque pelo endereço abaixo para ver o mapa.
                  </div>
                  <button
                    className="btn btn-outline mb"
                    style={{ width: '100%' }}
                    onClick={() => localizarPorEndereco(proximo)}
                    disabled={localizando}
                  >
                    {localizando ? 'Buscando…' : '🔎 Localizar pelo endereço'}
                  </button>
                </>
              )}

              <div className="row mt">
                <a className="btn btn-azul grow" href={linkMaps(proximo.cliente)} target="_blank" rel="noreferrer">
                  🗺️ Navegar no Maps
                </a>
                <button className="btn btn-verde grow" onClick={() => cheguei(proximo)}>
                  🤝 Cheguei
                </button>
              </div>
            </div>
          )}

          {pendentes.length > 1 && (
            <>
              <div className="section-title">Na fila</div>
              {pendentes.slice(1).map((i) => (
                <div key={i.id} className="list-item">
                  <div className="grow">
                    <div className="title">{i.cliente?.razao_social || i.cliente?.nome_fantasia || 'Cliente'}</div>
                    <div className="sub">{i.cliente?.municipio || ''}{i.cliente?.uf ? `/${i.cliente.uf}` : ''}</div>
                  </div>
                  <button className="btn-ghost" onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                  <button className="btn-ghost" onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
                  <button className="btn-ghost" onClick={() => remover(i)} aria-label="Remover">✕</button>
                </div>
              ))}
            </>
          )}

          {feitos.length > 0 && (
            <>
              <div className="section-title">Visitados</div>
              {feitos.map((i) => (
                <div key={i.id} className="list-item" style={{ opacity: 0.6 }}>
                  <div className="grow">
                    <div className="title">✓ {i.cliente?.razao_social || i.cliente?.nome_fantasia || 'Cliente'}</div>
                    <div className="sub">
                      {new Date(i.visitado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
