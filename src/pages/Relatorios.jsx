import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { brl, numero, data as fmtData } from '../lib/format'
import Modal from '../components/Modal'
import MapaRota from '../components/MapaRota'

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

  const { inicioDia, fimDia } = useMemo(() => calcularPeriodo(periodo), [periodo])

  async function abrirRota(dia) {
    setRotaDia(dia)
    setCarregandoRota(true)
    setPontosDia([])
    setVisitasDia([])
    const [rPontos, rVisitas] = await Promise.all([
      supabase
        .from('rota_pontos')
        .select('lat, lng, capturado_em')
        .eq('perfil_id', user.id)
        .eq('data', dia)
        .order('capturado_em', { ascending: true }),
      supabase
        .from('visitas')
        .select('lat, lng, cliente_nome')
        .eq('perfil_id', user.id)
        .eq('data', dia),
    ])
    if (rPontos.error || rVisitas.error) toast('Erro ao carregar a rota')
    setPontosDia(rPontos.data || [])
    setVisitasDia((rVisitas.data || []).filter((v) => v.lat != null && v.lng != null))
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
              <MapaRota pontos={pontosDia} visitas={visitasDia} />
              <div className="muted mt">
                {pontosDia.length > 0 ? `${numero(pontosDia.length)} pontos de trajeto` : 'Sem trajeto registrado'}
                {' · '}
                {numero(visitasDia.length)} visita(s) no mapa
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  )
}
