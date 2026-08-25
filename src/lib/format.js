export const brl = (n) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const numero = (n, d = 0) =>
  (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')

export const dataHora = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export const hoje = () => new Date().toISOString().slice(0, 10)

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
