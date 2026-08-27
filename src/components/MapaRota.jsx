import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/*
  Desenha no mapa (OpenStreetMap) o trajeto do dia (polyline laranja) e as
  visitas registradas (marcadores). Usa circleMarker para não depender das
  imagens de ícone do Leaflet (que quebram no bundle do Vite).

  O trajeto cru do GPS tem buracos (tela bloqueada suspende o GPS), o que
  vira "retas" no mapa. Por isso tentamos encaixar os pontos nas ruas com o
  OSRM (roteador público do OpenStreetMap); se o serviço falhar, fica a
  linha crua tracejada.

  props:
   - pontos:  [{ lat, lng }]  trajeto em ordem cronológica
   - visitas: [{ lat, lng, cliente_nome }]
*/

// Encaixa a sequência de pontos GPS nas ruas (map matching do OSRM).
async function trajetoNasRuas(linha) {
  // o serviço aceita ~100 coordenadas: amostra mantendo início e fim
  const passo = Math.max(1, Math.ceil(linha.length / 80))
  const amostra = linha.filter((_, i) => i % passo === 0)
  const ultimo = linha[linha.length - 1]
  if (amostra[amostra.length - 1] !== ultimo) amostra.push(ultimo)

  const coords = amostra.map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`).join(';')
  const radiuses = amostra.map(() => 45).join(';')
  const url = `https://router.project-osrm.org/match/v1/driving/${coords}?overview=full&geometries=geojson&radiuses=${radiuses}&tidy=true&gaps=ignore`
  const r = await fetch(url)
  if (!r.ok) throw new Error('OSRM indisponível')
  const d = await r.json()
  if (d.code !== 'Ok' || !d.matchings?.length) throw new Error('sem correspondência')
  const caminho = []
  d.matchings.forEach((m) => m.geometry.coordinates.forEach(([ln, la]) => caminho.push([la, ln])))
  if (caminho.length < 2) throw new Error('trajeto vazio')
  return caminho
}

export default function MapaRota({ pontos = [], visitas = [] }) {
  const el = useRef(null)
  const mapa = useRef(null)

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { attributionControl: true })
    mapa.current = map
    let vivo = true

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    const linha = (pontos || []).filter((p) => p && p.lat != null && p.lng != null).map((p) => [p.lat, p.lng])
    const limites = []

    if (linha.length > 1) {
      // linha crua (tracejada) sai na hora; se o encaixe nas ruas der certo, ela é substituída
      const cru = L.polyline(linha, { color: '#F58220', weight: 3, opacity: 0.55, dashArray: '6 8' }).addTo(map)
      trajetoNasRuas(linha)
        .then((caminho) => {
          if (!vivo) return
          map.removeLayer(cru)
          L.polyline(caminho, { color: '#F58220', weight: 4, opacity: 0.9 }).addTo(map)
        })
        .catch(() => {
          if (!vivo) return
          cru.setStyle({ opacity: 0.9, dashArray: null, weight: 4 }) // fallback: linha crua vira a oficial
        })
      limites.push(...linha)
      L.circleMarker(linha[0], { radius: 7, weight: 2, color: '#fff', fillColor: '#1e9e57', fillOpacity: 1 })
        .addTo(map).bindPopup('Início do trajeto')
      L.circleMarker(linha[linha.length - 1], { radius: 7, weight: 2, color: '#fff', fillColor: '#173D5C', fillOpacity: 1 })
        .addTo(map).bindPopup('Fim do trajeto')
    } else if (linha.length === 1) {
      limites.push(linha[0])
    }

    ;(visitas || []).forEach((v) => {
      if (v.lat == null || v.lng == null) return
      L.circleMarker([v.lat, v.lng], { radius: 8, weight: 2, color: '#fff', fillColor: '#F58220', fillOpacity: 1 })
        .addTo(map)
        .bindPopup(v.cliente_nome || 'Visita')
      limites.push([v.lat, v.lng])
    })

    if (limites.length) {
      map.fitBounds(limites, { padding: [24, 24], maxZoom: 16 })
    } else {
      map.setView([-15.78, -47.93], 4) // Brasil (fallback sem dados)
    }

    // o mapa é montado dentro de um modal: recalcula o tamanho após abrir
    const t = setTimeout(() => map.invalidateSize(), 120)

    return () => { vivo = false; clearTimeout(t); map.remove(); mapa.current = null }
  }, [pontos, visitas])

  return <div ref={el} style={{ width: '100%', height: 360, borderRadius: 12, overflow: 'hidden' }} />
}
