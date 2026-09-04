import { distanciaKm } from './geo'

// Detecção/classificação de paradas a partir dos pontos GPS do dia.
// (mesma lógica usada nos Relatórios; extraída para reuso no Acompanhamento)

export const PARADA_MIN_MINUTOS = 10 // parado por 10+ min vira "parada"
export const PARADA_RAIO_KM = 0.2    // ...desde que não tenha se deslocado mais que isso
export const PERTO_KM = 0.15         // "perto" de um cliente/visita = 150 m

const rotuloPausa = (tipo) =>
  tipo === 'visita' ? 'Visita (marcada no botão)'
    : tipo === 'almoco' ? 'Almoço (pausa registrada)'
    : 'Pausa particular (registrada)'

// O GPS só grava ponto quando há movimento; parado, abre-se um "vão" no tempo
// entre dois pontos quase no mesmo lugar — isso é uma parada.
export function detectarParadas(pontos) {
  const ps = (pontos || [])
    .filter((p) => p.lat != null && p.lng != null && p.capturado_em)
    .map((p) => ({ lat: p.lat, lng: p.lng, t: new Date(p.capturado_em).getTime() }))
  const out = []
  for (let i = 1; i < ps.length; i++) {
    const a = ps[i - 1]
    const b = ps[i]
    const minutos = (b.t - a.t) / 60000
    if (minutos >= PARADA_MIN_MINUTOS && distanciaKm(a.lat, a.lng, b.lat, b.lng) < PARADA_RAIO_KM) {
      out.push({ lat: a.lat, lng: a.lng, inicio: a.t, fim: b.t, minutos: Math.round(minutos) })
    }
  }
  return out
}

export function classificarParada(p, visitas, pausas, clientesGeo) {
  const visita = (visitas || []).find(
    (v) =>
      (v.lat != null && distanciaKm(p.lat, p.lng, v.lat, v.lng) < PERTO_KM) ||
      (v.criado_em && new Date(v.criado_em).getTime() >= p.inicio - 10 * 60000 && new Date(v.criado_em).getTime() <= p.fim + 10 * 60000)
  )
  if (visita) return { rotulo: `Visita — ${visita.cliente_nome || 'cliente'}`, tipo: 'visita' }

  const pausa = (pausas || []).find((pa) => {
    const ini = new Date(pa.inicio).getTime()
    const fim = pa.fim ? new Date(pa.fim).getTime() : ini + 60 * 60000
    return p.inicio < fim && p.fim > ini
  })
  if (pausa) return { rotulo: rotuloPausa(pausa.tipo), tipo: pausa.tipo === 'visita' ? 'visita' : 'pausa' }

  const cliente = (clientesGeo || []).find((c) => distanciaKm(p.lat, p.lng, c.lat, c.lng) < PERTO_KM)
  if (cliente) return { rotulo: `No cliente ${cliente.razao_social || cliente.nome_fantasia} (sem visita registrada)`, tipo: 'cliente' }

  const hora = new Date(p.inicio).getHours()
  if (hora >= 11 && hora < 14 && p.minutos >= 30) return { rotulo: 'Provável almoço', tipo: 'almoco' }

  return { rotulo: 'Parada não identificada', tipo: 'desconhecida' }
}
