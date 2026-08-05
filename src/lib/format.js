export const brl = (n) =>
  (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const numero = (n, d = 0) =>
  (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })

export const data = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—')

export const dataHora = (d) =>
  d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export const hoje = () => new Date().toISOString().slice(0, 10)

export const soDigitos = (s) => String(s || '').replace(/\D/g, '')

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
