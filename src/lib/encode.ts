/**
 * Encode logic: file -> chunks -> QR code images.
 * Port of main.py lines 204-378.
 */

import QRCode from 'qrcode'
import { MAX_BYTES_PER_QR, QR_VERSION, QR_ERROR_CORRECTION, QR_BOX_SIZE, QR_BORDER } from './constants'
import type { ChunkInfo, EncodeConfig, EncodeResult, ProgressCallback } from './types'
import { generateA4Pdf } from './pdf-generate'
import { md5 } from './md5'

/** Split raw bytes into chunks of at most `chunkSize` bytes. */
export function splitIntoChunks(data: Uint8Array, chunkSize: number = MAX_BYTES_PER_QR): Uint8Array[] {
  const chunks: Uint8Array[] = []
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize))
  }
  return chunks
}

/** Wrap raw byte chunks into ChunkInfo objects. */
export function makeChunkInfos(chunks: Uint8Array[]): ChunkInfo[] {
  const total = chunks.length
  return chunks.map((chunk, i) => ({
    index: i + 1,
    total,
    size: chunk.length,
    data: chunk,
  }))
}

/** Compute MD5 hash of file data (synchronous using pure JS). */
function computeMD5(data: Uint8Array): string {
  return md5(data)
}

/**
 * Generate a QR code data URL from raw bytes.
 * The data is base64-encoded before being placed into the QR code,
 * matching the Python version's behavior.
 */
export async function generateQrDataUrl(data: Uint8Array): Promise<string> {
  // Convert Uint8Array to base64 string
  const base64 = uint8ArrayToBase64(data)

  const dataUrl = await QRCode.toDataURL(base64, {
    version: QR_VERSION,
    errorCorrectionLevel: QR_ERROR_CORRECTION,
    margin: QR_BORDER,
    scale: QR_BOX_SIZE,
    type: 'image/jpeg',
    rendererOpts: {
      quality: 0.92,
    },
  })

  return dataUrl
}

/** Run the full encode pipeline. */
export async function runEncode(
  config: EncodeConfig,
  onProgress?: ProgressCallback,
): Promise<EncodeResult> {
  const chunks = splitIntoChunks(config.fileData)
  const chunkInfos = makeChunkInfos(chunks)
  const total = chunkInfos.length

  onProgress?.(0, total, 'Generating QR codes...')

  // Compute MD5 hash of the original file for metadata
  const fileHash = computeMD5(config.fileData)

  const qrDataUrls: string[] = []
  for (const chunk of chunkInfos) {
    const dataUrl = await generateQrDataUrl(chunk.data)
    qrDataUrls.push(dataUrl)
    onProgress?.(chunk.index, total, `Generated QR code ${chunk.index}/${total}`)
  }

  let pdfBlob: Blob | undefined
  if (config.a4) {
    onProgress?.(total, total, 'Generating PDF...')
    const fileImg = await fileDataToDataUrl(config.fileData, config.fileName)
    pdfBlob = await generateA4Pdf(qrDataUrls, {
      highDensity: config.highDensity,
      fileName: config.fileName,
      fileHash,
      description: config.description,
      fileDataUrl: fileImg?.url,
      imageWidth: fileImg?.width,
      imageHeight: fileImg?.height,
    })
  }

  return {
    qrDataUrls,
    numCodes: total,
    fileSize: config.fileData.length,
    pdfBlob,
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert Uint8Array to base64 string. */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Convert file data to data URL if it's an image, otherwise return undefined. */
async function fileDataToDataUrl(data: Uint8Array, fileName: string): Promise<{ url: string; width: number; height: number } | undefined> {
  const IMAGE_EXTS = /\.(jpg|jpeg|png|webp)$/i
  if (!IMAGE_EXTS.test(fileName)) return undefined

  const ext = fileName.toLowerCase().match(/\.(jpg|jpeg|png|webp)$/)?.[1] || 'jpg'
  const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
  const base64 = uint8ArrayToDataURL(data)
  const url = `data:${mimeType};base64,${base64}`

  // Get image dimensions
  const dims = await getImageDimensions(url)
  return { url, ...dims }
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      resolve({ width: 1, height: 1 })
    }
    img.src = dataUrl
  })
}

function uint8ArrayToDataURL(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
