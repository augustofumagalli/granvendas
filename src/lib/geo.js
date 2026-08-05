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
