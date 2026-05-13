/**
 * Type definitions for encode/decode operations.
 */

/** Configuration for encode mode. */
export interface EncodeConfig {
  /** The raw file bytes to encode. */
  fileData: Uint8Array
  /** Original filename (used as default PDF title). */
  fileName: string
  /** Whether to generate an A4 PDF. */
  a4: boolean
  /** Use high-density grid (5x6 = 30/page) instead of default (4x5 = 20/page). */
  highDensity: boolean
  /** Custom PDF title. null = use filename, empty string = no title. */
  title: string | null
  /** Whether to show the date in the PDF header. */
  showDate: boolean
  /** Optional short description shown in PDF header below filename. */
  description?: string
}

/** Metadata about a single data chunk. */
export interface ChunkInfo {
  /** 1-based chunk index. */
  index: number
  /** Total number of chunks. */
  total: number
  /** Size in bytes. */
  size: number
  /** Raw data bytes for this chunk. */
  data: Uint8Array
}

/** A decoded QR code with its position info. */
export interface DecodedQr {
  /** Raw payload bytes (after base64 decode). */
  data: Uint8Array
  /** Bounding rectangle from the scanner. */
  rect: { x: number; y: number; width: number; height: number }
}

/** Result of an encode operation. */
export interface EncodeResult {
  /** Generated QR code images as data URLs. */
  qrDataUrls: string[]
  /** Number of chunks/QR codes. */
  numCodes: number
  /** Total file size in bytes. */
  fileSize: number
  /** Generated PDF blob (if A4 was requested). */
  pdfBlob?: Blob
}

/** Progress callback for long-running operations. */
export type ProgressCallback = (current: number, total: number, message?: string) => void
