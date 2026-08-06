import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { brl, data } from './format'

const AZUL = '#173D5C'
const LARANJA = '#F58220'

async function carregarLogo() {
  try {
    const resp = await fetch('/logo-grantubos.png')
    if (!resp.ok) return null
    const blob = await resp.blob()
    return await new Promise((resolve) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result)
      fr.onerror = () => resolve(null)
      fr.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function sanitizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'sem-nome'
}

export async function gerarPdfOrcamento(orcamento, itens, cliente, vendedor) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const margem = 14
  const numero = orcamento?.numero ?? '—'

  // Cabeçalho: logo à esquerda
  const logo = await carregarLogo()
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', margem, 12, 34, 16)
    } catch {
      // segue sem logo
    }
  }

  // Título e data à direita
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(AZUL)
  doc.text(`ORÇAMENTO Nº ${numero}`, largura - margem, 18, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(LARANJA)
  doc.text(`Data: ${data(orcamento?.criado_em)}`, largura - margem, 25, { align: 'right' })

  // Linha divisória
  doc.setDrawColor(AZUL)
  doc.setLineWidth(0.5)
  doc.line(margem, 33, largura - margem, 33)

  // Bloco dados do cliente
  let y = 42
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(AZUL)
  doc.text('Cliente', margem, y)
  y += 6

  const nomeCliente =
    cliente?.razao_social || cliente?.nome_fantasia || orcamento?.cliente_nome || 'Cliente'
  const linhasCliente = [nomeCliente]
  if (cliente?.nome_fantasia && cliente?.razao_social && cliente.nome_fantasia !== cliente.razao_social) {
    linhasCliente.push(`Fantasia: ${cliente.nome_fantasia}`)
  }
  if (cliente?.cnpj) linhasCliente.push(`CNPJ: ${cliente.cnpj}`)
  if (cliente?.telefone) linhasCliente.push(`Telefone: ${cliente.telefone}`)
  const local = [cliente?.municipio, cliente?.uf].filter(Boolean).join(' / ')
  if (local) linhasCliente.push(local)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor('#333333')
  linhasCliente.forEach((linha) => {
    doc.text(String(linha), margem, y)
    y += 5
  })

  // Tabela de itens
  const linhas = (itens || []).map((it) => [
    it.descricao || '',
    String(Number(it.quantidade) || 0),
    brl(it.preco_unit),
    brl(it.subtotal),
  ])

  autoTable(doc, {
    startY: y + 4,
    head: [['Descrição', 'Qtd', 'Vlr Unit', 'Subtotal']],
    body: linhas,
    margin: { left: margem, right: margem },
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [23, 61, 92], textColor: 255, halign: 'left' },
    columnStyles: {
      1: { halign: 'right', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 32 },
    },
  })

  const totalGeral = Number(orcamento?.total) || 0
  let yPos = (doc.lastAutoTable?.finalY || y + 10) + 10

  // Total geral em destaque
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(AZUL)
  doc.text(`TOTAL: ${brl(totalGeral)}`, largura - margem, yPos, { align: 'right' })

  // Condição de pagamento (se houver)
  if (orcamento?.condicao_pagamento) {
    yPos += 8
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(AZUL)
    doc.text(`Condição de pagamento: ${orcamento.condicao_pagamento}`, largura - margem, yPos, { align: 'right' })
  }

  // Validade
  yPos += 8
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(LARANJA)
  doc.text(`Válido por ${orcamento?.validade_dias ?? 7} dias`, largura - margem, yPos, { align: 'right' })

  // Observação (se houver)
  if (orcamento?.observacao) {
    yPos += 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(AZUL)
    doc.text('Observação:', margem, yPos)
    yPos += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor('#333333')
    const obs = doc.splitTextToSize(String(orcamento.observacao), largura - margem * 2)
    doc.text(obs, margem, yPos)
  }

  // Rodapé
  const alturaPagina = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor('#888888')
  doc.text(
    `Grantubos · Vendedor: ${vendedor?.nome || '—'}`,
    largura / 2,
    alturaPagina - 10,
    { align: 'center' },
  )

  const nomeArquivo = `Orcamento-${numero}-${sanitizar(nomeCliente)}.pdf`
  const blob = doc.output('blob')

  return {
    blob,
    nomeArquivo,
    abrir() {
      window.open(URL.createObjectURL(blob), '_blank')
    },
    baixar() {
      doc.save(nomeArquivo)
    },
  }
}
