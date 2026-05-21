/**
 * Constants mirrored from the Python CLI tool (main.py lines 70-92).
 */

/** Maximum QR code version (largest possible). */
export const QR_VERSION = 40

/** Error correction level: L (lowest) for maximum data capacity. */
export const QR_ERROR_CORRECTION = 'L' as const

/**
 * Version 40, ECC-L, byte-mode capacity in characters.
 * This is the maximum number of base64 characters that fit in one QR code.
 */
export const QR_BYTE_CAPACITY = 2_953

/**
 * Maximum raw bytes per QR code.
 * Base64 expands 3 raw bytes -> 4 ASCII chars, so:
 * floor(QR_BYTE_CAPACITY / 4) * 3 = 2214
 */
export const MAX_BYTES_PER_QR = Math.floor(QR_BYTE_CAPACITY / 4) * 3 // 2214

/** Pixel size per QR module (box). */
export const QR_BOX_SIZE = 6

/** QR quiet zone in modules. */
export const QR_BORDER = 4

/** Regex to match qrcode_N.jpg filenames. */
export const QR_FILENAME_PATTERN = /^qrcode_(\d+)\.jpg$/

// ---------------------------------------------------------------------------
// A4 PDF layout constants (in points; 1 pt = 1/72 inch)
// ---------------------------------------------------------------------------

/** A4 width in points. */
export const A4_WIDTH = 595.28

/** A4 height in points. */
export const A4_HEIGHT = 841.89

/** 1 mm in points. */
export const MM = 72 / 25.4

/** Page margin. */
export const PDF_MARGIN = 10 * MM

/** Spacing between QR codes. */
export const PDF_SPACING = 2 * MM

/** Space reserved for header (title + date). */
export const PDF_HEADER_HEIGHT = 20

/** Space reserved for footer (page number). */
export const PDF_FOOTER_HEIGHT = 14

/** Default columns: 4 cols x 5 rows = 20 per page. */
export const PDF_COLS = 4

/** High-density columns: 5 cols x 6 rows = 30 per page. */
export const PDF_COLS_HIGH_DENSITY = 5

/** DPI levels to try when rendering PDF pages for decoding. */
export const PDF_DECODE_DPI_LEVELS = [400, 500, 600]

/** Supported image file extensions for decode input. */
export const SUPPORTED_IMAGE_EXTS = new Set([
  '.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp',
])
