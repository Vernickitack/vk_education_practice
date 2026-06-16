import * as tf from '@tensorflow/tfjs'
import '@tensorflow/tfjs-backend-webgl'
import type { WorkerRequest, WorkerResponse } from './utils/types'

let model: tf.LayersModel | tf.GraphModel | null = null
const cancelledTasks = new Set<string>()
let currentTaskId: string | null = null

async function loadModel(): Promise<tf.LayersModel | tf.GraphModel> {
  if (model) return model

  await tf.setBackend('webgl')
  await tf.ready()
  const modelPath = '/model/model.json'

  try {
    model = await tf.loadGraphModel(modelPath)
    return model
  } catch (e) {
    model = await tf.loadLayersModel(modelPath)
    return model
  }
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function buildImageDataFromBuffer(width: number, height: number, buffer: ArrayBuffer): ImageData {
  return new ImageData(new Uint8ClampedArray(buffer), width, height)
}

function applyCorrection(
  taskId: string,
  originalData: Uint8ClampedArray,
  width: number,
  height: number,
  brightness: number,
  contrast: number,
  saturation: number
): Uint8ClampedArray {
  const result = new Uint8ClampedArray(originalData.length)
  const pixelCount = width * height

  for (let i = 0; i < pixelCount; i += 1) {
    const index = i * 4
    const r = originalData[index] / 255
    const g = originalData[index + 1] / 255
    const b = originalData[index + 2] / 255

    let red = r + brightness
    let green = g + brightness
    let blue = b + brightness

    red = (red - 0.5) * contrast + 0.5
    green = (green - 0.5) * contrast + 0.5
    blue = (blue - 0.5) * contrast + 0.5

      const luma = 0.299 * red + 0.587 * green + 0.114 * blue
      red = luma + (red - luma) * saturation
      green = luma + (green - luma) * saturation
    blue = luma + (blue - luma) * saturation

    result[index] = Math.round(clamp(red) * 255)
    result[index + 1] = Math.round(clamp(green) * 255)
    result[index + 2] = Math.round(clamp(blue) * 255)
    result[index + 3] = originalData[index + 3]

    if (i % 65536 === 0) {
      const progress = Math.min(95, Math.round((i / pixelCount) * 50) + 45)
      postMessage({ type: 'status', taskId, status: 'processing', progress })
      if (cancelledTasks.has(taskId)) {
        break
      }
    }
  }

  return result
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const data = event.data

  if (data.type === 'cancel') {
    cancelledTasks.add(data.taskId)
    return
  }

  if (data.type === 'process') {
    currentTaskId = data.taskId
    cancelledTasks.delete(data.taskId)
    postMessage({ type: 'status', taskId: data.taskId, status: 'processing', progress: 15 })

    try {
      const model = await loadModel()
      if (cancelledTasks.has(data.taskId)) {
        postMessage({ type: 'status', taskId: data.taskId, status: 'cancelled', progress: 0 })
        return
      }

      const floatData = new Float32Array(data.modelInput.data)
      const inputTensor = tf.tensor4d(floatData, [1, data.modelInput.height, data.modelInput.width, 3], 'float32')
      const prediction = model.predict(inputTensor) as tf.Tensor
      const predicted = await prediction.data()
      inputTensor.dispose()
      prediction.dispose()

      if (cancelledTasks.has(data.taskId)) {
        postMessage({ type: 'status', taskId: data.taskId, status: 'cancelled', progress: 0 })
        return
      }

      const roundPrediction = (value: number, fallback: number) =>
        Number.isFinite(value) ? Math.round(value * 1000) / 1000 : fallback

      const brightness = roundPrediction(predicted[0], 0)
      const contrast = roundPrediction(predicted[1], 1)
      const saturation = roundPrediction(predicted[2], 1)
      postMessage({ type: 'status', taskId: data.taskId, status: 'processing', progress: 35 })

      const originalPixels = new Uint8ClampedArray(data.original.data)
      const correctedPixels = applyCorrection(
        data.taskId,
        originalPixels,
        data.original.width,
        data.original.height,
        brightness,
        contrast,
        saturation
      )
      if (cancelledTasks.has(data.taskId)) {
        postMessage({ type: 'status', taskId: data.taskId, status: 'cancelled', progress: 0 })
        return
      }

      ;(postMessage as unknown as (message: any, transfer?: Transferable[]) => void)({
        type: 'result',
        taskId: data.taskId,
        status: 'done',
        progress: 100,
        width: data.original.width,
        height: data.original.height,
        data: correctedPixels.buffer,
        brightness,
        contrast,
        saturation
      }, [correctedPixels.buffer as ArrayBuffer])
    } catch (error) {
      postMessage({
        type: 'error',
        taskId: data.taskId,
        status: 'error',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown worker error'
      })
    }
  }
}
