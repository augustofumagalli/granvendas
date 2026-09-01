// Distância entre dois pontos GPS em km (fórmula de Haversine)
export function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Rumo (bearing) em graus do ponto 1 para o ponto 2 (0 = norte, 90 = leste)
export function rumoGraus(lat1, lon1, lat2, lon2) {
  const f1 = (lat1 * Math.PI) / 180
  const f2 = (lat2 * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Geocodificação: endereço escrito -> coordenadas (Nominatim/OpenStreetMap)
export async function buscarCoordenadas(texto) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' +
    encodeURIComponent(texto)
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) return null
  const d = await r.json()
  if (!Array.isArray(d) || !d.length) return null
  return { lat: Number(d[0].lat), lng: Number(d[0].lon), descricao: d[0].display_name }
}

export function pegarPosicao() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('GPS não disponível neste dispositivo'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisao: p.coords.accuracy }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    )
  })
}
