import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useToast } from '../context/ToastContext'
import Modal from '../components/Modal'
import MapaRota from '../components/MapaRota'
import { detectarParadas, classificarParada } from '../lib/paradas'
import { brl, numero, data as fmtData, dataHora } from '../lib/format'

const hm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// YYYY-MM-DD no horário local
function diaLocal(d) {
  const dt = d instanceof Date ? d : new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const dia = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

function calcularPeriodo(periodo) {
  const agora = new Date()
  const fimDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  let inicioDia
  if (periodo === 'hoje') inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  else if (periodo === 'semana') inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6)
  else inicioDia = new Date(agora.getFullYear(), agora.getMonth(), 1)
  return { inicioDia, fimDia }
}

function listaDias(inicioDia, fimDia) {
  const dias = []
  const cur = new Date(inicioDia)
  while (cur <= fimDia) {
    dias.push(diaLocal(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dias
}

const CHIPS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
]

export default function Acompanhamento() {
  const toast = useToast()

  const [vendedores, setVendedores] = useState([])
  const [vendedorId, setVendedorId] = useState('')
  const [periodo, setPeriodo] = useState('semana')

  const [loading, setLoading] = useState(false)
  const [visitas, setVisitas] = useState([])
  const [enviados, setEnviados] = useState([])
  const [fechados, setFechados] = useState([])
  const [rotas, setRotas] = useState([])

  // mapa da rota de um dia
  const [rotaDia, setRotaDia] = useState(null)
  const [carregandoRota, setCarregandoRota] = useState(false)
  const [pontosDia, setPontosDia] = useState([])
  const [visitasDia, setVisitasDia] = useState([])
  const [paradasDia, setParadasDia] = useState([])

  const { inicioDia, fimDia } = useMemo(() => calcularPeriodo(periodo), [periodo])

  useEffect(() => {
    supabase
      .from('perfis')
      .select('id, nome')
      .eq('papel', 'vendedor')
      .order('nome', { ascending: true })
      .then(({ data }) => setVendedores(data || []))
  }, [])

  useEffect(() => {
    async function carregar() {
      if (!vendedorId) {
        setVisitas([]); setEnviados([]); setFechados([]); setRotas([])
        return
      }
      setLoading(true)
      const inicioStr = diaLocal(inicioDia)
      const fimStr = diaLocal(fimDia)
      const inicioISO = inicioDia.toISOString()
      const fimExcl = new Date(fimDia); fimExcl.setDate(fimExcl.getDate() + 1)
      const fimExclISO = fimExcl.toISOString()

      const [rVisitas, rEnviados, rFechados, rRotas] = await Promise.all([
        supabase.from('visitas').select('id, data, cliente_nome, criado_em, foto_url, lat, lng')
          .eq('perfil_id', vendedorId).gte('data', inicioStr).lte('data', fimStr)
          .order('criado_em', { ascending: false }),
        supabase.from('orcamentos').select('id, total, enviado_em')
          .eq('perfil_id', vendedorId).in('status', ['enviado', 'fechado'])
          .gte('enviado_em', inicioISO).lt('enviado_em', fimExclISO),
        supabase.from('orcamentos').select('id, total, fechado_em')
          .eq('perfil_id', vendedorId).eq('status', 'fechado')
          .gte('fechado_em', inicioISO).lt('fechado_em', fimExclISO),
        supabase.from('rotas').select('km, data')
          .eq('perfil_id', vendedorId).gte('data', inicioStr).lte('data', fimStr),
      ])
      if (rVisitas.error || rEnviados.error || rFechados.error || rRotas.error) toast('Erro ao carregar acompanhamento')
      setVisitas(rVisitas.data || [])
      setEnviados(rEnviados.data || [])
      setFechados(rFechados.data || [])
      setRotas(rRotas.data || [])
      setLoading(false)
    }
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedorId, inicioDia, fimDia])

  const totalVisitas = visitas.length
  const totalEnviados = enviados.length
  const totalFechados = fechados.length
  const valorFechado = fechados.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const totalKm = rotas.reduce((s, r) => s + (Number(r.km) || 0), 0)
  const conversao = totalEnviados > 0 ? (totalFechados / totalEnviados) * 100 : 0

  const resumoDiario = useMemo(() => {
    const dias = listaDias(inicioDia, fimDia)
    const mapa = {}
    dias.forEach((d) => { mapa[d] = { dia: d, visitas: 0, enviados: 0, fechados: 0, km: 0 } })
    visitas.forEach((v) => { if (mapa[v.data]) mapa[v.data].visitas += 1 })
    enviados.forEach((o) => { const k = diaLocal(o.enviado_em); if (mapa[k]) mapa[k].enviados += 1 })
    fechados.forEach((o) => { const k = diaLocal(o.fechado_em); if (mapa[k]) mapa[k].fechados += 1 })
    rotas.forEach((r) => { if (mapa[r.data]) mapa[r.data].km += Number(r.km) || 0 })
    return dias.map((d) => mapa[d]).reverse()
  }, [visitas, enviados, fechados, rotas, inicioDia, fimDia])

  async function abrirRota(dia) {
    setRotaDia(dia)
    setCarregandoRota(true)
    setPontosDia([]); setVisitasDia([]); setParadasDia([])
    const [rPontos, rVisitas, rPausas, rClientes] = await Promise.all([
      supabase.from('rota_pontos').select('lat, lng, capturado_em')
        .eq('perfil_id', vendedorId).eq('data', dia).order('capturado_em', { ascending: true }),
      supabase.from('visitas').select('lat, lng, cliente_nome, criado_em')
        .eq('perfil_id', vendedorId).eq('data', dia).order('criado_em', { ascending: true }),
      supabase.from('rota_pausas').select('tipo, inicio, fim')
        .eq('perfil_id', vendedorId).eq('data', dia),
      supabase.from('clientes').select('razao_social, nome_fantasia, lat, lng').not('lat', 'is', null),
    ])
    if (rPontos.error || rVisitas.error) toast('Erro ao carregar a rota')
    const pontos = rPontos.data || []
    const visitasDoDia = rVisitas.data || []
    const paradas = detectarParadas(pontos)
      .map((p) => ({ ...p, ...classificarParada(p, visitasDoDia, rPausas.data || [], rClientes.data || []) }))
    setPontosDia(pontos)
    setVisitasDia(visitasDoDia.filter((v) => v.lat != null && v.lng != null))
    setParadasDia(paradas)
    setCarregandoRota(false)
  }

  const nomeVendedor = vendedores.find((v) => v.id === vendedorId)?.nome || ''

  return (
    <div>
      <div className="section-title mb">Acompanhamento</div>

      <div className="field">
        <label>Vendedor</label>
        <select value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
          <option value="">Selecione um vendedor…</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.id}>{v.nome || '—'}</option>
          ))}
        </select>
      </div>

      {!vendedorId ? (
        <div className="empty">Escolha um vendedor para ver as visitas e a rota.</div>
      ) : (
        <>
          <div className="row mb">
            {CHIPS.map((c) => (
              <button key={c.id} className={`btn btn-sm ${periodo === c.id ? 'btn-azul' : 'btn-outline'}`} onClick={() => setPeriodo(c.id)}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="muted mb">{fmtData(inicioDia)} — {fmtData(fimDia)}</div>

          {loading ? (
            <div className="center"><div className="spin" /></div>
          ) : (
            <>
              <div className="kpi-grid mb">
                <div className="kpi"><div className="v mono">{numero(totalVisitas)}</div><div className="l">Visitas</div></div>
                <div className="kpi"><div className="v mono">{numero(totalEnviados)}</div><div className="l">Orç. enviados</div></div>
                <div className="kpi"><div className="v mono">{numero(totalFechados)}</div><div className="l">Fechados</div></div>
                <div className="kpi"><div className="v mono">{numero(totalKm, 1)}</div><div className="l">KM rodados</div></div>
                <div className="kpi laranja"><div className="v mono">{brl(valorFechado)}</div><div className="l">Valor fechado</div></div>
                <div className="kpi"><div className="v mono">{numero(conversao, 1)}%</div><div className="l">Conversão</div></div>
              </div>

              <div className="card mb">
                <div className="section-title">Resumo diário</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left' }}>Data</th>
                      <th style={{ textAlign: 'right' }}>Visitas</th>
                      <th style={{ textAlign: 'right' }}>Enviados</th>
                      <th style={{ textAlign: 'right' }}>Fechados</th>
                      <th style={{ textAlign: 'right' }}>KM</th>
                      <th style={{ textAlign: 'center' }}>Rota</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumoDiario.map((r) => (
                      <tr key={r.dia}>
                        <td>{fmtData(r.dia)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{numero(r.visitas)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{numero(r.enviados)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{numero(r.fechados)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{numero(r.km, 1)}</td>
                        <td style={{ textAlign: 'center' }}>
                          {(r.km > 0 || r.visitas > 0) ? (
                            <button className="btn btn-outline btn-sm" onClick={() => abrirRota(r.dia)}>🗺️ Ver</button>
                          ) : (<span className="muted">—</span>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="section-title mb">Visitas ({numero(totalVisitas)})</div>
              {visitas.length === 0 ? (
                <div className="empty">Nenhuma visita no período.</div>
              ) : (
                visitas.map((v) => (
                  <div key={v.id} className="list-item">
                    {v.foto_url && (
                      <img src={v.foto_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover' }} />
                    )}
                    <div className="grow">
                      <div className="title">{v.cliente_nome || 'Cliente'}</div>
                      <div className="sub">{dataHora(v.criado_em)}</div>
                    </div>
                    {v.lat != null && v.lng != null && (
                      <a className="btn btn-outline btn-sm" href={`https://www.google.com/maps?q=${v.lat},${v.lng}`} target="_blank" rel="noreferrer">📍</a>
                    )}
                  </div>
                ))
              )}
            </>
          )}
        </>
      )}

      {rotaDia && (
        <Modal titulo={`Rota de ${nomeVendedor} · ${fmtData(rotaDia)}`} onClose={() => setRotaDia(null)}>
          {carregandoRota ? (
            <div className="center"><div className="spin" /></div>
          ) : pontosDia.length === 0 && visitasDia.length === 0 ? (
            <div className="empty">Sem trajeto ou visitas com localização neste dia.</div>
          ) : (
            <>
              <MapaRota pontos={pontosDia} visitas={visitasDia} paradas={paradasDia.filter((p) => p.lat != null)} />
              <div className="muted mt">
                {pontosDia.length > 0 ? `${numero(pontosDia.length)} pontos de trajeto` : 'Sem trajeto registrado'}
                {' · '}{numero(visitasDia.length)} visita(s) no mapa
              </div>
              {paradasDia.length > 0 && (
                <>
                  <div className="section-title mt">Linha do tempo das paradas</div>
                  {paradasDia.map((p, i) => (
                    <div key={i} className="list-item">
                      <div className="grow">
                        <div className="title">{p.rotulo}</div>
                        <div className="sub">
                          {hm(p.inicio)}–{hm(p.fim)}{p.minutos != null ? ` · ${numero(p.minutos)} min` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
