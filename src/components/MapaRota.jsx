import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

/*
  Desenha no mapa (OpenStreetMap) o trajeto do dia (polyline laranja) e as
  visitas registradas (marcadores). Usa circleMarker para não depender das
  imagens de ícone do Leaflet (que quebram no bundle do Vite).

  props:
   - pontos:  [{ lat, lng }]  trajeto em ordem cronológica
   - visitas: [{ lat, lng, cliente_nome }]
*/
export default function MapaRota({ pontos = [], visitas = [] }) {
  const el = useRef(null)
  const mapa = useRef(null)

  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { attributionControl: true })
    mapa.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(map)

    const linha = (pontos || []).filter((p) => p && p.lat != null && p.lng != null).map((p) => [p.lat, p.lng])
    const limites = []

    if (linha.length > 1) {
      L.polyline(linha, { color: '#F58220', weight: 4, opacity: 0.9 }).addTo(map)
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

    return () => { clearTimeout(t); map.remove(); mapa.current = null }
  }, [pontos, visitas])

  return <div ref={el} style={{ width: '100%', height: 360, borderRadius: 12, overflow: 'hidden' }} />
}
