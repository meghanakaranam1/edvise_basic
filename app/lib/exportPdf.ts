import { jsPDF } from 'jspdf'

export type PdfBlock =
  | { type: 'title'; text: string }
  | { type: 'meta'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'body'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'spacer' }

// Strips the handful of markdown markers our generated content actually
// uses (bold, heading hashes, bullet dashes) so a markdown-authored section
// reads as clean plain text in the PDF — jsPDF has no markdown renderer, and
// a raw "**Subsection**" showing up in a PDF would look like a bug, not a
// missing feature.
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[-*]\s+/gm, '• ')
}

// Shared by Action Plan / Agenda / Report "Download" buttons — a real PDF
// (not a .txt file), built client-side with simple top-to-bottom block
// layout and automatic pagination. Good enough for structured text content
// like these documents; not a general-purpose markdown-to-PDF renderer.
export function downloadPdf(filename: string, blocks: PdfBlock[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const marginX = 54
  const marginTop = 56
  const marginBottom = 54
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const maxWidth = pageWidth - marginX * 2
  let y = marginTop

  function ensureSpace(lineHeight: number) {
    if (y + lineHeight > pageHeight - marginBottom) {
      doc.addPage()
      y = marginTop
    }
  }

  for (const block of blocks) {
    if (block.type === 'spacer') { y += 10; continue }

    let fontSize = 10.5
    let fontStyle: 'normal' | 'bold' = 'normal'
    let lineHeight = 14
    let indent = 0
    let color: [number, number, number] = [55, 65, 81]
    let prefix = ''

    switch (block.type) {
      case 'title':   fontSize = 18; fontStyle = 'bold'; lineHeight = 24; color = [42, 59, 124]; break
      case 'meta':     fontSize = 9;  lineHeight = 13; color = [120, 120, 120]; break
      case 'heading':  fontSize = 12; fontStyle = 'bold'; lineHeight = 17; color = [42, 59, 124]; break
      case 'bullet':   fontSize = 10.5; indent = 14; prefix = '• '; lineHeight = 14; break
      case 'body':     fontSize = 10.5; lineHeight = 14; break
    }

    doc.setFont('helvetica', fontStyle)
    doc.setFontSize(fontSize)
    doc.setTextColor(color[0], color[1], color[2])

    const text = block.type === 'body' ? stripMarkdown(block.text) : block.text
    const lines = doc.splitTextToSize(prefix + text, maxWidth - indent) as string[]
    for (const line of lines) {
      ensureSpace(lineHeight)
      doc.text(line, marginX + indent, y)
      y += lineHeight
    }
    if (block.type === 'title' || block.type === 'heading') y += 4
  }

  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`)
}
