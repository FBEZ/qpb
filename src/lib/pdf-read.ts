/**
 * PDF reading/decoding: render PDF pages and scan for QR codes.
 * Port of main.py decode_pdf / _decode_page / _render_page (lines 533-623).
 * Uses pdf.js (pdfjs-dist) for PDF rendering.
 */

import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { scanImageData, type ZBarSymbol } from '@undecaf/zbar-wasm'
import { PDF_DECODE_DPI_LEVELS } from './constants'
import { toGrayscale, applyThreshold, sharpen, resize } from './image-utils'
import type { DecodedQr, ProgressCallback } from './types'

// Configure pdf.js worker — use Vite's ?url import so the worker
// file is properly resolved both in dev and production builds.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

/** Scan ImageData for QR codes, return zbar symbols. */
async function scanQrCodes(imageData: ImageData): Promise<ZBarSymbol[]> {
  const symbols = await scanImageData(imageData)
  return symbols.filter((s: ZBarSymbol) => s.typeName === 'ZBAR_QRCODE')
}

/** Decode a base64 string to Uint8Array. */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

/** Sort decoded QR codes in reading order. */
function sortByPosition(decoded: DecodedQr[]): DecodedQr[] {
  if (decoded.length === 0) return []

  const avgHeight = decoded.reduce((sum, d) => sum + d.rect.height, 0) / decoded.length
  const rowTolerance = Math.max(20, Math.floor(avgHeight * 0.3))

  const sorted = [...decoded].sort((a, b) =>
    a.rect.y !== b.rect.y ? a.rect.y - b.rect.y : a.rect.x - b.rect.x,
  )

  const rows: DecodedQr[][] = []
  for (const d of sorted) {
    if (rows.length > 0 && Math.abs(d.rect.y - rows[rows.length - 1][0].rect.y) < rowTolerance) {
      rows[rows.length - 1].push(d)
    } else {
      rows.push([d])
    }
  }

  const ordered: DecodedQr[] = []
  for (const row of rows) {
    row.sort((a, b) => a.rect.x - b.rect.x)
    ordered.push(...row)
  }
  return ordered
}

/** Convert zbar symbols to DecodedQr objects. */
function symbolsToDecoded(symbols: ZBarSymbol[]): DecodedQr[] {
  return symbols.map(s => {
    const points = s.points
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)

    return {
      data: base64ToUint8Array(s.decode()),
      rect: {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Page rendering
// ---------------------------------------------------------------------------

/** Render a PDF page to ImageData at a given DPI. */
async function renderPage(
  page: pdfjsLib.PDFPageProxy,
  dpi: number,
): Promise<ImageData> {
  const scale = dpi / 72
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  await page.render({ canvas, viewport }).promise
  const ctx = canvas.getContext('2d')!
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

// ---------------------------------------------------------------------------
// Multi-pass scanning for embedded images
// ---------------------------------------------------------------------------

/** Run multi-pass scan on an ImageData (same as decode.ts scanImageMultipass). */
async function scanImageMultipass(imageData: ImageData): Promise<Map<string, DecodedQr>> {
  const found = new Map<string, DecodedQr>()

  async function scan(target: ImageData): Promise<number> {
    const symbols = await scanQrCodes(target)
    let added = 0
    for (const s of symbols) {
      const payload = s.decode()
      if (!found.has(payload)) {
        const points = s.points
        const xs = points.map(p => p.x)
        const ys = points.map(p => p.y)
        found.set(payload, {
          data: base64ToUint8Array(payload),
          rect: {
            x: Math.min(...xs),
            y: Math.min(...ys),
            width: Math.max(...xs) - Math.min(...xs),
            height: Math.max(...ys) - Math.min(...ys),
          },
        })
        added++
      }
    }
    return added
  }

  const passes: [number, number][] = [
    [1, 0],
    [2, 0], [2, 1], [2, 2],
    [3, 0], [3, 1],
    [4, 0], [4, 1],
  ]

  const grayThresholds: (number | null)[] = [null, 128, 100, 140]

  const bases: ImageData[] = [imageData]
  const gray = toGrayscale(imageData)
  bases.push(gray)

  for (let baseIdx = 0; baseIdx < bases.length; baseIdx++) {
    const base = bases[baseIdx]
    const isGray = baseIdx > 0
    let prevCount = 0
    let dryRounds = 0

    for (const [scale, sharps] of passes) {
      let processed = base
      for (let s = 0; s < sharps; s++) {
        processed = sharpen(processed)
      }
      if (scale > 1) {
        processed = resize(processed, scale)
      }

      if (isGray) {
        for (const thresh of grayThresholds) {
          if (thresh === null) {
            await scan(processed)
          } else {
            await scan(applyThreshold(processed, thresh))
          }
        }
      } else {
        await scan(processed)
      }

      if (found.size === prevCount && prevCount > 0) {
        dryRounds++
        if (dryRounds >= 2) break
      } else {
        dryRounds = 0
      }
      prevCount = found.size
    }
  }

  return found
}

// ---------------------------------------------------------------------------
// Page decoding (port of _decode_page)
// ---------------------------------------------------------------------------

/**
 * Decode all QR codes from a PDF page.
 * Strategy 1: Render at escalating DPIs (for digital PDFs).
 * Strategy 2: Extract embedded images + multi-pass (for scanned PDFs).
 */
async function decodePage(
  page: pdfjsLib.PDFPageProxy,
): Promise<Uint8Array[]> {
  // --- Strategy 1: render the page ---
  let bestRendered: Uint8Array[] = []
  for (const dpi of PDF_DECODE_DPI_LEVELS) {
    const imageData = await renderPage(page, dpi)
    const symbols = await scanQrCodes(imageData)
    const decoded = symbolsToDecoded(symbols)
    const ordered = sortByPosition(decoded)
    const chunks = ordered.map(d => d.data)

    if (chunks.length > bestRendered.length) {
      bestRendered = chunks
    } else {
      break // No improvement, stop escalating
    }
  }
  if (bestRendered.length > 0) {
    return bestRendered
  }

  // --- Strategy 2: render at high DPI + multi-pass preprocessing ---
  // For scanned PDFs, rendering at the highest DPI and applying
  // preprocessing is more effective
  const highDpiImage = await renderPage(page, 600)
  const found = await scanImageMultipass(highDpiImage)
  if (found.size === 0) {
    return []
  }

  const ordered = sortByPosition(Array.from(found.values()))
  return ordered.map(d => d.data)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decode all QR codes from a PDF file.
 * Returns the decoded byte chunks in page order.
 */
export async function decodePdf(
  pdfData: Uint8Array,
  onProgress?: ProgressCallback,
): Promise<Uint8Array[]> {
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
  const numPages = pdf.numPages
  const allChunks: Uint8Array[] = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(pageNum - 1, numPages, `Decoding page ${pageNum}/${numPages}...`)

    const page = await pdf.getPage(pageNum)
    const pageChunks = await decodePage(page)

    if (pageChunks.length === 0) {
      console.warn(`No QR codes found on page ${pageNum}`)
    }
    allChunks.push(...pageChunks)
  }

  onProgress?.(numPages, numPages, `Done. Found ${allChunks.length} QR code(s) across ${numPages} page(s)`)
  return allChunks
}
