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
  fileDataUrl?: string
  imageWidth?: number
  imageHeight?: number
}

export async function generateA4Pdf(
  qrDataUrls: string[],
  options: PdfOptions,
): Promise<Blob> {
  const { highDensity, fileName, fileHash, description, fileDataUrl, imageWidth, imageHeight } = options

  const margin = ptToMm(PDF_MARGIN)
  const spacing = ptToMm(PDF_SPACING)
  const footerHeight = ptToMm(PDF_FOOTER_HEIGHT)
  const pageW = ptToMm(A4_WIDTH)
  const pageH = ptToMm(A4_HEIGHT)

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })

  const today = new Date().toISOString().split('T')[0]

  // --- Layout constants (mm) ---
  const TOP_INSET = 4               // top padding
  const META_QR_SIZE = 12           // QR size
  const FILENAME_BASELINE_OFFSET = 3 // from meta top
  const DATE_LINE_SPACING = 3       // below filename
  const DESC_LINE_HEIGHT = 3        // line height
  const GAP_AFTER_META = 3          // after meta block before separator
  const META_BOTTOM_PADDING = 3     // bottom padding inside meta
  const GAP_QR_TO_TITLE = 2         // gap between QR and title/date
  const GAP_TITLE_TO_DESC = 3        // gap between title/date and description
  const GAP_DESC_TO_IMAGE = 10         // gap between description and image

  const metaTop = margin + TOP_INSET

  const IMAGE_EXTS = /\.(jpg|jpeg|png|webp)$/i
  const isImage = IMAGE_EXTS.test(fileName) && fileDataUrl && imageWidth && imageHeight
  const PREVIEW_SIZE = 12 // mm - will be adjusted by aspect ratio

  // Compute column widths and meta block height
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const fileNameWidth = doc.getTextWidth(fileName)
  doc.setFontSize(8)
  const dateWidth = doc.getTextWidth(today)
  const col2ActualWidth = Math.max(fileNameWidth, dateWidth)
  const col2Padding = 2
  const col2Width = col2ActualWidth + col2Padding

  const col2Start = margin + META_QR_SIZE + GAP_QR_TO_TITLE
  const col3Start = col2Start + col2Width + GAP_TITLE_TO_DESC

  doc.setFontSize(8)
  const imgWidthMm = isImage ? PREVIEW_SIZE * (imageWidth / imageHeight) : 0
  const rightEdge = isImage ? pageW - margin - imgWidthMm - GAP_DESC_TO_IMAGE : pageW - margin
  const descColWidth = rightEdge - col3Start
  const descPadding = 2
  const maxDescWidth = descColWidth - descPadding * 2
  const descLines: string[] = description ? doc.splitTextToSize(description, maxDescWidth) : []

  // Column 2 height: filename + date
  const col2Height = FILENAME_BASELINE_OFFSET + DATE_LINE_SPACING + 2

  // Column 3 (description) height - limited by QR code height
  let col3Height = 0
  if (descLines.length > 0) {
    const maxAllowedLines = Math.floor((META_QR_SIZE - 2) / DESC_LINE_HEIGHT)
    const displayLineCount = Math.min(descLines.length, maxAllowedLines)
    col3Height = displayLineCount * DESC_LINE_HEIGHT + 2
  }

  const total = qrDataUrls.length
  const maxCols = highDensity ? PDF_COLS_HIGH_DENSITY : PDF_COLS
  const cols = Math.min(maxCols, total)
  const cellW = (pageW - 2 * margin - (cols - 1) * spacing) / cols

  // Column 4 (image preview) height - match meta QR size
  const col4Height = isImage ? META_QR_SIZE : 0

  // Total meta block height must encompass tallest column
  const metaBlockHeight = Math.max(META_QR_SIZE, col2Height, col3Height, col4Height) + META_BOTTOM_PADDING

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
      const descBlockW = descColWidth
      const maxAllowedLines = Math.floor((META_QR_SIZE - 2) / DESC_LINE_HEIGHT)
      const displayLineCount = Math.min(descLines.length, maxAllowedLines)
      const displayLines = descLines.slice(0, displayLineCount)
      if (descLines.length > maxAllowedLines) {
        displayLines[displayLineCount - 1] = displayLines[displayLineCount - 1].slice(0, -3) + '...'
      }
      const descBlockH = displayLines.length * DESC_LINE_HEIGHT + padding
      const descBlockY = descStartY - padding
      doc.setFillColor(240, 240, 240)
      doc.rect(descBlockX, descBlockY, descBlockW, descBlockH, 'F')
      doc.setTextColor(0, 0, 0)

      displayLines.forEach((line: string, i: number) => {
        doc.text(line, descBlockX + padding, descStartY + i * DESC_LINE_HEIGHT, { maxWidth: descBlockW - padding * 2 })
      })
    }

    // Image preview (if image file) - right-aligned, symmetrical to QR code
    if (isImage && fileDataUrl) {
      const imgHeight = META_QR_SIZE
      const aspectRatio = imageWidth / imageHeight
      const imgWidth = imgHeight * aspectRatio
      const imgX = pageW - margin - imgWidth // right-aligned, symmetrical to QR code
      const imgY = metaTop
      doc.addImage(fileDataUrl, 'JPEG', imgX, imgY, imgWidth, imgHeight, undefined, 'FAST')
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
        doc.addImage(qrDataUrls[idx], 'JPEG', x, y, cellW, cellW, undefined, 'FAST')
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
