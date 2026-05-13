/**
 * Decode logic: QR code images -> reconstructed file.
 * Port of main.py lines 382-708.
 * Uses @undecaf/zbar-wasm for QR code detection (same engine as pyzbar).
 */

import { scanImageData, type ZBarSymbol } from '@undecaf/zbar-wasm'
import { SUPPORTED_IMAGE_EXTS } from './constants'
import { loadImage, imageToImageData, toGrayscale, applyThreshold, sharpen, resize } from './image-utils'
import { decodePdf } from './pdf-read'
import type { DecodedQr, ProgressCallback } from './types'

// ---------------------------------------------------------------------------
// Core scanning
// ---------------------------------------------------------------------------

/** Scan an ImageData for QR codes using zbar.wasm. Returns raw zbar symbols. */
async function scanQrCodes(imageData: ImageData): Promise<ZBarSymbol[]> {
  const symbols = await scanImageData(imageData)
  return symbols.filter((s: ZBarSymbol) => s.typeName === 'ZBAR_QRCODE')
}

/** Convert zbar symbols to DecodedQr objects (base64-decoded payloads). */
function symbolsToDecoded(symbols: ZBarSymbol[]): DecodedQr[] {
  return symbols.map(s => {
    const points = s.points
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const maxX = Math.max(...xs)
    const maxY = Math.max(...ys)

    // Payload is base64-encoded
    const base64Str = s.decode()
    const data = base64ToUint8Array(base64Str)

    return {
      data,
      rect: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    }
  })
}

// ---------------------------------------------------------------------------
// Position-aware sorting (port of _sort_qr_results_by_position)
// ---------------------------------------------------------------------------

/**
 * Sort decoded QR codes in reading order (top-to-bottom, left-to-right).
 * Groups codes into rows using a tolerance based on average QR height.
 */
function sortByPosition(decoded: DecodedQr[]): DecodedQr[] {
  if (decoded.length === 0) return []

  const avgHeight = decoded.reduce((sum, d) => sum + d.rect.height, 0) / decoded.length
  const rowTolerance = Math.max(20, Math.floor(avgHeight * 0.3))

  // Sort by top then left
  const sorted = [...decoded].sort((a, b) =>
    a.rect.y !== b.rect.y ? a.rect.y - b.rect.y : a.rect.x - b.rect.x,
  )

  // Group into rows
  const rows: DecodedQr[][] = []
  for (const d of sorted) {
    if (rows.length > 0 && Math.abs(d.rect.y - rows[rows.length - 1][0].rect.y) < rowTolerance) {
      rows[rows.length - 1].push(d)
    } else {
      rows.push([d])
    }
  }

  // Sort left-to-right within each row
  const ordered: DecodedQr[] = []
  for (const row of rows) {
    row.sort((a, b) => a.rect.x - b.rect.x)
    ordered.push(...row)
  }
  return ordered
}

// ---------------------------------------------------------------------------
// Scan a single ImageData for all QR codes (simple path)
// ---------------------------------------------------------------------------

/** Scan an image and return base64-decoded payloads in reading order. */
async function decodeQrCodesFromImageData(imageData: ImageData): Promise<Uint8Array[]> {
  const symbols = await scanQrCodes(imageData)
  const decoded = symbolsToDecoded(symbols)
  const ordered = sortByPosition(decoded)
  return ordered.map(d => d.data)
}

// ---------------------------------------------------------------------------
// Multi-pass scanning (port of _scan_image_multipass)
// ---------------------------------------------------------------------------

/**
 * Run zbar across multiple preprocessing variants to handle
 * low-quality scans and phone photos.
 */
async function scanImageMultipass(imageData: ImageData): Promise<DecodedQr[]> {
  // Track unique payloads by their base64 content
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

  // Build list of base images: original + grayscale
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

  return Array.from(found.values())
}

// ---------------------------------------------------------------------------
// High-level decode entry points
// ---------------------------------------------------------------------------

/**
 * Decode QR codes from individual image files.
 * Expects files named qrcode_N.jpg (sorted by N).
 */
async function decodeQrImageFiles(
  files: File[],
  onProgress?: ProgressCallback,
): Promise<Uint8Array[]> {
  // Sort files by their index number
  const indexed: { index: number; file: File }[] = []
  for (const file of files) {
    const match = file.name.match(/^qrcode_(\d+)\.jpg$/)
    if (match) {
      indexed.push({ index: parseInt(match[1], 10), file })
    }
  }
  indexed.sort((a, b) => a.index - b.index)

  if (indexed.length === 0) {
    throw new Error('No qrcode_*.jpg files found')
  }

  // Validate sequential numbering
  const expected = Array.from({ length: indexed.length }, (_, i) => i + 1)
  const actual = indexed.map(i => i.index)
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const missing = expected.filter(n => !actual.includes(n))
    throw new Error(`Missing QR code images for indices: ${missing.join(', ')}`)
  }

  const chunks: Uint8Array[] = []
  for (let i = 0; i < indexed.length; i++) {
    const { index, file } = indexed[i]
    onProgress?.(i, indexed.length, `Decoding qrcode_${index}.jpg...`)

    const img = await loadImage(file)
    const imageData = imageToImageData(img)
    const symbols = await scanQrCodes(imageData)

    if (symbols.length === 0) {
      throw new Error(`Could not decode QR code from ${file.name}`)
    }
    if (symbols.length > 1) {
      throw new Error(`Multiple QR codes found in ${file.name}, expected exactly 1`)
    }

    const payload = symbols[0].decode()
    chunks.push(base64ToUint8Array(payload))
  }

  onProgress?.(indexed.length, indexed.length, 'Done')
  return chunks
}

/**
 * Decode QR codes from a single image file (photo of printed QR codes).
 * Uses multi-pass preprocessing for robust detection.
 */
async function decodeSingleImage(
  file: File,
  onProgress?: ProgressCallback,
): Promise<Uint8Array[]> {
  onProgress?.(0, 1, 'Loading image...')
  const img = await loadImage(file)
  const imageData = imageToImageData(img)

  // Fast path: try a plain scan
  onProgress?.(0, 1, 'Scanning for QR codes...')
  const plain = await decodeQrCodesFromImageData(imageData)
  if (plain.length > 0) {
    onProgress?.(1, 1, `Found ${plain.length} QR code(s)`)
    return plain
  }

  // Slow path: multi-pass preprocessing
  onProgress?.(0, 1, 'Running multi-pass scan...')
  const found = await scanImageMultipass(imageData)
  if (found.length === 0) {
    return []
  }

  const ordered = sortByPosition(found)
  onProgress?.(1, 1, `Found ${ordered.length} QR code(s)`)
  return ordered.map(d => d.data)
}

// ---------------------------------------------------------------------------
// Main decode dispatcher
// ---------------------------------------------------------------------------

/** Determine the type of decode input. */
function classifyInput(files: File[]): 'qr-images' | 'pdf' | 'single-image' {
  if (files.length === 1) {
    const ext = '.' + files[0].name.split('.').pop()!.toLowerCase()
    if (ext === '.pdf') return 'pdf'
    if (SUPPORTED_IMAGE_EXTS.has(ext)) return 'single-image'
  }

  // Check if all files match qrcode_N.jpg pattern
  const allQr = files.every(f => /^qrcode_\d+\.jpg$/.test(f.name))
  if (allQr) return 'qr-images'

  // Multiple images but not qrcode_N.jpg - try as single images
  return 'single-image'
}

/**
 * Main decode function. Accepts one or more files and returns the
 * reconstructed file bytes.
 */
export async function runDecode(
  files: File[],
  onProgress?: ProgressCallback,
): Promise<{ data: Uint8Array; numChunks: number }> {
  if (files.length === 0) {
    throw new Error('No files provided')
  }

  const inputType = classifyInput(files)
  let chunks: Uint8Array[]

  switch (inputType) {
    case 'pdf': {
      onProgress?.(0, 1, `Decoding PDF: ${files[0].name}`)
      const arrayBuffer = await files[0].arrayBuffer()
      chunks = await decodePdf(new Uint8Array(arrayBuffer), onProgress)
      break
    }

    case 'qr-images':
      chunks = await decodeQrImageFiles(files, onProgress)
      break

    case 'single-image': {
      // Decode each image and concatenate results
      chunks = []
      for (let i = 0; i < files.length; i++) {
        onProgress?.(i, files.length, `Processing image ${i + 1}/${files.length}...`)
        const imageChunks = await decodeSingleImage(files[i], onProgress)
        chunks.push(...imageChunks)
      }
      break
    }
  }

  if (chunks.length === 0) {
    throw new Error('No QR codes found in the provided files')
  }

  // Assemble all chunks
  const totalSize = chunks.reduce((sum, c) => sum + c.length, 0)
  const assembled = new Uint8Array(totalSize)
  let offset = 0
  for (const chunk of chunks) {
    assembled.set(chunk, offset)
    offset += chunk.length
  }

  return { data: assembled, numChunks: chunks.length }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decode a base64 string to Uint8Array. */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryStr = atob(base64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}
