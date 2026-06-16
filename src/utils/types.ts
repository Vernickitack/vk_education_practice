export type TaskStatus = 'pending' | 'processing' | 'done' | 'cancelled' | 'error'

export interface Adjustments {
  brightness: number
  contrast: number
  saturation: number
}

export interface ModelPredictions {
  brightness: number
  contrast: number
  saturation: number
}

export interface TaskInfo {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  status: TaskStatus
  progress: number
  error?: string
  previewUrl?: string
  originalFile?: File
  resultUrl?: string
  width?: number
  height?: number
  modelPredictions?: ModelPredictions
  adjustments?: Adjustments
  createdAt: number
}

export interface TaskEvent {
  taskId: string
  status: TaskStatus
  progress: number
  error?: string
  resultUrl?: string
}

export interface WorkerProcessMessage {
  type: 'process'
  taskId: string
  modelInput: {
    width: number
    height: number
    data: ArrayBuffer
  }
  original: {
    width: number
    height: number
    data: ArrayBuffer
  }
}

export interface WorkerCancelMessage {
  type: 'cancel'
  taskId: string
}

export type WorkerRequest = WorkerProcessMessage | WorkerCancelMessage

export interface WorkerStatusMessage {
  type: 'status'
  taskId: string
  status: TaskStatus
  progress: number
}

export interface WorkerResultMessage {
  type: 'result'
  taskId: string
  status: 'done'
  progress: number
  width: number
  height: number
  data: ArrayBuffer
  brightness: number
  contrast: number
  saturation: number
}

export interface WorkerErrorMessage {
  type: 'error'
  taskId: string
  status: 'error'
  progress: number
  error: string
}

export type WorkerResponse = WorkerStatusMessage | WorkerResultMessage | WorkerErrorMessage
