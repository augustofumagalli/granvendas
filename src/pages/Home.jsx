import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useExpediente } from '../context/ExpedienteContext'
import Modal from '../components/Modal'
import { brl, numero, data, hoje } from '../lib/format'

export default function Home() {
  const { user, perfil } = useAuth()
  const { ligada, ligar, desligar, kmHoje, config, avisoFimExpediente, setAvisoFimExpediente, pausa, pausar, retomar, telaTravada } = useExpediente()

  const horaDe = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  const [loading, setLoading] = useState(true)
  const [visitasHoje, setVisitasHoje] = useState(0)
  const [enviadosMes, setEnviadosMes] = useState(0)
  const [fechadosMes, setFechadosMes] = useState(0)
  const [totalFechado, setTotalFechado] = useState(0)

  const meta = Number(config?.meta_visitas || 0)
  const saldo = visitasHoje - meta

  useEffect(() => {
    if (!user) return
    let vivo = true
    async function carregar() {
      setLoading(true)
      const inicioMes = hoje().slice(0, 8) + '01'

      const [rVisitas, rEnviados, rFechados] = await Promise.all([
        supabase
          .from('visitas')
          .select('id', { count: 'exact', head: true })
          .eq('perfil_id', user.id)
          .eq('data', hoje()),
        supabase
          .from('orcamentos')
          .select('id', { count: 'exact', head: true })
          .eq('perfil_id', user.id)
          .in('status', ['enviado', 'fechado'])
          .gte('enviado_em', inicioMes),
        supabase
          .from('orcamentos')
          .select('total')
          .eq('perfil_id', user.id)
          .eq('status', 'fechado')
          .gte('fechado_em', inicioMes),
      ])

      if (!vivo) return
      setVisitasHoje(rVisitas.count || 0)
      setEnviadosMes(rEnviados.count || 0)
      const fechados = rFechados.data || []
      setFechadosMes(fechados.length)
      setTotalFechado(fechados.reduce((s, o) => s + (Number(o.total) || 0), 0))
      setLoading(false)
    }
    carregar()
    return () => { vivo = false }
  }, [user])

  return (
    <div>
      <div className="section-title">Olá, {perfil?.nome || 'vendedor'}</div>
      <div className="muted mb">{data(hoje())}</div>

      <div className="card mb center">
        {ligada ? (
          pausa ? (
            <>
              <div className="badge badge-laranja mb">
                ⏸ Em pausa ({pausa.tipo === 'almoco' ? 'almoço' : 'particular'}) desde {horaDe(pausa.inicio)}
              </div>
              <button className="btn btn-verde" onClick={retomar}>▶ Retomar trabalho</button>
              <div className="muted mt">Durante a pausa os KM não contam e o trajeto não é gravado.</div>
            </>
          ) : (
            <>
              <button className="btn btn-azul" onClick={() => desligar('manual')}>⏸ Desligar plataforma</button>
              <div className="row mt">
                <button className="btn btn-outline btn-sm grow" onClick={() => pausar('almoco')}>🍽 Pausa almoço</button>
                <button className="btn btn-outline btn-sm grow" onClick={() => pausar('particular')}>⏸ Pausa particular</button>
              </div>
              <div className="mt mono">{numero(kmHoje, 1)} km rodados hoje</div>
              {telaTravada && (
                <div className="badge badge-verde mt">🔆 Tela não apaga enquanto a plataforma estiver ligada</div>
              )}
            </>
          )
        ) : (
          <button className="btn btn-verde" onClick={() => ligar()}>▶ Ligar plataforma</button>
        )}
        <div className="muted mt">
          Ligue ao começar a rodar e deixe o app aberto na tela (como o GPS do Maps). Os KM só contam com a plataforma ligada.
        </div>
      </div>

      {loading ? (
        <div className="center"><div className="spin" /></div>
      ) : (
        <div className="kpi-grid mb">
          <div className={'kpi' + (saldo < 0 ? ' laranja' : '')}>
            <div className="v">{numero(visitasHoje)} / {numero(meta)}</div>
            <div className="l">Visitas hoje</div>
            {saldo >= 0 ? (
              <span className="badge badge-verde">+{numero(saldo)} acima da meta</span>
            ) : (
              <span className="badge badge-laranja">{numero(saldo)} abaixo da meta</span>
            )}
          </div>

          <div className="kpi">
            <div className="v">{numero(enviadosMes)}</div>
            <div className="l">Orçamentos enviados no mês</div>
          </div>

          <div className="kpi">
            <div className="v">{numero(fechadosMes)}</div>
            <div className="l">Fechados no mês</div>
            <span className="badge badge-verde">{brl(totalFechado)}</span>
          </div>

          <div className="kpi">
            <div className="v">{numero(kmHoje, 1)} km</div>
            <div className="l">KM hoje</div>
          </div>
        </div>
      )}

      <div className="section-title">Atalhos rápidos</div>
      <div className="row">
        <Link className="btn btn-azul grow" to="/orcamentos">Novo orçamento</Link>
        <Link className="btn btn-outline grow" to="/visitas">Registrar visita</Link>
      </div>

      {avisoFimExpediente && (
        <Modal titulo="Fim do expediente" onClose={() => setAvisoFimExpediente(false)}>
          <p>Seu horário de trabalho terminou. Deseja desligar a plataforma?</p>
          <div className="row mt">
            <button
              className="btn btn-azul grow"
              onClick={() => { desligar('fim_expediente'); setAvisoFimExpediente(false) }}
            >
              Desligar agora
            </button>
            <button className="btn btn-outline grow" onClick={() => setAvisoFimExpediente(false)}>
              Continuar
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
