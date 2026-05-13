/**
 * PDF generation: arrange QR code images in a grid on A4 pages.
 * Port of main.py generate_a4_pdf() (lines 259-344).
 */

import { jsPDF } from 'jspdf'
import {
  A4_WIDTH,
  A4_HEIGHT,
  PDF_MARGIN,
  PDF_SPACING,
  PDF_HEADER_HEIGHT,
  PDF_FOOTER_HEIGHT,
  PDF_COLS,
  PDF_COLS_HIGH_DENSITY,
} from './constants'

/** Points to millimeters (jsPDF uses mm by default). */
const ptToMm = (pt: number) => pt * 25.4 / 72

interface PdfOptions {
  title: string
  showDate: boolean
  highDensity: boolean
}

/**
 * Generate an A4 PDF with QR codes arranged in a grid.
 * Returns a Blob containing the PDF.
 */
export async function generateA4Pdf(
  qrDataUrls: string[],
  options: PdfOptions,
): Promise<Blob> {
  const { title, showDate, highDensity } = options

  // Convert all point-based constants to mm
  const margin = ptToMm(PDF_MARGIN)
  const spacing = ptToMm(PDF_SPACING)
  const headerHeight = ptToMm(PDF_HEADER_HEIGHT)
  const footerHeight = ptToMm(PDF_FOOTER_HEIGHT)
  const pageW = ptToMm(A4_WIDTH) // ~210 mm
  const pageH = ptToMm(A4_HEIGHT) // ~297 mm

  const hasHeader = !!title || showDate
  const headerReserved = hasHeader ? headerHeight : 0
  const footerReserved = footerHeight

  const usableW = pageW - 2 * margin
  const usableH = pageH - 2 * margin - headerReserved - footerReserved

  const maxCols = highDensity ? PDF_COLS_HIGH_DENSITY : PDF_COLS
  const cols = Math.min(maxCols, qrDataUrls.length)
  const cellW = (usableW - (cols - 1) * spacing) / cols
  const cellH = cellW + spacing // square QR + gap to next row
  const rowsPerPage = Math.max(1, Math.floor(usableH / cellH))

  const total = qrDataUrls.length
  const perPage = cols * rowsPerPage
  const numPages = Math.ceil(total / perPage)

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const today = new Date().toISOString().split('T')[0]

  let idx = 0
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (pageNum > 1) {
      doc.addPage()
    }

    // -- Header --
    if (hasHeader) {
      const headerY = margin + 3 // baseline for text near top
      if (title) {
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(title, margin, headerY)
      }
      if (showDate) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.text(today, pageW - margin, headerY, { align: 'right' })
      }
    }

    // -- QR grid --
    const gridTop = margin + headerReserved
    for (let row = 0; row < rowsPerPage; row++) {
      for (let col = 0; col < cols; col++) {
        if (idx >= total) break

        const x = margin + col * (cellW + spacing)
        const y = gridTop + row * cellH

        doc.addImage(qrDataUrls[idx], 'JPEG', x, y, cellW, cellW)
        idx++
      }
      if (idx >= total) break
    }

    // -- Footer --
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const footerY = pageH - margin + 2
    doc.text(`${pageNum}/${numPages}`, pageW / 2, footerY, { align: 'center' })
  }

  return doc.output('blob')
}
