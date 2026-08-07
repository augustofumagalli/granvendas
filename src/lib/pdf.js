import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { brl, data } from './format'

// Paleta da marca
const AZUL = [23, 61, 92]
const LARANJA = [245, 130, 32]
const CINZA_CARD = [246, 247, 249]
const TEXTO = [51, 51, 51]
const MUTED = [120, 120, 120]
const rgb = (a) => `rgb(${a[0]},${a[1]},${a[2]})`

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
  const altura = doc.internal.pageSize.getHeight()
  const margem = 14
  const numero = orcamento?.numero ?? '—'

  // ---------- Cabeçalho ----------
  const logo = await carregarLogo()
  if (logo) {
    try { doc.addImage(logo, 'PNG', margem, 12, 36, 17) } catch { /* segue sem logo */ }
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(rgb(AZUL))
  doc.text('ORÇAMENTO', largura - margem, 18, { align: 'right' })

  doc.setFontSize(12)
  doc.setTextColor(rgb(LARANJA))
  doc.text(`Nº ${numero}`, largura - margem, 25, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(rgb(MUTED))
  doc.text(`Data: ${data(orcamento?.criado_em)}`, largura - margem, 30, { align: 'right' })

  // barra de destaque
  doc.setFillColor(...LARANJA)
  doc.rect(margem, 34, largura - margem * 2, 1.4, 'F')

  // ---------- Cliente ----------
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

  const cardY = 42
  const cardH = 8 + linhasCliente.length * 5
  doc.setFillColor(...CINZA_CARD)
  doc.roundedRect(margem, cardY, largura - margem * 2, cardH, 2.5, 2.5, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(rgb(AZUL))
  doc.text('CLIENTE', margem + 4, cardY + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(rgb(TEXTO))
  let cy = cardY + 11.5
  linhasCliente.forEach((linha, i) => {
    if (i === 0) doc.setFont('helvetica', 'bold')
    else doc.setFont('helvetica', 'normal')
    doc.text(String(linha), margem + 4, cy)
    cy += 5
  })

  // ---------- Tabela de itens ----------
  const linhas = (itens || []).map((it) => [
    it.descricao || '',
    String(Number(it.quantidade) || 0),
    it.unidade || '',
    brl(it.preco_unit),
    brl(it.subtotal),
  ])

  autoTable(doc, {
    startY: cardY + cardH + 6,
    head: [['Descrição', 'Qtd', 'Un', 'Vlr Unit', 'Subtotal']],
    body: linhas,
    theme: 'striped',
    margin: { left: margem, right: margem },
    styles: { fontSize: 9.5, cellPadding: 3, textColor: TEXTO, lineColor: [230, 232, 235], lineWidth: 0.1 },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', halign: 'left' },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 16 },
      2: { halign: 'center', cellWidth: 14 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 30 },
    },
  })

  let y = (doc.lastAutoTable?.finalY || cardY + cardH + 20) + 8

  // ---------- Caixa de total ----------
  const totalGeral = Number(orcamento?.total) || 0
  const boxW = 78
  const boxX = largura - margem - boxW
  doc.setFillColor(...AZUL)
  doc.roundedRect(boxX, y, boxW, 16, 2.5, 2.5, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text('TOTAL', boxX + 6, y + 6.5)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(brl(totalGeral), boxX + boxW - 6, y + 11, { align: 'right' })

  // ---------- Condição de pagamento e validade (à esquerda, alinhado à caixa) ----------
  let yInfo = y + 4
  doc.setFontSize(10)
  if (orcamento?.condicao_pagamento) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(rgb(AZUL))
    doc.text('Condição de pagamento', margem, yInfo)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(rgb(TEXTO))
    doc.text(String(orcamento.condicao_pagamento), margem, yInfo + 5)
    yInfo += 12
  }
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(rgb(MUTED))
  doc.text(`Válido por ${orcamento?.validade_dias ?? 7} dias`, margem, yInfo)

  y += 22

  // ---------- Observação ----------
  if (orcamento?.observacao) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(rgb(AZUL))
    doc.text('Observação', margem, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(rgb(TEXTO))
    const obs = doc.splitTextToSize(String(orcamento.observacao), largura - margem * 2)
    doc.text(obs, margem, y)
  }

  // ---------- Rodapé ----------
  doc.setDrawColor(230, 232, 235)
  doc.setLineWidth(0.3)
  doc.line(margem, altura - 16, largura - margem, altura - 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(rgb(MUTED))
  doc.text(`Grantubos · Vendedor: ${vendedor?.nome || '—'}`, margem, altura - 10)
  doc.text('Obrigado pela preferência!', largura - margem, altura - 10, { align: 'right' })

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
