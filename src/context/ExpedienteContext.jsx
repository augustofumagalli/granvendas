import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { distanciaKm } from '../lib/geo'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { hoje } from '../lib/format'

/*
  Controla a "plataforma ligada/desligada":
  - Enquanto LIGADA, acompanha o GPS (watchPosition) e soma os KM rodados.
  - Só conta KM com a plataforma ligada -> o trajeto de casa/para casa não entra.
  - Respeita o horário de expediente: passado o horário de fim, avisa para desligar.
  - Persiste o total do dia em localStorage (resiliente) e sincroniza com a tabela `rotas`.
*/

const Ctx = createContext(null)
export const useExpediente = () => useContext(Ctx)

const CHAVE = 'granvendas_rota'

function carregarLocal() {
  try {
    const raw = localStorage.getItem(CHAVE)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (o.dia !== hoje()) return null // zera a cada dia
    return o
  } catch { return null }
}

export function ExpedienteProvider({ children }) {
  const { user } = useAuth()
  const [ligada, setLigada] = useState(false)
  const [kmHoje, setKmHoje] = useState(() => carregarLocal()?.km || 0)
  const [ultimaPos, setUltimaPos] = useState(null)
  const [config, setConfig] = useState({ hora_inicio: '08:00', hora_fim: '18:00', meta_visitas: 8 })
  const [avisoFimExpediente, setAvisoFimExpediente] = useState(false)
  const watchId = useRef(null)
  const posRef = useRef(carregarLocal()?.ultima || null)
  const kmRef = useRef(carregarLocal()?.km || 0)

  // carrega config do vendedor
  useEffect(() => {
    if (!user) return
    supabase.from('configuracoes').select('*').eq('perfil_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setConfig(data) })
  }, [user])

  const salvarLocal = useCallback(() => {
    localStorage.setItem(CHAVE, JSON.stringify({ dia: hoje(), km: kmRef.current, ultima: posRef.current }))
  }, [])

  const desligar = useCallback(async (motivo = 'manual') => {
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    setLigada(false)
    posRef.current = null
    setUltimaPos(null)
    salvarLocal()
    if (user) {
      await supabase.from('rotas').upsert(
        { perfil_id: user.id, data: hoje(), km: Number(kmRef.current.toFixed(2)), encerrado_em: new Date().toISOString(), motivo_fim: motivo },
        { onConflict: 'perfil_id,data' }
      )
    }
  }, [user, salvarLocal])

  const ligar = useCallback(() => {
    if (!navigator.geolocation) { alert('GPS não disponível neste dispositivo.'); return }
    setLigada(true)
    setAvisoFimExpediente(false)
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        const nova = { lat: p.coords.latitude, lng: p.coords.longitude }
        if (posRef.current) {
          const d = distanciaKm(posRef.current.lat, posRef.current.lng, nova.lat, nova.lng)
          // ignora ruído de GPS parado e saltos absurdos
          if (d > 0.02 && d < 3) {
            kmRef.current += d
            setKmHoje(kmRef.current)
          }
        }
        posRef.current = nova
        setUltimaPos(nova)
        salvarLocal()
      },
      (e) => console.warn('GPS erro', e),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )
  }, [salvarLocal])

  // verifica fim de expediente a cada minuto
  useEffect(() => {
    if (!ligada) return
    const t = setInterval(() => {
      const agora = new Date()
      const [h, m] = (config.hora_fim || '18:00').split(':').map(Number)
      if (agora.getHours() > h || (agora.getHours() === h && agora.getMinutes() >= m)) {
        setAvisoFimExpediente(true)
      }
    }, 60000)
    return () => clearInterval(t)
  }, [ligada, config.hora_fim])

  const valor = { ligada, ligar, desligar, kmHoje, ultimaPos, config, setConfig, avisoFimExpediente, setAvisoFimExpediente }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
