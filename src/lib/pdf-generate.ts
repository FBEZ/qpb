/**
 * PDF generation: arrange QR code images in a grid on A4 pages.
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

const ptToMm = (pt: number) => pt * 25.4 / 72

interface PdfOptions {
  highDensity: boolean
  fileName: string
  fileHash: string
  description?: string
}

export async function generateA4Pdf(
  qrDataUrls: string[],
  options: PdfOptions,
): Promise<Blob> {
  const { highDensity, fileName, fileHash, description } = options

  const margin = ptToMm(PDF_MARGIN)
  const spacing = ptToMm(PDF_SPACING)
  const footerHeight = ptToMm(PDF_FOOTER_HEIGHT)
  const pageW = ptToMm(A4_WIDTH)
  const pageH = ptToMm(A4_HEIGHT)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const today = new Date().toISOString().split('T')[0]

  // --- Layout constants (mm) ---
  const TOP_INSET = 4               // top padding
  const META_QR_SIZE = 12           // QR size
  const COL_GAP = 4                 // gap between columns
  const FILENAME_BASELINE_OFFSET = 3 // from meta top
  const DATE_LINE_SPACING = 3       // below filename
  const DESC_RIGHT_MARGIN = 8       // right margin for description text
  const DESC_LINE_HEIGHT = 3        // line height
  const GAP_AFTER_META = 3          // after meta block before separator
  const META_BOTTOM_PADDING = 3     // bottom padding inside meta

  const metaTop = margin + TOP_INSET
  const col2Start = margin + META_QR_SIZE + COL_GAP // title/date column
  const col2Width = 50 // fixed width for filename/date column
  const col3Start = col2Start + col2Width + COL_GAP // description column (to the right)

  // Compute column widths and meta block height
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const maxDescWidth = pageW - margin - DESC_RIGHT_MARGIN - col3Start
  const descLines: string[] = description ? doc.splitTextToSize(description, maxDescWidth) : []

  // Column 2 height: filename + date
  const col2Height = FILENAME_BASELINE_OFFSET + DATE_LINE_SPACING + 2

  // Column 3 (description) height
  let col3Height = 0
  if (descLines.length > 0) {
    col3Height = descLines.length * DESC_LINE_HEIGHT + 2
  }

  // Total meta block height must encompass tallest column
  const metaBlockHeight = Math.max(META_QR_SIZE, col2Height, col3Height) + META_BOTTOM_PADDING

  const total = qrDataUrls.length
  const maxCols = highDensity ? PDF_COLS_HIGH_DENSITY : PDF_COLS
  const cols = Math.min(maxCols, total)
  const cellW = (pageW - 2 * margin - (cols - 1) * spacing) / cols
  const cellH = cellW + spacing

  const gridTop = metaTop + metaBlockHeight + GAP_AFTER_META
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

    // --- Metadata block ---
    const metaInfo = {
      'qbp-version': '0.1',
      filename: fileName,
      'qr-code-nr': total,
      page: `${pageNum}/${numPages}`,
      hash: fileHash,
    }
    const metaQrUrl = await QRCode.toDataURL(JSON.stringify(metaInfo), {
      errorCorrectionLevel: 'L',
      margin: 1,
      width: 200,
    })
    // Column 1: QR code
    doc.addImage(metaQrUrl, 'PNG', margin, metaTop, META_QR_SIZE, META_QR_SIZE)

    // Column 2: filename + date (stacked)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(fileName, col2Start, metaTop + FILENAME_BASELINE_OFFSET, { maxWidth: col2Width })
    doc.setFontSize(8)
    doc.text(today, col2Start, metaTop + FILENAME_BASELINE_OFFSET + DATE_LINE_SPACING, { maxWidth: col2Width })

    // Column 3: description (if any), to the right of filename/date
    if (descLines.length > 0) {
      doc.setFontSize(8)
      const padding = 2
      const descStartY = metaTop + FILENAME_BASELINE_OFFSET
      const descBlockX = col3Start
      const descBlockW = pageW - margin - col3Start - DESC_RIGHT_MARGIN
      const descBlockH = descLines.length * DESC_LINE_HEIGHT + padding * 2
      const descBlockY = descStartY - padding - 1
      doc.setFillColor(240, 240, 240)
      doc.rect(descBlockX, descBlockY, descBlockW, descBlockH, 'F')
      doc.setTextColor(0, 0, 0)

      descLines.forEach((line: string, i: number) => {
        doc.text(line, descBlockX + padding, descStartY + i * DESC_LINE_HEIGHT, { maxWidth: descBlockW - padding * 2 })
      })
    }

    // Separator line after metadata block
    const separatorY = metaTop + metaBlockHeight - META_BOTTOM_PADDING / 2
    doc.setLineWidth(0.2)
    doc.setDrawColor(0)
    doc.line(margin, separatorY, pageW - margin, separatorY)

    // --- QR Grid ---
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

    // --- Footer ---
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const footerY = pageH - margin + 2
    doc.text(`${pageNum}/${numPages}`, pageW / 2, footerY, { align: 'center' })
  }

  return doc.output('blob')
}
