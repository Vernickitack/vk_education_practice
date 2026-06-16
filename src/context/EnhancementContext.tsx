import { createContext, ReactNode, useContext } from 'react'
import { useImageEnhancer } from '../hooks/useImageEnhancer'
import type { TaskEvent, TaskInfo } from '../utils/types'

interface EnhancementContextValue {
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

const EnhancementContext = createContext<EnhancementContextValue | undefined>(undefined)

export function EnhancementProvider({ children }: { children: ReactNode }) {
  const enhancer = useImageEnhancer()
  return <EnhancementContext.Provider value={enhancer}>{children}</EnhancementContext.Provider>
}

export function useEnhancement() {
  const context = useContext(EnhancementContext)
  if (!context) {
    throw new Error('useEnhancement must be used within EnhancementProvider')
  }
  return context
}
