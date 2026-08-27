import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { distanciaKm } from '../lib/geo'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { hoje } from '../lib/format'

/*
  Controla a "plataforma ligada/desligada":
  - Enquanto LIGADA, acompanha o GPS (watchPosition) e soma os KM rodados.
  - Só conta KM com a plataforma ligada -> o trajeto de casa/para casa não entra.
  - Grava o trajeto (pontos GPS) na tabela `rota_pontos` para o mapa da rota.
  - Mantém a tela acordada (Wake Lock) para o GPS não ser suspenso pelo navegador.
  - Respeita o horário de expediente: passado o horário de fim, avisa para desligar.
  - Persiste o total do dia em localStorage (resiliente) e sincroniza com a tabela `rotas`.
*/

const Ctx = createContext(null)
export const useExpediente = () => useContext(Ctx)

const CHAVE = 'granvendas_rota'

// Filtros do GPS (evitam que o contador congele ou conte ruído)
const ACC_MAX_M = 120        // descarta leituras com erro > 120 m
const MOV_MIN_KM = 0.01      // ignora tremor de GPS parado (< 10 m)
const VEL_MAX_KMH = 200      // descarta "saltos" impossíveis (glitch de GPS)
const DIST_GRAVA_KM = 0.02   // só grava um ponto do trajeto a cada ~20 m
const LOTE_PONTOS = 8        // envia os pontos ao banco em lotes

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
  const [pausa, setPausa] = useState(() => carregarLocal()?.pausa || null)
  const [ultimaPos, setUltimaPos] = useState(null)
  const [config, setConfig] = useState({ hora_inicio: '08:00', hora_fim: '18:00', meta_visitas: 8 })
  const [avisoFimExpediente, setAvisoFimExpediente] = useState(false)

  const watchId = useRef(null)
  const wakeLock = useRef(null)
  const posRef = useRef(carregarLocal()?.ultima || null) // âncora p/ cálculo de distância
  const kmRef = useRef(carregarLocal()?.km || 0)
  const ligadaRef = useRef(false)
  const bufferRef = useRef([])          // pontos ainda não gravados no banco
  const ultimoGravadoRef = useRef(null) // último ponto gravado (p/ espaçar o trajeto)
  const pausaRef = useRef(carregarLocal()?.pausa || null)

  // carrega config do vendedor
  useEffect(() => {
    if (!user) return
    supabase.from('configuracoes').select('*').eq('perfil_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setConfig(data) })
  }, [user])

  const salvarLocal = useCallback(() => {
    localStorage.setItem(CHAVE, JSON.stringify({ dia: hoje(), km: kmRef.current, ultima: posRef.current, pausa: pausaRef.current }))
  }, [])

  // Envia os pontos acumulados para o banco (em lote). Em caso de erro, devolve ao buffer.
  const flushPontos = useCallback(async () => {
    if (!user || bufferRef.current.length === 0) return
    const lote = bufferRef.current.splice(0, bufferRef.current.length)
    const linhas = lote.map((p) => ({
      perfil_id: user.id,
      data: hoje(),
      lat: p.lat,
      lng: p.lng,
      capturado_em: p.capturado_em,
    }))
    const { error } = await supabase.from('rota_pontos').insert(linhas)
    if (error) bufferRef.current.unshift(...lote) // tenta de novo depois
  }, [user])

  // Mantém a tela acordada para o navegador não suspender o GPS em segundo plano.
  const pedirWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && !wakeLock.current) {
        wakeLock.current = await navigator.wakeLock.request('screen')
        wakeLock.current.addEventListener?.('release', () => { wakeLock.current = null })
      }
    } catch { /* Wake Lock indisponível: segue sem ela */ }
  }, [])

  const soltarWakeLock = useCallback(() => {
    try { wakeLock.current?.release?.() } catch { /* ignore */ }
    wakeLock.current = null
  }, [])

  // Trata cada leitura do GPS
  const aoPosicionar = useCallback((p) => {
    if (pausaRef.current) return // em pausa (almoço/particular): não conta KM nem grava trajeto
    const acc = p.coords.accuracy
    if (acc != null && acc > ACC_MAX_M) return // leitura ruim: ignora
    const nova = { lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp || Date.now() }
    const ant = posRef.current

    if (ant) {
      const d = distanciaKm(ant.lat, ant.lng, nova.lat, nova.lng)
      const dtSeg = Math.max(1, (nova.t - (ant.t || nova.t)) / 1000)
      const velKmh = (d / dtSeg) * 3600
      // Aceita movimento real e velocidade plausível.
      // Um intervalo longo (tela bloqueada) gera dt grande -> velocidade baixa -> ainda é aceito.
      // Só descarta "teleportes" (glitch de GPS): muita distância em pouquíssimo tempo.
      if (d < MOV_MIN_KM || velKmh > VEL_MAX_KMH) return

      kmRef.current += d
      setKmHoje(kmRef.current)

      // Grava um ponto do trajeto espaçado (bounded)
      const ug = ultimoGravadoRef.current
      if (!ug || distanciaKm(ug.lat, ug.lng, nova.lat, nova.lng) > DIST_GRAVA_KM) {
        bufferRef.current.push({ lat: nova.lat, lng: nova.lng, capturado_em: new Date(nova.t).toISOString() })
        ultimoGravadoRef.current = nova
        if (bufferRef.current.length >= LOTE_PONTOS) flushPontos()
      }
    } else {
      // primeira âncora do trecho: grava também o ponto de partida
      bufferRef.current.push({ lat: nova.lat, lng: nova.lng, capturado_em: new Date(nova.t).toISOString() })
      ultimoGravadoRef.current = nova
    }

    posRef.current = nova
    setUltimaPos({ lat: nova.lat, lng: nova.lng })
    salvarLocal()
  }, [flushPontos, salvarLocal])

  const iniciarWatch = useCallback(() => {
    if (watchId.current != null) return
    watchId.current = navigator.geolocation.watchPosition(
      aoPosicionar,
      (e) => console.warn('GPS erro', e),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )
  }, [aoPosicionar])

  // registra o fim de uma pausa em aberto
  const fecharPausa = useCallback(async () => {
    const p = pausaRef.current
    if (!p) return
    pausaRef.current = null
    setPausa(null)
    if (user && p.id) {
      await supabase.from('rota_pausas').update({ fim: new Date().toISOString() }).eq('id', p.id)
    }
  }, [user])

  const pausar = useCallback(async (tipo) => {
    if (!user || pausaRef.current || !ligadaRef.current) return
    const inicio = new Date().toISOString()
    const { data } = await supabase
      .from('rota_pausas')
      .insert({ perfil_id: user.id, data: hoje(), tipo, inicio })
      .select()
      .single()
    const p = { id: data?.id || null, tipo, inicio }
    pausaRef.current = p
    setPausa(p)
    // zera a âncora: o deslocamento durante a pausa não conta
    posRef.current = null
    ultimoGravadoRef.current = null
    salvarLocal()
  }, [user, salvarLocal])

  const retomar = useCallback(async () => {
    await fecharPausa()
    posRef.current = null
    ultimoGravadoRef.current = null
    salvarLocal()
  }, [fecharPausa, salvarLocal])

  const desligar = useCallback(async (motivo = 'manual') => {
    await fecharPausa()
    if (watchId.current != null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null }
    soltarWakeLock()
    setLigada(false)
    ligadaRef.current = false
    posRef.current = null
    setUltimaPos(null)
    salvarLocal()
    await flushPontos()
    if (user) {
      await supabase.from('rotas').upsert(
        { perfil_id: user.id, data: hoje(), km: Number(kmRef.current.toFixed(2)), encerrado_em: new Date().toISOString(), motivo_fim: motivo },
        { onConflict: 'perfil_id,data' }
      )
    }
  }, [user, salvarLocal, flushPontos, soltarWakeLock, fecharPausa])

  const ligar = useCallback(() => {
    if (!navigator.geolocation) { alert('GPS não disponível neste dispositivo.'); return }
    setLigada(true)
    ligadaRef.current = true
    setAvisoFimExpediente(false)
    posRef.current = null           // recomeça a âncora ao ligar
    ultimoGravadoRef.current = null
    pedirWakeLock()
    iniciarWatch()
    if (user) {
      supabase.from('rotas').upsert(
        { perfil_id: user.id, data: hoje(), iniciado_em: new Date().toISOString() },
        { onConflict: 'perfil_id,data' }
      )
    }
  }, [user, pedirWakeLock, iniciarWatch])

  // Reage à volta do app ao primeiro plano: reobtém Wake Lock e garante o watch ativo.
  useEffect(() => {
    function aoVisibilidade() {
      if (document.visibilityState === 'visible' && ligadaRef.current) {
        pedirWakeLock()
        iniciarWatch() // reArma o watch caso o navegador o tenha suspendido
        flushPontos()
      }
    }
    document.addEventListener('visibilitychange', aoVisibilidade)
    return () => document.removeEventListener('visibilitychange', aoVisibilidade)
  }, [pedirWakeLock, iniciarWatch, flushPontos])

  // Descarga periódica dos pontos (resiliência caso o app feche sem desligar)
  useEffect(() => {
    if (!ligada) return
    const t = setInterval(() => { flushPontos() }, 30000)
    return () => clearInterval(t)
  }, [ligada, flushPontos])

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

  const valor = { ligada, ligar, desligar, kmHoje, ultimaPos, config, setConfig, avisoFimExpediente, setAvisoFimExpediente, pausa, pausar, retomar }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
