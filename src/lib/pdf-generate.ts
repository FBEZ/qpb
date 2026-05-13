/**
 * PDF generation: arrange QR code images in a grid on A4 pages.
 * Port of main.py generate_a4_pdf() (lines 259-344).
 */

import { jsPDF } from 'jspdf'
import QRCode from 'qrcode'
import {
  A4_WIDTH,
  A4_HEIGHT,
  PDF_MARGIN,
  PDF_SPACING,
  PDF_FOOTER_HEIGHT,
  PDF_COLS,
  PDF_COLS_HIGH_DENSITY,
} from './constants'

/** Points to millimeters (jsPDF uses mm by default). */
const ptToMm = (pt: number) => pt * 25.4 / 72

interface PdfOptions {
  title: string // may be empty
  showDate: boolean
  highDensity: boolean
  fileName: string
  fileHash: string
  description?: string
}

/**
 * Generate an A4 PDF with QR codes arranged in a grid.
 * Returns a Blob containing the PDF.
 */
export async function generateA4Pdf(
  qrDataUrls: string[],
  options: PdfOptions,
): Promise<Blob> {
  const { title, showDate, highDensity, fileName, fileHash, description } = options

  const margin = ptToMm(PDF_MARGIN)
  const spacing = ptToMm(PDF_SPACING)
  const footerHeight = ptToMm(PDF_FOOTER_HEIGHT)
  const pageW = ptToMm(A4_WIDTH)
  const pageH = ptToMm(A4_HEIGHT)

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const today = new Date().toISOString().split('T')[0]

  // Layout constants (mm)
  const INNER_TOP_PADDING = 3
  const TOP_SECTION_HEIGHT = 5
  const GAP_AFTER_TOP = 2
  const META_QR_SIZE = 12 // bigger QR
  const GAP_AFTER_META = 2
  const FILENAME_BASELINE_OFFSET = 3
  const DESC_GAP = 4
  const DESC_LINE_HEIGHT = 3

  const topHeaderPresent = !!title || showDate

  // Prepare font for description measurement
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const maxTextWidth = pageW - 2 * margin - META_QR_SIZE - 2
  const descLines: string[] = description ? doc.splitTextToSize(description, maxTextWidth) : []

  // Compute meta block height
  let metaBlockHeight = META_QR_SIZE
  if (descLines.length > 0) {
    const descBlockHeight = 7 + (descLines.length - 1) * DESC_LINE_HEIGHT + 1
    metaBlockHeight = Math.max(metaBlockHeight, descBlockHeight)
  }

  // Determine meta block top Y
  const metaBlockTop = topHeaderPresent
    ? margin + INNER_TOP_PADDING + TOP_SECTION_HEIGHT + GAP_AFTER_TOP
    : margin + INNER_TOP_PADDING

  const metaBlockBottom = metaBlockTop + metaBlockHeight
  const gridTop = metaBlockBottom + GAP_AFTER_META

  // QR grid layout
  const total = qrDataUrls.length
  const maxCols = highDensity ? PDF_COLS_HIGH_DENSITY : PDF_COLS
  const cols = Math.min(maxCols, total)
  const cellW = (pageW - 2 * margin - (cols - 1) * spacing) / cols
  const cellH = cellW + spacing
  const availableH = pageH - margin - footerHeight - gridTop
  if (availableH <= 0) {
    throw new Error('Insufficient space for QR codes. Reduce header size or density.')
  }
  const rowsPerPage = Math.max(1, Math.floor(availableH / cellH))
  const perPage = cols * rowsPerPage
  const numPages = Math.ceil(total / perPage)

  let idx = 0
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    if (pageNum > 1) {
      doc.addPage()
    }

    // Top header (title and/or date)
    if (topHeaderPresent) {
      const headerY = margin + INNER_TOP_PADDING
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

    // Metadata block
    const metaInfo = {
      'qbp-version': '0.1',
      filename: fileName,
      'qr-code-nr': total,
      'page-nr': pageNum,
      hash: fileHash,
    }
    const metaQrUrl = await QRCode.toDataURL(JSON.stringify(metaInfo), {
      errorCorrectionLevel: 'L',
      margin: 1,
      width: 200,
    })
    doc.addImage(metaQrUrl, 'PNG', margin, metaBlockTop, META_QR_SIZE, META_QR_SIZE)

    // Filename to the right
    const textX = margin + META_QR_SIZE + 2
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(fileName, textX, metaBlockTop + FILENAME_BASELINE_OFFSET, { maxWidth: pageW - margin - textX })

    // Description below filename (if any)
    if (description && descLines.length > 0) {
      doc.setFontSize(8)
      descLines.forEach((line: string, i: number) => {
        doc.text(line, textX, metaBlockTop + FILENAME_BASELINE_OFFSET + DESC_GAP + i * DESC_LINE_HEIGHT)
      })
    }

    // Separator line after metadata block
    doc.setLineWidth(0.2)
    doc.line(margin, metaBlockBottom, pageW - margin, metaBlockBottom)

    // QR Grid
    const gridStartY = gridTop
    for (let row = 0; row < rowsPerPage; row++) {
      for (let col = 0; col < cols; col++) {
        if (idx >= total) break
        const x = margin + col * (cellW + spacing)
        const y = gridStartY + row * cellH
        doc.addImage(qrDataUrls[idx], 'JPEG', x, y, cellW, cellW)
        idx++
      }
      if (idx >= total) break
    }

    // Footer
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const footerY = pageH - margin + 2
    doc.text(`${pageNum}/${numPages}`, pageW / 2, footerY, { align: 'center' })
  }

  return doc.output('blob')
}
