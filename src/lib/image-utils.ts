/**
 * Canvas-based image processing utilities.
 * Replaces Pillow operations from the Python version.
 */

/** Load an image from a data URL or Blob into an HTMLImageElement. */
export function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      if (src instanceof Blob) {
        URL.revokeObjectURL(img.src)
      }
      resolve(img)
    }
    img.onerror = () => {
      if (src instanceof Blob) {
        URL.revokeObjectURL(img.src)
      }
      reject(new Error('Failed to load image'))
    }
    img.src = src instanceof Blob ? URL.createObjectURL(src) : src
  })
}

/** Get ImageData from an HTMLImageElement. */
export function imageToImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

/** Convert ImageData to grayscale (returns new ImageData). */
export function toGrayscale(imageData: ImageData): ImageData {
  const { width, height, data } = imageData
  const out = new ImageData(width, height)
  const d = out.data
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    d[i] = d[i + 1] = d[i + 2] = gray
    d[i + 3] = data[i + 3]
  }
  return out
}

/** Apply a binary threshold to an ImageData (assumes grayscale or works on luminance). */
export function applyThreshold(imageData: ImageData, threshold: number): ImageData {
  const { width, height, data } = imageData
  const out = new ImageData(width, height)
  const d = out.data
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    const val = gray > threshold ? 255 : 0
    d[i] = d[i + 1] = d[i + 2] = val
    d[i + 3] = data[i + 3]
  }
  return out
}

/** Sharpen an ImageData using a 3x3 convolution kernel. */
export function sharpen(imageData: ImageData): ImageData {
  const { width, height, data } = imageData
  const out = new ImageData(width, height)
  const d = out.data

  // Sharpen kernel:
  //  0  -1   0
  // -1   5  -1
  //  0  -1   0
  const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0]

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
        // Edge pixels: copy as-is
        d[idx] = data[idx]
        d[idx + 1] = data[idx + 1]
        d[idx + 2] = data[idx + 2]
        d[idx + 3] = data[idx + 3]
        continue
      }

      for (let c = 0; c < 3; c++) {
        let sum = 0
        let ki = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const nIdx = ((y + ky) * width + (x + kx)) * 4 + c
            sum += data[nIdx] * kernel[ki]
            ki++
          }
        }
        d[idx + c] = Math.max(0, Math.min(255, sum))
      }
      d[idx + 3] = data[idx + 3]
    }
  }
  return out
}

/** Resize an ImageData by the given scale factor. */
export function resize(imageData: ImageData, scale: number): ImageData {
  const newW = Math.round(imageData.width * scale)
  const newH = Math.round(imageData.height * scale)

  // Draw source onto a temp canvas, then draw scaled onto output canvas
  const srcCanvas = document.createElement('canvas')
  srcCanvas.width = imageData.width
  srcCanvas.height = imageData.height
  srcCanvas.getContext('2d')!.putImageData(imageData, 0, 0)

  const dstCanvas = document.createElement('canvas')
  dstCanvas.width = newW
  dstCanvas.height = newH
  const ctx = dstCanvas.getContext('2d')!
  // Use high-quality interpolation
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(srcCanvas, 0, 0, newW, newH)

  return ctx.getImageData(0, 0, newW, newH)
}

/** Convert ImageData to a canvas. */
export function imageDataToCanvas(imageData: ImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = imageData.width
  canvas.height = imageData.height
  canvas.getContext('2d')!.putImageData(imageData, 0, 0)
  return canvas
}
