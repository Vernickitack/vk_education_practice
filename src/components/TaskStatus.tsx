import { useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import { useEnhancement } from '../context/EnhancementContext'
import type { Adjustments, TaskStatus } from '../utils/types'
import "bootstrap-icons/font/bootstrap-icons.css";

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: 'В очереди',
  processing: 'Обработка',
  done: 'Готово',
  cancelled: 'Отменено',
  error: 'Ошибка'
}

const STATUS_VARIANTS: Record<TaskStatus, string> = {
  pending: 'secondary',
  processing: 'info',
  done: 'success',
  cancelled: 'warning',
  error: 'danger'
}

const formatStatus = (status: TaskStatus) => STATUS_LABELS[status] || status

const truncateFileName = (fileName: string, maxLength: number = 26): string => {
  if (fileName.length <= maxLength) return fileName
  return fileName.substring(0, maxLength) + '...'
}

export default function TaskStatus() {
  const { tasks, activeTaskId, setActiveTask, cancelTask, removeTask, reprocessTask, updateTask } = useEnhancement()
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isEditModalRendered, setIsEditModalRendered] = useState(false)
  const [editorTaskId, setEditorTaskId] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [saturation, setSaturation] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [taskPreviewUrls, setTaskPreviewUrls] = useState<Record<string, string>>({})

  const roundToThousandth = (value: number) => Math.round(value * 1000) / 1000
  const formatAdjustmentValue = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(3)}`

  const taskList = Object.values(tasks).sort((a, b) => b.createdAt - a.createdAt)

  const selectedTasks = useMemo(() => taskList.filter(task => selectedTaskIds.has(task.id)), [selectedTaskIds, taskList])
  const downloadableTasks = useMemo(
    () => selectedTasks.filter(task => task.status === 'done' && !!task.resultUrl),
    [selectedTasks]
  )

  const editorTask = editorTaskId ? tasks[editorTaskId] : null

  const taskAdjustments = useMemo(() => {
    if (!editorTask) return DEFAULT_ADJUSTMENTS
    if (editorTask.adjustments) return editorTask.adjustments
    if (editorTask.modelPredictions) {
      return {
        brightness: editorTask.modelPredictions.brightness ?? 0,
        contrast: (editorTask.modelPredictions.contrast ?? 1) - 1,
        saturation: (editorTask.modelPredictions.saturation ?? 1) - 1
      }
    }
    return DEFAULT_ADJUSTMENTS
  }, [editorTask])

  useEffect(() => {
    if (!isEditModalOpen && isEditModalRendered) {
      const timeout = window.setTimeout(() => setIsEditModalRendered(false), 200)
      return () => window.clearTimeout(timeout)
    }
    return undefined
  }, [isEditModalOpen, isEditModalRendered])

  useEffect(() => {
    document.body.style.overflow = isEditModalRendered ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isEditModalRendered])

  useEffect(() => {
    if (!editorTask) {
      setBrightness(DEFAULT_ADJUSTMENTS.brightness)
      setContrast(DEFAULT_ADJUSTMENTS.contrast)
      setSaturation(DEFAULT_ADJUSTMENTS.saturation)
      setDownloadUrl(null)
      return
    }

    setBrightness(roundToThousandth(taskAdjustments.brightness))
    setContrast(roundToThousandth(taskAdjustments.contrast))
    setSaturation(roundToThousandth(taskAdjustments.saturation))
    setDownloadUrl(null)
  }, [editorTask?.id, taskAdjustments.brightness, taskAdjustments.contrast, taskAdjustments.saturation])

  useEffect(() => {
    if (!editorTask || !canvasRef.current) return

    const imageUrl = editorTask.resultUrl ?? editorTask.previewUrl
    if (!imageUrl) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageUrl
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = editorTask.width || img.width
      canvas.height = editorTask.height || img.height
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      applyAdjustments(ctx, canvas.width, canvas.height, brightness, 1 + contrast, 1 + saturation)
      canvas.toBlob(blob => {
        if (blob) {
          const url = URL.createObjectURL(blob)
          setDownloadUrl(url)
        }
      }, 'image/png')
    }
  }, [editorTask, brightness, contrast, saturation, isEditModalRendered])

  useEffect(() => {
    let cancelled = false

    const buildPreviewUrl = async (task: typeof editorTask) => {
      if (!task || !(task.resultUrl || task.previewUrl) || !task.adjustments) return
      const imageUrl = task.resultUrl ?? task.previewUrl
      if (!imageUrl) return

      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = imageUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load task preview image'))
      })

      if (cancelled) return
      const canvas = document.createElement('canvas')
      const size = 64
      const aspect = img.width / img.height
      if (img.width >= img.height) {
        canvas.width = size
        canvas.height = Math.max(1, Math.round(size / aspect))
      } else {
        canvas.height = size
        canvas.width = Math.max(1, Math.round(size * aspect))
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      applyAdjustments(ctx, canvas.width, canvas.height, task.adjustments.brightness, 1 + task.adjustments.contrast, 1 + task.adjustments.saturation)
      const dataUrl = canvas.toDataURL('image/png')
      if (cancelled) return
      setTaskPreviewUrls(prev => ({ ...prev, [task.id]: dataUrl }))
    }

    taskList.forEach(task => {
      if (!task.adjustments || !(task.resultUrl || task.previewUrl)) return
      buildPreviewUrl(task).catch(() => {
        if (!cancelled) {
          setTaskPreviewUrls(prev => {
            const next = { ...prev }
            delete next[task.id]
            return next
          })
        }
      })
    })

    return () => {
      cancelled = true
    }
  }, [taskList])

  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    }
  }, [downloadUrl])

  useEffect(() => {
    if (!isEditModalRendered) setEditorTaskId(null)
  }, [isEditModalRendered])

  const selectAll = () => setSelectedTaskIds(new Set(taskList.map(task => task.id)))
  const clearSelection = () => setSelectedTaskIds(new Set())

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const cancelSelected = () => {
    selectedTasks.forEach(task => {
      if (task.status === 'processing' || task.status === 'pending') cancelTask(task.id)
    })
  }

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const openEditor = (taskId: string) => {
    setEditorTaskId(taskId)
    setIsEditModalRendered(true)
    requestAnimationFrame(() => setIsEditModalOpen(true))
  }

  const closeEditor = () => setIsEditModalOpen(false)

  const normalizeDownloadFileName = (fileName: string) => `${fileName.replace(/\.[^.]+$/, '')}.png`

  const downloadResult = () => {
    if (!downloadUrl || !editorTask) return
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `enhanced-${normalizeDownloadFileName(editorTask.fileName)}`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }

  const updateAdjustment = (field: keyof Adjustments, value: number) => {
    if (!editorTask) return
    const nextAdjustments: Adjustments = {
      brightness,
      contrast,
      saturation,
      [field]: roundToThousandth(value)
    } as Adjustments

    setBrightness(roundToThousandth(nextAdjustments.brightness))
    setContrast(roundToThousandth(nextAdjustments.contrast))
    setSaturation(roundToThousandth(nextAdjustments.saturation))
    updateTask(editorTask.id, { adjustments: nextAdjustments })
  }

  const makeBlobFromTask = async (task: typeof downloadableTasks[number]): Promise<Blob> => {
    const url = task.resultUrl ?? task.previewUrl
    if (!url) throw new Error('Нет URL изображения для экспорта')

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image for export'))
    })

    const canvas = document.createElement('canvas')
    canvas.width = task.width || img.width
    canvas.height = task.height || img.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to create canvas context')

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    if (task.adjustments) applyAdjustments(ctx, canvas.width, canvas.height, task.adjustments.brightness, 1 + task.adjustments.contrast, 1 + task.adjustments.saturation)

    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) reject(new Error('Failed to create export blob'))
        else resolve(blob)
      }, 'image/png')
    })
  }

  const downloadSelected = async () => {
    for (const task of downloadableTasks) {
      const blob = await makeBlobFromTask(task)
      downloadBlob(blob, `enhanced-${normalizeDownloadFileName(task.fileName)}`)
    }
  }

  const downloadSelectedZip = async () => {
    if (downloadableTasks.length === 0) return
    const zip = new JSZip()
    await Promise.all(downloadableTasks.map(async task => {
      const blob = await makeBlobFromTask(task)
      zip.file(`enhanced-${normalizeDownloadFileName(task.fileName)}`, blob)
    }))
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(zipBlob, 'enhanced-images.zip')
  }

  const deleteSelected = () => {
    selectedTasks.forEach(task => {
      if (task.status !== 'processing' && task.status !== 'pending') removeTask(task.id)
    })
    clearSelection()
  }

  if (taskList.length === 0) {
    return (
      <div>
        <h2 className="h5 mb-3">Статус задач</h2>
        <p className="text-secondary">Нет задач. Загрузите изображение, чтобы начать обработку.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 mb-4">
        <div>
          <h2 className="h5 mb-1">Статус задач</h2>
          <p className="text-secondary mb-0">Управляйте очередью, скачивайте результаты и редактируйте изображения.</p>
        </div>
      </div>

      <div className="d-flex flex-wrap gap-2 mb-4">
        <button className="btn btn-outline-secondary btn-sm" onClick={selectAll}>Выбрать все</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={clearSelection}>Снять выбор</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={cancelSelected} disabled={selectedTasks.length === 0}>Отменить выбранные</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={deleteSelected} disabled={selectedTasks.length === 0}>Удалить выбранные</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={downloadSelected} disabled={downloadableTasks.length === 0}>Скачать выбранное</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={downloadSelectedZip} disabled={downloadableTasks.length === 0}>Скачать ZIP</button>
      </div>

      <div className="list-group">
        {taskList.map(task => {
          const isActive = task.id === activeTaskId
          const statusVariant = STATUS_VARIANTS[task.status] || 'secondary'

          return (
            <div
              key={task.id}
              className={`list-group-item list-group-item-action mb-3 rounded-4 shadow-sm ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTask(task.id)}
            >
              <div className="d-flex flex-column flex-md-row align-items-start gap-3">
                <div className="form-check mt-1">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    checked={selectedTaskIds.has(task.id)}
                    onChange={event => {
                      event.stopPropagation()
                      toggleTaskSelection(task.id)
                    }}
                    onClick={event => event.stopPropagation()}
                  />
                </div>

                <div className="flex-fill">
                  <div className="d-flex flex-column flex-md-row justify-content-between gap-3 w-100" style={{ minWidth: 0 }}>
                    <div className="text-truncate flex-shrink-1" style={{ minWidth: 0 }}>
                      <h3 className="h6 mb-1 text-truncate" title={task.fileName}>{truncateFileName(task.fileName)}</h3>
                      <span className={`badge bg-${statusVariant}`}>{formatStatus(task.status)}</span>
                    </div>
                    <div className="text-md-end text-secondary">
                      <div className="fw-semibold">{task.progress}%</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="progress" style={{ height: 8 }}>
                      <div
                        className="progress-bar"
                        role="progressbar"
                        style={{ width: `${task.progress}%` }}
                        aria-valuenow={task.progress}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                  </div>

                  {task.error && <div className="alert alert-danger py-2 mt-3 mb-0">{task.error}</div>}

                  <div className="d-flex flex-wrap gap-2 mt-3">
                    {(task.status === 'processing' || task.status === 'pending') && (
                      <button className="btn btn-outline-secondary btn-sm" onClick={event => { event.stopPropagation(); cancelTask(task.id) }}>Отмена</button>
                    )}
                    {task.status === 'done' && (task.resultUrl || task.previewUrl) && (
                      <button className="btn btn-info btn-sm" onClick={event => { event.stopPropagation(); openEditor(task.id) }} title="Редактировать изображение">
                        <i className="bi bi-pencil me-1" />Редактировать
                      </button>
                    )}
                    {task.status !== 'processing' && task.status !== 'pending' && task.originalFile && (
                      <button className="btn btn-warning btn-sm" onClick={event => { event.stopPropagation(); reprocessTask(task.id) }} title="Переобработать изображение">
                        <i className="bi bi-arrow-clockwise me-1" />Переобработать
                      </button>
                    )}
                    {task.status !== 'processing' && task.status !== 'pending' && (
                      <button className="btn btn-danger btn-sm" onClick={event => { event.stopPropagation(); removeTask(task.id) }} title="Удалить задачу">
                        <i className="bi bi-trash me-1" />Удалить
                      </button>
                    )}
                  </div>
                </div>

                {(task.previewUrl || task.resultUrl) && (
                  <div className="d-flex flex-wrap align-items-center gap-2 justify-content-end">
                    {task.previewUrl && (
                      <img src={task.previewUrl} alt={`preview-${task.fileName}`} className="rounded-3 border" style={{ width: 70, height: 70, objectFit: 'contain', backgroundColor: '#f8f9fa' }} />
                    )}
                    {(task.resultUrl || task.previewUrl) && (
                      <img src={taskPreviewUrls[task.id] ?? task.resultUrl ?? task.previewUrl} alt={`corrected-${task.fileName}`} className="rounded-3 border" style={{ width: 70, height: 70, objectFit: 'contain', backgroundColor: '#f8f9fa' }} />
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {isEditModalRendered && editorTask && (
        <>
          <div className={`modal-backdrop fade ${isEditModalOpen ? 'show' : ''}`} />
          <div className={`modal fade ${isEditModalOpen ? 'show d-flex' : 'd-flex'}`}
            tabIndex={-1}
            role="dialog"
            onClick={closeEditor}
          >
            <div className="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-sm-down" role="document" onClick={event => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Редактирование изображения</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeEditor} />
                </div>
                <div className="modal-body">
                  <div className="row gy-4">
                    <div className="col-12 col-md-5">
                      <div className="mb-4">
                        <p className="mb-2 text-truncate" title={editorTask.fileName}>{truncateFileName(editorTask.fileName)}</p>
                        <canvas
                          ref={canvasRef}
                          className="img-fluid rounded"
                          style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'calc(80vh - 180px)', border: '1px solid #dee2e6' }}
                        />
                      </div>
                    </div>
                    <div className="col-12 col-md-7">
                      <div className="mb-3">
                        <label className="form-label">Яркость: {formatAdjustmentValue(brightness ?? 0)}</label>
                        <input
                          className="form-range"
                          type="range"
                          min={-0.5}
                          max={0.5}
                          step={0.001}
                          value={brightness ?? 0}
                          onChange={e => updateAdjustment('brightness', Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="form-control mt-2"
                          step={0.001}
                          min={-0.5}
                          max={0.5}
                          value={brightness ?? 0}
                          onChange={e => updateAdjustment('brightness', e.target.value === '' ? 0 : Number(e.target.value))}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Контраст: {formatAdjustmentValue(contrast ?? 0)}</label>
                        <input
                          className="form-range"
                          type="range"
                          min={-0.5}
                          max={0.5}
                          step={0.001}
                          value={contrast ?? 0}
                          onChange={e => updateAdjustment('contrast', Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="form-control mt-2"
                          step={0.001}
                          min={-0.5}
                          max={0.5}
                          value={contrast ?? 0}
                          onChange={e => updateAdjustment('contrast', e.target.value === '' ? 0 : Number(e.target.value))}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Насыщенность: {formatAdjustmentValue(saturation ?? 0)}</label>
                        <input
                          className="form-range"
                          type="range"
                          min={-1}
                          max={1}
                          step={0.001}
                          value={saturation ?? 0}
                          onChange={e => updateAdjustment('saturation', Number(e.target.value))}
                        />
                        <input
                          type="number"
                          className="form-control mt-2"
                          step={0.001}
                          min={-1}
                          max={1}
                          value={saturation ?? 0}
                          onChange={e => updateAdjustment('saturation', e.target.value === '' ? 0 : Number(e.target.value))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="modal-footer d-flex justify-content-between flex-wrap gap-2">
                  <button type="button" className="btn btn-primary" onClick={downloadResult} disabled={!downloadUrl}>
                    Скачать
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={closeEditor}>
                    Закрыть
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function applyAdjustments(ctx: CanvasRenderingContext2D, width: number, height: number, brightness: number, contrast: number, saturation: number) {
  const imageData = ctx.getImageData(0, 0, width, height)
  const data = imageData.data
  const pixelCount = width * height
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4
    let r = data[idx] / 255
    let g = data[idx + 1] / 255
    let b = data[idx + 2] / 255

    r = r + brightness
    g = g + brightness
    b = b + brightness

    r = (r - 0.5) * contrast + 0.5
    g = (g - 0.5) * contrast + 0.5
    b = (b - 0.5) * contrast + 0.5

    const luma = 0.299 * r + 0.587 * g + 0.114 * b
    r = luma + (r - luma) * saturation
    g = luma + (g - luma) * saturation
    b = luma + (b - luma) * saturation

    data[idx] = Math.round(Math.min(1, Math.max(0, r)) * 255)
    data[idx + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255)
    data[idx + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255)
  }
  ctx.putImageData(imageData, 0, 0)
}
