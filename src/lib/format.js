export const brl = (n) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const numero = (n, d = 0) =>
  (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

// Data 'YYYY-MM-DD' é interpretada no fuso local (new Date() puro trata como UTC
// e no Brasil mostraria o dia anterior)
export const data = (d) => {
  if (!d) return '—'
  const s = String(d)
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(d)
  return dt.toLocaleDateString('pt-BR')
}

export const dataHora = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

// Dia de hoje no fuso local (toISOString é UTC: depois das 21h no Brasil já virava o dia seguinte)
export const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const soDigitos = (s) => String(s || '').replace(/\D/g, '')

// minúsculas sem acento (para buscas)
export const semAcento = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// Busca com "%" como curinga: cada trecho separado por % precisa aparecer, em ordem.
// Ex.: "tubo%inox%50" casa com "TUBO RDD INOX 304 - 50,80MM".
export function combinaCuringa(texto, consulta) {
  const t = semAcento(texto)
  const q = semAcento(consulta).trim()
  if (!q) return true
  const partes = q.split('%').map((p) => p.trim()).filter(Boolean)
  if (!partes.length) return true // consulta só com "%"
  let i = 0
  for (const parte of partes) {
    const pos = t.indexOf(parte, i)
    if (pos < 0) return false
    i = pos + parte.length
  }
  return true
}

// Converte a consulta do usuário num padrão para o ilike do Postgres:
// espaços viram %, o % digitado é mantido, aspas saem. Vazio -> null.
export function curingaParaIlike(consulta) {
  const q = String(consulta ?? '').replace(/"/g, '').trim()
  if (!q) return null
  return '%' + q.replace(/\s+/g, '%') + '%'
}

// CPF (11 dígitos) ou CNPJ (14) conforme o tamanho
export const formataCpfCnpj = (v) => {
  const d = soDigitos(v)
  if (d.length <= 11)
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  return formataCNPJ(d)
}

export const formataCNPJ = (v) => {
  const d = soDigitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

export const formataTelefone = (v) => {
  const d = soDigitos(v).slice(0, 11)
  if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d)/, '($1) $2-$3')
  return d.replace(/(\d{2})(\d{5})(\d)/, '($1) $2-$3')
}
