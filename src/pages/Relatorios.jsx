import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { brl, numero, data as fmtData } from '../lib/format'
import { distanciaKm } from '../lib/geo'
import Modal from '../components/Modal'
import MapaRota from '../components/MapaRota'

const PARADA_MIN_MINUTOS = 10   // parado por 10+ min vira "parada"
const PARADA_RAIO_KM = 0.2      // ...desde que não tenha se deslocado mais que isso
const PERTO_KM = 0.15           // "perto" de um cliente/visita = 150 m

const hm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// O GPS só grava ponto quando há movimento; parado, abre-se um "vão" no tempo
// entre dois pontos quase no mesmo lugar — isso é uma parada.
function detectarParadas(pontos) {
  const ps = (pontos || [])
    .filter((p) => p.lat != null && p.lng != null && p.capturado_em)
    .map((p) => ({ lat: p.lat, lng: p.lng, t: new Date(p.capturado_em).getTime() }))
  const out = []
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1]
    const b = ps[i]
    const minutos = (b.t - a.t) / 60000
    if (minutos >= PARADA_MIN_MINUTOS && distanciaKm(a.lat, a.lng, b.lat, b.lng) < PARADA_RAIO_KM) {
      out.push({ lat: a.lat, lng: a.lng, inicio: a.t, fim: b.t, minutos: Math.round(minutos) })
    }
  }
  return out
}

function classificarParada(p, visitas, pausas, clientesGeo) {
  const visita = (visitas || []).find(
    (v) =>
      (v.lat != null && distanciaKm(p.lat, p.lng, v.lat, v.lng) < PERTO_KM) ||
      (v.criado_em && new Date(v.criado_em).getTime() >= p.inicio - 10 * 60000 && new Date(v.criado_em).getTime() <= p.fim + 10 * 60000)
  )
  if (visita) return { rotulo: `Visita — ${visita.cliente_nome || 'cliente'}`, tipo: 'visita' }

  const pausa = (pausas || []).find((pa) => {
    const ini = new Date(pa.inicio).getTime()
    const fim = pa.fim ? new Date(pa.fim).getTime() : ini + 60 * 60000
    return p.inicio < fim && p.fim > ini
  })
  if (pausa) return { rotulo: pausa.tipo === 'almoco' ? 'Almoço (pausa registrada)' : 'Pausa particular (registrada)', tipo: 'pausa' }

  const cliente = (clientesGeo || []).find((c) => distanciaKm(p.lat, p.lng, c.lat, c.lng) < PERTO_KM)
  if (cliente) return { rotulo: `No cliente ${cliente.razao_social || cliente.nome_fantasia} (sem visita registrada)`, tipo: 'cliente' }

  const hora = new Date(p.inicio).getHours()
  if (hora >= 11 && hora < 14 && p.minutos >= 30) return { rotulo: 'Provável almoço', tipo: 'almoco' }

  return { rotulo: 'Parada não identificada', tipo: 'desconhecida' }
}

// YYYY-MM-DD no horário local
function diaLocal(d) {
  const dt = d instanceof Date ? d : new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const dia = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${dia}`
}

// Calcula início/fim (Date, meia-noite local) conforme o período escolhido
function calcularPeriodo(periodo) {
  const agora = new Date()
  const fimDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  let inicioDia
  if (periodo === 'hoje') {
    inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  } else if (periodo === 'semana') {
    inicioDia = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 6)
  } else {
    // mês atual
    inicioDia = new Date(agora.getFullYear(), agora.getMonth(), 1)
  }
  return { inicioDia, fimDia }
}

// Lista de dias (YYYY-MM-DD) do período, do início ao fim inclusivo
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

// "Seg", "Ter"... a partir de YYYY-MM-DD
function diaSemana(dia) {
  const s = new Date(dia + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default function Relatorios() {
  const { user } = useAuth()
  const toast = useToast()

  const [periodo, setPeriodo] = useState('semana')
  const [loading, setLoading] = useState(true)
  const [visitas, setVisitas] = useState([])
  const [enviados, setEnviados] = useState([])
  const [fechados, setFechados] = useState([])
  const [rotas, setRotas] = useState([])

  // Mapa da rota de um dia
  const [rotaDia, setRotaDia] = useState(null) // 'YYYY-MM-DD'
  const [carregandoRota, setCarregandoRota] = useState(false)
  const [pontosDia, setPontosDia] = useState([])
  const [visitasDia, setVisitasDia] = useState([])
  const [paradasDia, setParadasDia] = useState([])

  const { inicioDia, fimDia } = useMemo(() => calcularPeriodo(periodo), [periodo])

  async function abrirRota(dia) {
    setRotaDia(dia)
    setCarregandoRota(true)
    setPontosDia([])
    setVisitasDia([])
    setParadasDia([])
    const [rPontos, rVisitas, rPausas, rClientes] = await Promise.all([
      supabase
        .from('rota_pontos')
        .select('lat, lng, capturado_em')
        .eq('perfil_id', user.id)
        .eq('data', dia)
        .order('capturado_em', { ascending: true }),
      supabase
        .from('visitas')
        .select('lat, lng, cliente_nome, criado_em')
        .eq('perfil_id', user.id)
        .eq('data', dia),
      supabase
        .from('rota_pausas')
        .select('tipo, inicio, fim')
        .eq('perfil_id', user.id)
        .eq('data', dia)
        .order('inicio', { ascending: true }),
      supabase
        .from('clientes')
        .select('razao_social, nome_fantasia, lat, lng')
        .not('lat', 'is', null),
    ])
    if (rPontos.error || rVisitas.error) toast('Erro ao carregar a rota')
    const pontos = rPontos.data || []
    const visitas = rVisitas.data || []
    const pausas = rPausas.data || []
    const clientesGeo = rClientes.data || []

    // paradas detectadas pelo GPS, classificadas
    const paradas = detectarParadas(pontos).map((p) => ({ ...p, ...classificarParada(p, visitas, pausas, clientesGeo) }))
    // pausas registradas que não coincidiram com nenhuma parada do GPS entram na linha do tempo mesmo assim
    pausas.forEach((pa) => {
      const ini = new Date(pa.inicio).getTime()
      const fim = pa.fim ? new Date(pa.fim).getTime() : null
      const coberta = paradas.some((p) => p.tipo === 'pausa' && p.inicio < (fim ?? ini + 3600000) && p.fim > ini)
      if (!coberta) {
        paradas.push({
          lat: null,
          lng: null,
          inicio: ini,
          fim: fim ?? ini,
          minutos: fim ? Math.round((fim - ini) / 60000) : null,
          rotulo: pa.tipo === 'almoco' ? 'Almoço (pausa registrada)' : 'Pausa particular (registrada)',
          tipo: 'pausa',
        })
      }
    })
    paradas.sort((a, b) => a.inicio - b.inicio)

    setPontosDia(pontos)
    setVisitasDia(visitas.filter((v) => v.lat != null && v.lng != null))
    setParadasDia(paradas)
    setCarregandoRota(false)
  }

  useEffect(() => {
    async function carregar() {
      if (!user) return
      setLoading(true)

      const inicioStr = diaLocal(inicioDia)
      const fimStr = diaLocal(fimDia)
      const inicioISO = inicioDia.toISOString()
      // fim exclusivo: dia seguinte ao fim, meia-noite local
      const fimExcl = new Date(fimDia)
      fimExcl.setDate(fimExcl.getDate() + 1)
      const fimExclISO = fimExcl.toISOString()

      const [rVisitas, rEnviados, rFechados, rRotas] = await Promise.all([
        supabase
          .from('visitas')
          .select('id, data')
          .eq('perfil_id', user.id)
          .gte('data', inicioStr)
          .lte('data', fimStr),
        supabase
          .from('orcamentos')
          .select('id, total, enviado_em')
          .eq('perfil_id', user.id)
          .in('status', ['enviado', 'fechado'])
          .gte('enviado_em', inicioISO)
          .lt('enviado_em', fimExclISO),
        supabase
          .from('orcamentos')
          .select('id, total, fechado_em')
          .eq('perfil_id', user.id)
          .eq('status', 'fechado')
          .gte('fechado_em', inicioISO)
          .lt('fechado_em', fimExclISO),
        supabase
          .from('rotas')
          .select('km, data')
          .eq('perfil_id', user.id)
          .gte('data', inicioStr)
          .lte('data', fimStr),
      ])

      if (rVisitas.error || rEnviados.error || rFechados.error || rRotas.error) {
        toast('Erro ao carregar relatório')
      }
      setVisitas(rVisitas.data || [])
      setEnviados(rEnviados.data || [])
      setFechados(rFechados.data || [])
      setRotas(rRotas.data || [])
      setLoading(false)
    }
    carregar()
  }, [user, inicioDia, fimDia])

  const totalVisitas = visitas.length
  const totalEnviados = enviados.length
  const totalFechados = fechados.length
  const valorEnviado = enviados.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const valorFechado = fechados.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const totalKm = rotas.reduce((s, r) => s + (Number(r.km) || 0), 0)
  const conversao = totalEnviados > 0 ? (totalFechados / totalEnviados) * 100 : 0

  // Resumo diário agrupado no client
  const resumoDiario = useMemo(() => {
    const dias = listaDias(inicioDia, fimDia)
    const mapa = {}
    dias.forEach((d) => {
      mapa[d] = { dia: d, visitas: 0, enviados: 0, fechados: 0, km: 0 }
    })
    visitas.forEach((v) => {
      const k = v.data
      if (mapa[k]) mapa[k].visitas += 1
    })
    enviados.forEach((o) => {
      const k = diaLocal(o.enviado_em)
      if (mapa[k]) mapa[k].enviados += 1
    })
    fechados.forEach((o) => {
      const k = diaLocal(o.fechado_em)
      if (mapa[k]) mapa[k].fechados += 1
    })
    rotas.forEach((r) => {
      const k = r.data
      if (mapa[k]) mapa[k].km += Number(r.km) || 0
    })
    // mais recente primeiro
    return dias.map((d) => mapa[d]).reverse()
  }, [visitas, enviados, fechados, rotas, inicioDia, fimDia])

  const semDados =
    totalVisitas === 0 && totalEnviados === 0 && totalFechados === 0 && totalKm === 0

  return (
    <div>
      <div className="section-title mb">Relatórios</div>

      <div className="row mb">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            className={`btn btn-sm ${periodo === c.id ? 'btn-azul' : 'btn-outline'}`}
            onClick={() => setPeriodo(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="muted mb">
        {fmtData(inicioDia)} — {fmtData(fimDia)}
      </div>

      {loading ? (
        <div className="center"><div className="spin" /></div>
      ) : semDados ? (
        <div className="empty">Nenhum dado registrado neste período.</div>
      ) : (
        <>
          <div className="kpi-grid mb">
            <div className="kpi">
              <div className="v mono">{numero(totalVisitas)}</div>
              <div className="l">Visitas</div>
            </div>
            <div className="kpi">
              <div className="v mono">{numero(totalEnviados)}</div>
              <div className="l">Orçamentos enviados</div>
            </div>
            <div className="kpi">
              <div className="v mono">{numero(totalFechados)}</div>
              <div className="l">Fechados</div>
            </div>
            <div className="kpi">
              <div className="v mono">{numero(totalKm, 1)}</div>
              <div className="l">KM rodados</div>
            </div>
            <div className="kpi laranja">
              <div className="v mono">{brl(valorFechado)}</div>
              <div className="l">Valor fechado</div>
            </div>
            <div className="kpi">
              <div className="v mono">{numero(conversao, 1)}%</div>
              <div className="l">Conversão</div>
            </div>
          </div>

          <div className="card">
            <div className="between mb">
              <div className="section-title" style={{ margin: 0 }}>Resumo diário</div>
              <div className="muted" style={{ fontSize: 12, textAlign: 'right' }}>
                Enviados: {brl(valorEnviado)}<br />Fechados: {brl(valorFechado)}
              </div>
            </div>
            {resumoDiario.map((r) => {
              const vazio = r.visitas === 0 && r.enviados === 0 && r.fechados === 0 && r.km === 0
              const ehHoje = r.dia === diaLocal(new Date())
              return (
                <div key={r.dia} className="list-item" style={vazio ? { opacity: 0.45 } : undefined}>
                  <div className="grow">
                    <div className="title">
                      {ehHoje ? 'Hoje' : diaSemana(r.dia)} · {fmtData(r.dia)}
                    </div>
                    <div className="sub">
                      {vazio
                        ? 'Sem atividade'
                        : [
                            r.visitas > 0 && `${numero(r.visitas)} visita${r.visitas > 1 ? 's' : ''}`,
                            r.enviados > 0 && `${numero(r.enviados)} orç. enviado${r.enviados > 1 ? 's' : ''}`,
                            r.fechados > 0 && `${numero(r.fechados)} fechado${r.fechados > 1 ? 's' : ''}`,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Só deslocamento'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono">{r.km > 0 ? `${numero(r.km, 1)} km` : '—'}</div>
                    {(r.km > 0 || r.visitas > 0) && (
                      <button className="btn btn-outline btn-sm mt" onClick={() => abrirRota(r.dia)}>
                        🗺️ Rota
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {rotaDia && (
        <Modal titulo={`Rota de ${fmtData(rotaDia)}`} onClose={() => setRotaDia(null)}>
          {carregandoRota ? (
            <div className="center"><div className="spin" /></div>
          ) : pontosDia.length === 0 && visitasDia.length === 0 ? (
            <div className="empty">Sem trajeto ou visitas com localização neste dia.</div>
          ) : (
            <>
              <MapaRota pontos={pontosDia} visitas={visitasDia} paradas={paradasDia.filter((p) => p.lat != null)} />
              <div className="muted mt">
                {pontosDia.length > 0 ? `${numero(pontosDia.length)} pontos de trajeto` : 'Sem trajeto registrado'}
                {' · '}
                {numero(visitasDia.length)} visita(s) no mapa
              </div>

              {paradasDia.length > 0 && (
                <>
                  <div className="section-title mt">Linha do tempo das paradas</div>
                  {paradasDia.map((p, i) => (
                    <div key={i} className="list-item">
                      <div className="grow">
                        <div className="title">
                          {p.tipo === 'visita' ? '🟠 ' : p.tipo === 'pausa' ? '⏸ ' : p.tipo === 'cliente' ? '🏢 ' : p.tipo === 'almoco' ? '🍽 ' : '❓ '}
                          {p.rotulo}
                        </div>
                        <div className="sub">
                          {hm(p.inicio)}{p.fim && p.fim !== p.inicio ? `–${hm(p.fim)}` : ''}
                          {p.minutos != null ? ` · ${numero(p.minutos)} min` : ' · em andamento'}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div className="muted mt" style={{ fontSize: 12 }}>
                    Paradas detectadas pelo GPS (10+ min no mesmo lugar) cruzadas com visitas, pausas e clientes cadastrados.
                  </div>
                </>
              )}
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
