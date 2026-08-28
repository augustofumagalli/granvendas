import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { distanciaKm } from '../lib/geo'
import { numero } from '../lib/format'

/*
  "GPS simplificado" do roteiro: mostra no mapa a rota pelas ruas da posição
  atual do vendedor até o cliente, com a bolinha da posição ao vivo,
  distância e tempo estimado (roteador OSRM/OpenStreetMap). A rota é
  recalculada quando o vendedor se afasta ~300 m do ponto de origem usado
  no último cálculo. Sem voz — para navegação falada, o botão do Maps.

  props: destino { lat, lng, nome }
*/

async function rotaOSRM(orig, dest) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${orig.lng.toFixed(6)},${orig.lat.toFixed(6)};${dest.lng.toFixed(6)},${dest.lat.toFixed(6)}` +
    `?overview=full&geometries=geojson`
  const r = await fetch(url)
  if (!r.ok) throw new Error('roteador indisponível')
  const d = await r.json()
  if (d.code !== 'Ok' || !d.routes?.length) throw new Error('sem rota')
  const rota = d.routes[0]
  return {
    caminho: rota.geometry.coordinates.map(([ln, la]) => [la, ln]),
    km: rota.distance / 1000,
    minutos: Math.round(rota.duration / 60),
  }
}

export default function MapaNavegacao({ destino }) {
  const el = useRef(null)
  const mapaRef = useRef(null)
  const marcadorRef = useRef(null)
  const linhaRef = useRef(null)
  const origemRotaRef = useRef(null) // origem usada no último cálculo
  const [info, setInfo] = useState(null) // { km, minutos } | { erro }
  const [pos, setPos] = useState(null)

  // mapa base + destino
  useEffect(() => {
    if (!el.current) return
    const map = L.map(el.current, { attributionControl: true })
    mapaRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map)
    L.circleMarker([destino.lat, destino.lng], { radius: 9, weight: 2, color: '#fff', fillColor: '#F58220', fillOpacity: 1 })
      .addTo(map)
      .bindPopup(destino.nome || 'Cliente')
    map.setView([destino.lat, destino.lng], 14)
    const t = setTimeout(() => map.invalidateSize(), 120)
    return () => { clearTimeout(t); map.remove(); mapaRef.current = null; marcadorRef.current = null; linhaRef.current = null }
  }, [destino.lat, destino.lng, destino.nome])

  // posição ao vivo (watch próprio, funciona mesmo com a plataforma desligada)
  useEffect(() => {
    if (!navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // bolinha da posição + recálculo da rota quando se afasta da origem anterior
  useEffect(() => {
    const map = mapaRef.current
    if (!map || !pos) return

    if (!marcadorRef.current) {
      marcadorRef.current = L.circleMarker([pos.lat, pos.lng], { radius: 8, weight: 3, color: '#fff', fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map)
    } else {
      marcadorRef.current.setLatLng([pos.lat, pos.lng])
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
        mapaRef.current.fitBounds(r.caminho, { padding: [30, 30] })
        setInfo({ km: r.km, minutos: r.minutos })
      })
      .catch(() => {
        if (!vivo || !mapaRef.current) return
        if (linhaRef.current) mapaRef.current.removeLayer(linhaRef.current)
        linhaRef.current = L.polyline([[pos.lat, pos.lng], [destino.lat, destino.lng]], { color: '#1a73e8', weight: 4, opacity: 0.6, dashArray: '6 8' }).addTo(mapaRef.current)
        mapaRef.current.fitBounds([[pos.lat, pos.lng], [destino.lat, destino.lng]], { padding: [30, 30] })
        setInfo({ erro: true, km: distanciaKm(pos.lat, pos.lng, destino.lat, destino.lng) })
      })
    return () => { vivo = false }
  }, [pos, destino])

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
      <div ref={el} style={{ width: '100%', height: 320, borderRadius: 12, overflow: 'hidden' }} />
    </div>
  )
}
