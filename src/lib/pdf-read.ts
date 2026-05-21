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
import type { DecodedQr, ProgressCallback, PdfHeaderMeta } from './types'

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

/** Sort raw payloads by position (top-to-bottom, left-to-right). */
function sortByPositionRaw(
  payloads: string[],
  rects: { x: number; y: number; width: number; height: number }[],
): { payloads: string[]; rects: { x: number; y: number; width: number; height: number }[] } {
  if (payloads.length === 0) return { payloads, rects }

  const avgHeight = rects.reduce((sum, r) => sum + r.height, 0) / rects.length
  const rowTolerance = Math.max(20, Math.floor(avgHeight * 0.3))

  // Create indexed entries
  const indexed = payloads.map((p, i) => ({ payload: p, rect: rects[i], idx: i }))

  // Sort by y first, then x
  indexed.sort((a, b) => {
    if (Math.abs(a.rect.y - b.rect.y) > rowTolerance) {
      return a.rect.y - b.rect.y
    }
    return a.rect.x - b.rect.x
  })

  // Group into rows
  const rows: typeof indexed[] = []
  for (const entry of indexed) {
    if (rows.length > 0 && Math.abs(entry.rect.y - rows[rows.length - 1][0].rect.y) < rowTolerance) {
      rows[rows.length - 1].push(entry)
    } else {
      rows.push([entry])
    }
  }

  // Sort within rows by x
  const sorted: typeof indexed = []
  for (const row of rows) {
    row.sort((a, b) => a.rect.x - b.rect.x)
    sorted.push(...row)
  }

  return {
    payloads: sorted.map(s => s.payload),
    rects: sorted.map(s => s.rect),
  }
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
 * Returns raw symbols (not yet base64-decoded) to allow header detection.
 */
async function decodePageRaw(
  page: pdfjsLib.PDFPageProxy,
): Promise<{ rawPayloads: string[]; rects: { x: number; y: number; width: number; height: number }[] }> {
  let bestRaw: string[] = []
  let bestRects: { x: number; y: number; width: number; height: number }[] = []

  for (const dpi of PDF_DECODE_DPI_LEVELS) {
    const imageData = await renderPage(page, dpi)
    const symbols = await scanQrCodes(imageData)

    const rects: { x: number; y: number; width: number; height: number }[] = []
    const rawPayloads: string[] = []
    for (const s of symbols) {
      const points = s.points
      const xs = points.map(p => p.x)
      const ys = points.map(p => p.y)
      rects.push({
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys),
      })
      rawPayloads.push(s.decode())
    }

    if (rawPayloads.length > bestRaw.length) {
      bestRaw = rawPayloads
      bestRects = rects
    } else {
      break
    }
  }

  if (bestRaw.length > 0) {
    // Sort by position: top-to-bottom, then left-to-right
    const sorted = sortByPositionRaw(bestRaw, bestRects)
    return { rawPayloads: sorted.payloads, rects: sorted.rects }
  }

  // Strategy 2: high DPI + multi-pass
  const highDpiImage = await renderPage(page, 600)
  const found = await scanImageMultipass(highDpiImage)
  if (found.size === 0) {
    return { rawPayloads: [], rects: [] }
  }

  const ordered = sortByPosition(Array.from(found.values()))
  return {
    rawPayloads: ordered.map(d => new TextDecoder().decode(d.data)),
    rects: ordered.map(d => d.rect),
  }
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
): Promise<{ chunks: Uint8Array[]; header?: PdfHeaderMeta }> {
  const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise
  const numPages = pdf.numPages
  let header: PdfHeaderMeta | undefined
  const allChunks: Uint8Array[] = []

  // Collect chunks per page, along with page number from header
  const pageChunks: { pageNum: number; chunks: Uint8Array[] }[] = []

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(pageNum - 1, numPages, `Decoding page ${pageNum}/${numPages}...`)

    const page = await pdf.getPage(pageNum)
    const { rawPayloads } = await decodePageRaw(page)

    // Extract page number from header QR (if present)
    let extractedPageNum = pageNum
    for (let i = 0; i < rawPayloads.length; i++) {
      const payload = rawPayloads[i]
      try {
        const parsed = JSON.parse(payload)
        if (parsed['qbp-version']) {
          if (!header && pageNum === 1) {
            header = {
              filename: parsed.filename,
              page: parsed.page,
              totalPages: parsed.page.split('/')[1] ? parseInt(parsed.page.split('/')[1]) : 1,
              hash: parsed.hash,
              version: parsed['qbp-version'],
            }
          }
          // Extract page number from the header
          const [current] = parsed.page.split('/').map(Number)
          extractedPageNum = current
          console.log('Page', pageNum, 'has header, extracted page number:', extractedPageNum)
          rawPayloads.splice(i, 1)
          break
        }
      } catch (e) {}
    }

    // Base64-decode remaining payloads
    const chunks: Uint8Array[] = []
    for (const payload of rawPayloads) {
      try {
        chunks.push(base64ToUint8Array(payload))
      } catch (e) {}
    }

    pageChunks.push({ pageNum: extractedPageNum, chunks })
  }

  // Sort pages by page number
  pageChunks.sort((a, b) => a.pageNum - b.pageNum)
  console.log('Page order after sorting:', pageChunks.map(p => p.pageNum).join(', '))

  // Concatenate in sorted order
  for (const pc of pageChunks) {
    allChunks.push(...pc.chunks)
  }

  if (allChunks.length === 0) {
    console.warn('No QR codes found in PDF')
  }

  // Count total sizes
  const totalSize = allChunks.reduce((sum, c) => sum + c.length, 0)
  console.log('=== FINAL: header found:', !!header, ', total chunks:', allChunks.length, ', total size:', totalSize)
  onProgress?.(numPages, numPages, `Done. Found ${allChunks.length} QR code(s) across ${numPages} page(s)`)
  return { chunks: allChunks, header }
}
