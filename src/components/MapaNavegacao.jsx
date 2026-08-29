import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { distanciaKm } from '../lib/geo'
import { numero } from '../lib/format'

/*
  GPS do GranVendas: rota pelas ruas da posição atual até o destino, com a
  posição ao vivo (roteador OSRM/OpenStreetMap).

  - modo padrão: mapa com a rota, distância e tempo (usado no cartão do roteiro)
  - modo `navegando`: tela de navegação — o mapa segue o carro, mostra a
    próxima instrução de curva ("Em 300 m, vire à direita na Rua X") e
    recalcula sozinho se sair da rota. Sem voz — mas o app nunca sai da
    frente, então o rastreio de KM conta tudo.

  props: destino { lat, lng, nome } · navegando (bool) · altura (px | '100%')
*/

const MODIFICADOR = {
  left: 'à esquerda',
  right: 'à direita',
  'slight left': 'levemente à esquerda',
  'slight right': 'levemente à direita',
  'sharp left': 'fechada à esquerda',
  'sharp right': 'fechada à direita',
  straight: 'em frente',
  uturn: 'o retorno',
}

const SETA = {
  left: '⬅', right: '➡', 'slight left': '↖', 'slight right': '↗',
  'sharp left': '⬅', 'sharp right': '➡', straight: '⬆', uturn: '⤸',
}

function textoPasso(s) {
  const nome = s.name ? ` na ${s.name}` : ''
  const t = s.maneuver?.type
  const mod = s.maneuver?.modifier
  if (t === 'depart') return `Siga em frente${nome}`
  if (t === 'arrive') return 'Você chegou ao destino 🎉'
  if (t === 'roundabout' || t === 'rotary')
    return `Na rotatória, pegue a ${s.maneuver?.exit || ''}ª saída${nome}`
  const m = MODIFICADOR[mod]
  if (!m || m === 'em frente') return `Continue em frente${nome}`
  if (m === 'o retorno') return `Faça o retorno${nome}`
  return `Vire ${m}${nome}`
}

async function rotaOSRM(orig, dest) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${orig.lng.toFixed(6)},${orig.lat.toFixed(6)};${dest.lng.toFixed(6)},${dest.lat.toFixed(6)}` +
    `?overview=full&geometries=geojson&steps=true`
  const r = await fetch(url)
  if (!r.ok) throw new Error('roteador indisponível')
  const d = await r.json()
  if (d.code !== 'Ok' || !d.routes?.length) throw new Error('sem rota')
  const rota = d.routes[0]
  const passos = (rota.legs || []).flatMap((leg) =>
    (leg.steps || []).map((s) => ({
      lat: s.maneuver.location[1],
      lng: s.maneuver.location[0],
      texto: textoPasso(s),
      seta: s.maneuver?.type === 'arrive' ? '🏁' : SETA[s.maneuver?.modifier] || '⬆',
    }))
  )
  return {
    caminho: rota.geometry.coordinates.map(([ln, la]) => [la, ln]),
    km: rota.distance / 1000,
    minutos: Math.round(rota.duration / 60),
    passos,
  }
}

export default function MapaNavegacao({ destino, navegando = false, altura = 320 }) {
  const el = useRef(null)
  const mapaRef = useRef(null)
  const marcadorRef = useRef(null)
  const linhaRef = useRef(null)
  const origemRotaRef = useRef(null) // origem usada no último cálculo
  const caminhoRef = useRef(null)
  const passosRef = useRef([])
  const idxPassoRef = useRef(0)
  const seguiuRef = useRef(false) // já centralizou no carro alguma vez?
  const [info, setInfo] = useState(null) // { km, minutos } | { erro }
  const [pos, setPos] = useState(null)
  const [instrucao, setInstrucao] = useState(null) // { seta, texto, metros }

  // mapa base + destino
  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { attributionControl: !navegando })
    mapaRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    L.circleMarker([destino.lat, destino.lng], { radius: 9, weight: 2, color: '#fff', fillColor: '#F58220', fillOpacity: 1 })
      .addTo(map)
      .bindPopup(destino.nome || 'Destino')
    map.setView([destino.lat, destino.lng], 14)
    const t = setTimeout(() => map.invalidateSize(), 120)
    return () => {
      clearTimeout(t); map.remove()
      mapaRef.current = null; marcadorRef.current = null; linhaRef.current = null
      origemRotaRef.current = null; caminhoRef.current = null; seguiuRef.current = false
    }
  }, [destino.lat, destino.lng, destino.nome, navegando])

  // posição ao vivo (watch próprio, funciona mesmo com a plataforma desligada)
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // bolinha, seguir o carro, instruções e (re)cálculo da rota
  useEffect(() => {
    const map = mapaRef.current
    if (!map || !pos) return

    if (!marcadorRef.current) {
      marcadorRef.current = L.circleMarker([pos.lat, pos.lng], { radius: 8, weight: 3, color: '#fff', fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map)
    } else {
      marcadorRef.current.setLatLng([pos.lat, pos.lng])
    }

    // navegando: o mapa acompanha o carro
    if (navegando) {
      map.setView([pos.lat, pos.lng], seguiuRef.current ? map.getZoom() : 17, { animate: true })
      seguiuRef.current = true
    }

    // instrução atual: avança quando o carro passa pelo ponto da manobra
    const passos = passosRef.current
    if (navegando && passos.length) {
      while (
        idxPassoRef.current < passos.length - 1 &&
        distanciaKm(pos.lat, pos.lng, passos[idxPassoRef.current].lat, passos[idxPassoRef.current].lng) < 0.04
      ) {
        idxPassoRef.current++
      }
      const p = passos[idxPassoRef.current]
      if (p) {
        const metros = Math.round(distanciaKm(pos.lat, pos.lng, p.lat, p.lng) * 1000)
        setInstrucao({ seta: p.seta, texto: p.texto, metros })
      }
    }

    // saiu da rota (a mais de ~80 m do traçado)? força recálculo
    const caminho = caminhoRef.current
    if (caminho && origemRotaRef.current) {
      let perto = Infinity
      for (let i = 0; i < caminho.length; i += 3) {
        const d = distanciaKm(pos.lat, pos.lng, caminho[i][0], caminho[i][1])
        if (d < perto) perto = d
        if (perto < 0.08) break
      }
      if (perto >= 0.08) origemRotaRef.current = null
    }

    const origem = origemRotaRef.current
    if (origem && distanciaKm(origem.lat, origem.lng, pos.lat, pos.lng) < 0.3) return
    origemRotaRef.current = pos

    let vivo = true
    rotaOSRM(pos, destino)
      .then((r) => {
        if (!vivo || !mapaRef.current) return
        if (linhaRef.current) mapaRef.current.removeLayer(linhaRef.current)
        linhaRef.current = L.polyline(r.caminho, { color: '#1a73e8', weight: 5, opacity: 0.85 }).addTo(mapaRef.current)
        caminhoRef.current = r.caminho
        passosRef.current = r.passos
        idxPassoRef.current = 0
        if (!navegando) mapaRef.current.fitBounds(r.caminho, { padding: [30, 30] })
        setInfo({ km: r.km, minutos: r.minutos })
      })
      .catch(() => {
        if (!vivo || !mapaRef.current) return
        if (linhaRef.current) mapaRef.current.removeLayer(linhaRef.current)
        linhaRef.current = L.polyline([[pos.lat, pos.lng], [destino.lat, destino.lng]], { color: '#1a73e8', weight: 4, opacity: 0.6, dashArray: '6 8' }).addTo(mapaRef.current)
        caminhoRef.current = null
        passosRef.current = []
        if (!navegando) mapaRef.current.fitBounds([[pos.lat, pos.lng], [destino.lat, destino.lng]], { padding: [30, 30] })
        setInfo({ erro: true, km: distanciaKm(pos.lat, pos.lng, destino.lat, destino.lng) })
      })
    return () => { vivo = false }
  }, [pos, destino, navegando])

  if (navegando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
        {/* cabeçalho: destino + distância/tempo */}
        <div
          style={{
            background: '#173D5C', color: '#fff', borderRadius: 14, padding: '10px 14px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, opacity: 0.75, textTransform: 'uppercase', letterSpacing: 0.5 }}>Indo para</div>
            <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {destino.nome || 'Destino'}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {info ? (
              <>
                <div style={{ fontWeight: 700, fontSize: 16 }} className="mono">{numero(info.km, 1)} km</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>{info.minutos != null ? `~${numero(info.minutos)} min` : 'linha reta'}</div>
              </>
            ) : (
              <div style={{ fontSize: 12, opacity: 0.85 }}>{pos ? 'calculando…' : 'obtendo GPS…'}</div>
            )}
          </div>
        </div>

        {/* próxima instrução */}
        {instrucao && (
          <div
            style={{
              background: '#fff', border: '2px solid #F58220', borderRadius: 14, padding: '12px 14px',
              display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 2px 8px rgba(0,0,0,.08)',
            }}
          >
            <span style={{ fontSize: 30, lineHeight: 1 }}>{instrucao.seta}</span>
            <div style={{ minWidth: 0 }}>
              {instrucao.metros > 30 && (
                <div style={{ fontSize: 13, color: '#F58220', fontWeight: 700 }}>
                  Em {instrucao.metros >= 1000 ? numero(instrucao.metros / 1000, 1) + ' km' : instrucao.metros + ' m'}
                </div>
              )}
              <div style={{ fontWeight: 700, fontSize: 16, color: '#173D5C' }}>{instrucao.texto}</div>
            </div>
          </div>
        )}

        <div ref={el} style={{ width: '100%', flex: 1, minHeight: 160, borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }} />
      </div>
    )
  }

  return (
    <div>
      <div className="between mb">
        <span className="muted">{pos ? 'Sua posição ao vivo no mapa' : 'Obtendo sua localização…'}</span>
        {info && (
          <span className="mono">
            {numero(info.km, 1)} km{info.minutos != null ? ` · ~${numero(info.minutos)} min` : ''}{info.erro ? ' (linha reta)' : ''}
          </span>
        )}
      </div>
      <div ref={el} style={{ width: '100%', height: altura, borderRadius: 12, overflow: 'hidden' }} />
    </div>
  )
}
