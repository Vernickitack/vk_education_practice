import { useEffect, useReducer, useRef, useState } from 'react'
import { prepareImageData, makeResultBlob } from '../utils/imageProcessor'
import type {
  TaskEvent,
  TaskInfo,
  TaskStatus,
  WorkerProcessMessage,
  WorkerRequest,
  WorkerResponse
} from '../utils/types'

interface State {
  tasks: Record<string, TaskInfo>
}

type Action =
  | { type: 'ADD_TASK'; task: TaskInfo }
  | { type: 'UPDATE_TASK'; taskId: string; update: Partial<TaskInfo> }
  | {
      type: 'SET_TASK_RESULT'
      taskId: string
      resultUrl: string
      width: number
      height: number
      modelPredictions: { brightness: number; contrast: number; saturation: number }
      adjustments: { brightness: number; contrast: number; saturation: number }
    }
  | { type: 'CANCEL_TASK'; taskId: string }
  | { type: 'REMOVE_TASK'; taskId: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD_TASK':
      return {
        tasks: {
          ...state.tasks,
          [action.task.id]: action.task
        }
      }
    case 'UPDATE_TASK': {
      const current = state.tasks[action.taskId]
      if (!current) return state
      return {
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...current,
            ...action.update
          }
        }
      }
    }
    case 'SET_TASK_RESULT': {
      const current = state.tasks[action.taskId]
      if (!current) return state
      return {
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...current,
            status: 'done',
            progress: 100,
            resultUrl: action.resultUrl,
            width: action.width,
            height: action.height,
            modelPredictions: action.modelPredictions,
            adjustments: action.adjustments
          }
        }
      }
    }
    case 'CANCEL_TASK': {
      const current = state.tasks[action.taskId]
      if (!current) return state
      return {
        tasks: {
          ...state.tasks,
          [action.taskId]: {
            ...current,
            status: 'cancelled',
            progress: 0
          }
        }
      }
    }
    case 'REMOVE_TASK': {
      const { [action.taskId]: removed, ...rest } = state.tasks
      return { tasks: rest }
    }
    default:
      return state
  }
}

function generateId(): string {
  return `task-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`
}

interface UseImageEnhancerResult {
  tasks: Record<string, TaskInfo>
  activeTaskId: string | null
  setActiveTask: (taskId: string | null) => void
  submitTask: (file: File) => Promise<string>
  reprocessTask: (taskId: string) => Promise<void>
  updateTask: (taskId: string, update: Partial<TaskInfo>) => void
  cancelTask: (taskId: string) => void
  removeTask: (taskId: string) => void
  getTaskStatus: (taskId: string) => TaskInfo | undefined
  onStatusChange: (listener: (event: TaskEvent) => void) => () => void
}

export function useImageEnhancer(): UseImageEnhancerResult {
  const [state, dispatch] = useReducer(reducer, { tasks: {} })
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const listenersRef = useRef<Set<(event: TaskEvent) => void>>(new Set())
  const taskQueueRef = useRef<WorkerProcessMessage[]>([])
  const activeTaskIdRef = useRef<string | null>(null)
  const tasksRef = useRef<Record<string, TaskInfo>>(state.tasks)

  const processNextTask = () => {
    if (activeTaskIdRef.current || taskQueueRef.current.length === 0) {
      return
    }

    const nextMessage = taskQueueRef.current.shift()
    if (!nextMessage) {
      return
    }

    activeTaskIdRef.current = nextMessage.taskId
    workerRef.current?.postMessage(nextMessage, [nextMessage.modelInput.data, nextMessage.original.data])
  }

  useEffect(() => {
    tasksRef.current = state.tasks

    const worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker

    worker.onmessage = async (event: MessageEvent<WorkerResponse>) => {
      const message = event.data
      if (message.type === 'status') {
        if (message.status === 'cancelled' && activeTaskIdRef.current === message.taskId) {
          activeTaskIdRef.current = null
          processNextTask()
        }

        dispatch({
          type: 'UPDATE_TASK',
          taskId: message.taskId,
          update: {
            status: message.status,
            progress: message.progress
          }
        })
        listenersRef.current.forEach(listener => listener({
          taskId: message.taskId,
          status: message.status,
          progress: message.progress
        }))
      }

      if (message.type === 'result') {
        activeTaskIdRef.current = null
        processNextTask()

        try {
          const existing = tasksRef.current[message.taskId]
          if (existing && existing.resultUrl) {
            try { URL.revokeObjectURL(existing.resultUrl) } catch (e) { /* ignore */ }
          }
        } catch (e) {
          // ignore
        }

        const pixels = new Uint8ClampedArray(message.data)
        const blob = await makeResultBlob(message.width, message.height, pixels)
        const resultUrl = URL.createObjectURL(blob)

        dispatch({
          type: 'SET_TASK_RESULT',
          taskId: message.taskId,
          resultUrl,
          width: message.width,
          height: message.height,
          modelPredictions: {
            brightness: message.brightness,
            contrast: message.contrast,
            saturation: message.saturation
          },
          adjustments: {
            brightness: typeof message.brightness === 'number' ? message.brightness : 0,
            contrast: typeof message.contrast === 'number' ? message.contrast - 1 : 0,
            saturation: typeof message.saturation === 'number' ? message.saturation - 1 : 0
          }
        })
        updateTask(message.taskId, {
          modelPredictions: {
            brightness: message.brightness,
            contrast: message.contrast,
            saturation: message.saturation
          },
          adjustments: {
            brightness: typeof message.brightness === 'number' ? message.brightness : 0,
            contrast: typeof message.contrast === 'number' ? message.contrast - 1 : 0,
            saturation: typeof message.saturation === 'number' ? message.saturation - 1 : 0
          }
        })
        listenersRef.current.forEach(listener => listener({
          taskId: message.taskId,
          status: 'done',
          progress: 100,
          resultUrl
        }))
      }

      if (message.type === 'error') {
        activeTaskIdRef.current = null
        processNextTask()

        dispatch({
          type: 'UPDATE_TASK',
          taskId: message.taskId,
          update: {
            status: 'error',
            progress: message.progress,
            error: message.error
          }
        })
        listenersRef.current.forEach(listener => listener({
          taskId: message.taskId,
          status: 'error',
          progress: message.progress,
          error: message.error
        }))
      }
    }

    return () => {
      worker.terminate()
      workerRef.current = null
    }
  }, [])

  const updateTask = (taskId: string, update: Partial<TaskInfo>) => {
    dispatch({ type: 'UPDATE_TASK', taskId, update })
  }

  const setActiveTask = (taskId: string | null) => {
    setActiveTaskId(taskId)
    activeTaskIdRef.current = taskId
  }

  const submitTask = async (file: File): Promise<string> => {
    const taskId = generateId()
    const task: TaskInfo = {
      id: taskId,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      status: 'pending',
      progress: 0,
      previewUrl: URL.createObjectURL(file),
      originalFile: file,
      createdAt: Date.now()
    }

    dispatch({ type: 'ADD_TASK', task })
    listenersRef.current.forEach(listener => listener({
      taskId,
      status: 'pending',
      progress: 0
    }))

    try {
      const prepared = await prepareImageData(file)
      updateTask(taskId, { status: 'processing', progress: 10 })
      listenersRef.current.forEach(listener => listener({
        taskId,
        status: 'processing',
        progress: 10
      }))

      const message: WorkerRequest = {
        type: 'process',
        taskId,
        modelInput: prepared.resized,
        original: prepared.original
      }

      taskQueueRef.current.push(message)
      processNextTask()

      if (!activeTaskIdRef.current) {
        setActiveTaskId(taskId)
        activeTaskIdRef.current = taskId
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process image'
      dispatch({
        type: 'UPDATE_TASK',
        taskId,
        update: {
          status: 'error',
          progress: 0,
          error: message
        }
      })
      listenersRef.current.forEach(listener => listener({
        taskId,
        status: 'error',
        progress: 0,
        error: message
      }))
    }

    return taskId
  }

  const cancelTask = (taskId: string): void => {
    const queueIndex = taskQueueRef.current.findIndex(message => message.taskId === taskId)
    if (queueIndex !== -1) {
      taskQueueRef.current.splice(queueIndex, 1)
      dispatch({ type: 'CANCEL_TASK', taskId })
      listenersRef.current.forEach(listener => listener({
        taskId,
        status: 'cancelled',
        progress: 0
      }))
      return
    }

    workerRef.current?.postMessage({ type: 'cancel', taskId })
    if (activeTaskIdRef.current === taskId) {
      setActiveTask(null)
      processNextTask()
    }

    dispatch({ type: 'CANCEL_TASK', taskId })
    listenersRef.current.forEach(listener => listener({
      taskId,
      status: 'cancelled',
      progress: 0
    }))
  }

  const reprocessTask = async (taskId: string): Promise<void> => {
    const task = state.tasks[taskId]
    if (!task || !task.originalFile) return
    if (task.status === 'processing' || task.status === 'pending') return

    updateTask(taskId, { status: 'processing', progress: 10 })
    listenersRef.current.forEach(listener => listener({
      taskId,
      status: 'processing',
      progress: 10
    }))

    try {
      const prepared = await prepareImageData(task.originalFile)
      const message: WorkerRequest = {
        type: 'process',
        taskId,
        modelInput: prepared.resized,
        original: prepared.original
      }

      taskQueueRef.current.push(message)
      processNextTask()

      if (!activeTaskIdRef.current) {
        setActiveTaskId(taskId)
        activeTaskIdRef.current = taskId
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to reprocess image'
      dispatch({
        type: 'UPDATE_TASK',
        taskId,
        update: {
          status: 'error',
          progress: 0,
          error: message
        }
      })
      listenersRef.current.forEach(listener => listener({
        taskId,
        status: 'error',
        progress: 0,
        error: message
      }))
    }
  }

  const removeTask = (taskId: string): void => {
    taskQueueRef.current = taskQueueRef.current.filter(message => message.taskId !== taskId)
    if (activeTaskIdRef.current === taskId) {
      workerRef.current?.postMessage({ type: 'cancel', taskId })
      setActiveTask(null)
      processNextTask()
    }
    const task = state.tasks[taskId]
    if (task) {
      if (task.previewUrl) {
        try { URL.revokeObjectURL(task.previewUrl) } catch (e) { /* ignore */ }
      }
      if (task.resultUrl) {
        try { URL.revokeObjectURL(task.resultUrl) } catch (e) { /* ignore */ }
      }
    }

    dispatch({ type: 'REMOVE_TASK', taskId })
  }

  const getTaskStatus = (taskId: string): TaskInfo | undefined => {
    return state.tasks[taskId]
  }

  const onStatusChange = (listener: (event: TaskEvent) => void): (() => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }

  return {
    tasks: state.tasks,
    activeTaskId,
    setActiveTask,
    submitTask,
    reprocessTask,
    updateTask,
    cancelTask,
    removeTask,
    getTaskStatus,
    onStatusChange
  }
}
