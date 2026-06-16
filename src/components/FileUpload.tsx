import { useRef, useState } from 'react'
import { useEnhancement } from '../context/EnhancementContext'

const acceptedTypes = ['image/jpeg', 'image/png', 'image/bmp', 'image/heic']
const maxFilesPerBatch = 10

export default function FileUpload() {
  const { submitTask } = useEnhancement()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const handleFileList = async (files: FileList | File[]) => {
    setError(null)
    const fileArray = Array.from(files).slice(0, maxFilesPerBatch)
    const invalidFile = fileArray.find(
      file => !acceptedTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.heic')
    )

    if (invalidFile) {
      setError('Поддерживаются только JPG, PNG, BMP и HEIC файлы.')
      return
    }

    if (fileArray.length > maxFilesPerBatch) {
      setError(`Максимум ${maxFilesPerBatch} файлов за раз. Обработано первые ${maxFilesPerBatch}.`)
    }

    try {
      setIsLoading(true)
      await Promise.all(fileArray.map(file => submitTask(file)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки файлов')
    } finally {
      setIsLoading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) {
      return
    }
    await handleFileList(event.target.files)
  }

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragActive(false)
    if (!event.dataTransfer.files) {
      return
    }
    await handleFileList(event.dataTransfer.files)
  }

  return (
    <div
      className={`upload-dropzone position-relative rounded-4 border p-4 text-center ${isDragActive ? 'drag-active' : ''}`}
      onDragOver={event => {
        event.preventDefault()
        setIsDragActive(true)
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={handleDrop}
    >
      <h2 className="h4 mb-2">📸 Загрузить изображение</h2>
      <p className="text-secondary mb-1">Перетащите файлы сюда или выберите их</p>
      <p className="small mb-4" style={{ color: 'var(--muted)' }}>JPG, PNG, BMP, HEIC до 15MP</p>

      <label className="btn btn-outline-primary btn-sm">
        Выбрать файлы
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/bmp,image/heic"
          multiple
          onChange={handleChange}
          className="visually-hidden"
        />
      </label>

      {isLoading && <div className="alert alert-info mt-4 py-2 mb-0">Подготовка изображений...</div>}
      {error && <div className="alert alert-danger mt-4 py-2 mb-0">{error}</div>}
    </div>
  )
}
