import { useEffect, useMemo, useRef, useState } from 'react'
import { useEnhancement } from '../context/EnhancementContext'
import type { Adjustments } from '../utils/types'

const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0
}

export default function ImagePreview() {
  const { tasks, activeTaskId, updateTask } = useEnhancement()
  const completedTasks = Object.values(tasks).filter(task => task.status === 'done')
  const latestTask = completedTasks.sort((a, b) => b.createdAt - a.createdAt)[0]
  const currentTask = activeTaskId ? tasks[activeTaskId] : latestTask

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [brightness, setBrightness] = useState(0)
  const [contrast, setContrast] = useState(0)
  const [saturation, setSaturation] = useState(0)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isEditModalRendered, setIsEditModalRendered] = useState(false)

  const openEditor = () => {
    setIsEditModalRendered(true)
    requestAnimationFrame(() => {
      setIsEditModalOpen(true)
    })
  }

  const closeEditor = () => {
    setIsEditModalOpen(false)
  }

  const downloadResult = () => {
    if (!downloadUrl || !currentTask) return
    const anchor = document.createElement('a')
    anchor.href = downloadUrl
    anchor.download = `enhanced-${currentTask.fileName}.png`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }

  useEffect(() => {
    if (!isEditModalOpen && isEditModalRendered) {
      const timeout = window.setTimeout(() => {
        setIsEditModalRendered(false)
      }, 200)
      return () => window.clearTimeout(timeout)
    }
    return undefined
  }, [isEditModalOpen, isEditModalRendered])

  useEffect(() => {
    if (isEditModalRendered) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isEditModalRendered])

  const taskAdjustments = useMemo(() => {
    if (!currentTask) return DEFAULT_ADJUSTMENTS
    if (currentTask.adjustments) return currentTask.adjustments
    if (currentTask.modelPredictions) {
      return {
        brightness: currentTask.modelPredictions.brightness ?? 0,
        contrast: (currentTask.modelPredictions.contrast ?? 1) - 1,
        saturation: (currentTask.modelPredictions.saturation ?? 1) - 1
      }
    }
    return DEFAULT_ADJUSTMENTS
  }, [currentTask])

  const currentTaskId = currentTask?.id ?? null

  const roundToThousandth = (value: number) => Math.round(value * 1000) / 1000

  useEffect(() => {
    if (!currentTask) {
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
  }, [currentTaskId, taskAdjustments.brightness, taskAdjustments.contrast, taskAdjustments.saturation])

  useEffect(() => {
    if (!currentTask || !canvasRef.current) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    const imageUrl = currentTask.resultUrl ?? currentTask.previewUrl
    if (!imageUrl) return
    img.src = imageUrl
    img.onload = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      canvas.width = currentTask.width || img.width
      canvas.height = currentTask.height || img.height
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
  }, [currentTask, brightness, contrast, saturation, isEditModalRendered])

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl)
      }
    }
  }, [downloadUrl])

  const updateAdjustment = (field: keyof Adjustments, value: number) => {
    if (!currentTask) return
    const nextAdjustments: Adjustments = {
      brightness,
      contrast,
      saturation,
      [field]: roundToThousandth(value)
    } as Adjustments

    setBrightness(roundToThousandth(nextAdjustments.brightness))
    setContrast(roundToThousandth(nextAdjustments.contrast))
    setSaturation(roundToThousandth(nextAdjustments.saturation))
    updateTask(currentTask.id, { adjustments: nextAdjustments })
  }

  if (!currentTask) {
    return (
      <div className="preview-card">
        <h2>Предпросмотр</h2>
        <p>Результат появится после окончания обработки.</p>
      </div>
    )
  }

  return (
    <div className="preview-card">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h2>Предпросмотр</h2>
        <button type="button" className="btn btn-primary" onClick={openEditor} title="Открыть редактор изображения">
          Редактор
        </button>
      </div>
      <p>Откройте модальное окно, чтобы посмотреть изображение и изменить параметры.</p>
      {downloadUrl && (
        <a className="btn btn-success" href={downloadUrl} download={`enhanced-${currentTask.fileName}.png`} title="Скачать обработанное изображение">
          Скачать
        </a>
      )}

      {isEditModalRendered && (
        <>
          <div className={`modal-backdrop fade ${isEditModalOpen ? 'show' : ''}`} />
          <div
            className={`modal fade ${isEditModalOpen ? 'show d-flex' : 'd-flex'}`}
            tabIndex={-1}
            role="dialog"
            onClick={closeEditor}
          >
            <div className="modal-dialog modal-dialog-centered modal-xl" role="document" onClick={event => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Редактирование изображения</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeEditor} />
                </div>
                <div className="modal-body">
                  <div className="row gy-4">
                    <div className="col-12 col-md-5">
                      <div className="mb-4">
                        <p className="mb-2">Обработано</p>
                        <canvas
                          ref={canvasRef}
                          className="img-fluid rounded"
                          style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: 'calc(80vh - 180px)', border: '1px solid #dee2e6' }}
                        />
                      </div>
                    </div>
                    <div className="col-12 col-md-7">
                      <div className="mb-3">
                        <label className="form-label">Brightness (delta): {(brightness ?? 0).toFixed(3)}</label>
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
                        <label className="form-label">Contrast (delta): {(contrast ?? 0).toFixed(3)}</label>
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
                        <label className="form-label">Saturation (delta): {(saturation ?? 0).toFixed(3)}</label>
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
