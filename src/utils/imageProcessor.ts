export interface PreparedImageData {
  resized: {
    width: number
    height: number
    data: ArrayBuffer
  }
  original: {
    width: number
    height: number
    data: ArrayBuffer
  }
  previewUrl: string
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}


function getCanvasContext(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = (canvas as any).getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!context) {
    throw new Error('Failed to get 2D canvas context')
  }
  return context
}

async function createBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file)
  }

  const imageUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = imageUrl
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Failed to load image'))
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(image, 0, 0)
    return await createImageBitmap(canvas)
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

function getImageData(bitmap: ImageBitmap): ImageData {
  const canvas = createCanvas(bitmap.width, bitmap.height)
  const ctx = getCanvasContext(canvas)
  ctx.drawImage(bitmap, 0, 0)
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height)
}

function resizeImageData(imageData: ImageData, width: number, height: number): ImageData {
  const canvas = createCanvas(width, height)
  const ctx = getCanvasContext(canvas)
  const sourceCanvas = createCanvas(imageData.width, imageData.height)
  const sourceCtx = getCanvasContext(sourceCanvas)
  sourceCtx.putImageData(imageData, 0, 0)
  ctx.drawImage(sourceCanvas as CanvasImageSource, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}

function imageDataToArrayBuffer(imageData: ImageData): ArrayBuffer {
  return (imageData.data.buffer as ArrayBuffer).slice(0)
}

export function imageDataToFloatArray(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData
  const floatData = new Float32Array(width * height * 3)
  let pointer = 0
  for (let i = 0; i < data.length; i += 4) {
    floatData[pointer++] = data[i] / 255
    floatData[pointer++] = data[i + 1] / 255
    floatData[pointer++] = data[i + 2] / 255
  }
  return floatData
}

export async function prepareImageData(file: File): Promise<PreparedImageData> {
  const bitmap = await createBitmap(file)
  const originalImageData = getImageData(bitmap)

  if (originalImageData.width * originalImageData.height > 15_000_000) {
    throw new Error('Image exceeds maximum supported size of 15 megapixels.')
  }

  const resizedImageData = resizeImageData(originalImageData, 256, 256)
  const floatData = imageDataToFloatArray(resizedImageData)
  const previewUrl = URL.createObjectURL(file)
  return {
    resized: {
      width: 256,
      height: 256,
      data: floatData.buffer as ArrayBuffer
    },
    original: {
      width: originalImageData.width,
      height: originalImageData.height,
      data: imageDataToArrayBuffer(originalImageData)
    },
    previewUrl
  }
}

export function makeResultBlob(width: number, height: number, pixels: Uint8ClampedArray): Promise<Blob> {
  const canvas = createCanvas(width, height)
  const ctx = getCanvasContext(canvas)
  const clamped = new Uint8ClampedArray(pixels)
  const imageData = new ImageData(clamped, width, height)
  ;(ctx as any).putImageData(imageData, 0, 0)
  return new Promise<Blob>((resolve, reject) => {
    if (canvas instanceof OffscreenCanvas) {
      canvas.convertToBlob().then(resolve).catch(reject)
    } else {
      ;(canvas as HTMLCanvasElement).toBlob(blob => {
        if (!blob) {
          reject(new Error('Failed to create result blob'))
          return
        }
        resolve(blob)
      }, 'image/png')
    }
  })
}
