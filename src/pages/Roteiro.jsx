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

// dados exibíveis de um item do roteiro: cliente cadastrado ou endereço avulso
function dadosItem(i) {
  if (i.cliente) {
    return {
      nome: i.cliente.razao_social || i.cliente.nome_fantasia || 'Cliente',
      endereco: endereco(i.cliente),
      lat: i.cliente.lat,
      lng: i.cliente.lng,
      sub: [i.cliente.municipio, i.cliente.uf].filter(Boolean).join('/'),
      avulso: false,
    }
  }
  return {
    nome: i.nome || 'Endereço avulso',
    endereco: i.endereco || '',
    lat: i.lat,
    lng: i.lng,
    sub: i.endereco || '',
    avulso: true,
  }
}

function linkMaps(d) {
  const destino = d.lat != null && d.lng != null ? `${d.lat},${d.lng}` : d.endereco
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
        .select('id, cliente_id, nome, endereco, lat, lng, ordem, visitado_em')
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

  // endereço avulso: destino sem cadastro (prospect, obra, galpão novo…)
  const [mostrarAvulso, setMostrarAvulso] = useState(false)
  const [avNome, setAvNome] = useState('')
  const [avEndereco, setAvEndereco] = useState('')
  const [adicionandoAvulso, setAdicionandoAvulso] = useState(false)

  async function adicionarAvulso() {
    if (!avEndereco.trim()) { toast('Digite o endereço'); return }
    setAdicionandoAvulso(true)
    try {
      const r = await buscarCoordenadas(avEndereco.trim() + ', Brasil')
      const ordem = itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 1
      const { error } = await supabase.from('roteiro_itens').insert({
        perfil_id: user.id,
        data: hoje(),
        cliente_id: null,
        nome: avNome.trim() || null,
        endereco: avEndereco.trim(),
        lat: r?.lat ?? null,
        lng: r?.lng ?? null,
        ordem,
      })
      if (error) { toast('Erro ao adicionar'); return }
      toast(r ? 'Endereço localizado e adicionado ao roteiro' : 'Adicionado — não achei no mapa, mas o Maps navega pelo texto')
      setAvNome('')
      setAvEndereco('')
      setMostrarAvulso(false)
      carregar()
    } finally {
      setAdicionandoAvulso(false)
    }
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

  // acha o ponto no mapa pelo endereço e grava (no cliente ou no item avulso)
  async function localizarPorEndereco(item) {
    const d = dadosItem(item)
    if (!d.endereco) {
      toast('Sem endereço completo para buscar')
      return
    }
    setLocalizando(true)
    try {
      const r = await buscarCoordenadas(d.endereco + ', Brasil')
      if (!r) {
        toast('Endereço não encontrado no mapa — use "Usar minha localização" quando estiver lá')
        return
      }
      const { error } = item.cliente_id
        ? await supabase.from('clientes').update({ lat: r.lat, lng: r.lng }).eq('id', item.cliente_id)
        : await supabase.from('roteiro_itens').update({ lat: r.lat, lng: r.lng }).eq('id', item.id)
      if (error) { toast('Erro ao salvar a localização'); return }
      toast('Localização encontrada pelo endereço!')
      carregar()
    } finally {
      setLocalizando(false)
    }
  }

  const proximo = itens.find((i) => !i.visitado_em)
  const dadosProximo = proximo ? dadosItem(proximo) : null
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

      {!mostrarAvulso ? (
        <button className="btn btn-outline btn-sm mb" onClick={() => setMostrarAvulso(true)}>
          ➕ Endereço avulso (sem cadastro)
        </button>
      ) : (
        <div className="card mb">
          <div className="field">
            <label>Nome/descrição (opcional)</label>
            <input
              type="text"
              placeholder="Ex.: Prospect galpão azul"
              value={avNome}
              onChange={(e) => setAvNome(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Endereço</label>
            <input
              type="text"
              placeholder="Rua, número, cidade"
              value={avEndereco}
              onChange={(e) => setAvEndereco(e.target.value)}
            />
          </div>
          <div className="row">
            <button className="btn btn-verde grow" onClick={adicionarAvulso} disabled={adicionandoAvulso}>
              {adicionandoAvulso ? 'Buscando no mapa…' : '➕ Adicionar ao roteiro'}
            </button>
            <button className="btn btn-outline" onClick={() => setMostrarAvulso(false)} disabled={adicionandoAvulso}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="center"><div className="spin" /></div>
      ) : itens.length === 0 ? (
        <div className="empty">Monte seu roteiro: busque os clientes acima na ordem em que pretende visitar.</div>
      ) : (
        <>
          {proximo && dadosProximo && (
            <div className="card mb">
              <div className="section-title">
                Próximo: {dadosProximo.nome}{dadosProximo.avulso ? ' (avulso)' : ''}
              </div>
              {dadosProximo.endereco && <div className="muted mb">{dadosProximo.endereco}</div>}

              {dadosProximo.lat != null && dadosProximo.lng != null ? (
                <MapaNavegacao
                  destino={{ lat: dadosProximo.lat, lng: dadosProximo.lng, nome: dadosProximo.nome }}
                />
              ) : (
                <>
                  <div className="muted mb">
                    Ainda sem localização no mapa — busque pelo endereço abaixo para ver a rota.
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
                <a className="btn btn-azul grow" href={linkMaps(dadosProximo)} target="_blank" rel="noreferrer">
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
                    <div className="title">{dadosItem(i).nome}{dadosItem(i).avulso ? ' (avulso)' : ''}</div>
                    <div className="sub">{dadosItem(i).sub}</div>
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
                    <div className="title">✓ {dadosItem(i).nome}</div>
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
