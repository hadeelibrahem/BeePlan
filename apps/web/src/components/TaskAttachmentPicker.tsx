import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'

const ACCEPTED_EXTENSIONS = '.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.log,.html,.htm,.mp3,.m4a,.ogg,.oga,.wav,.mp4,.webm,.ogv'
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
  'video/ogg',
  'video/webm',
  'application/json',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/html',
])

type TaskAttachmentPickerProps = {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
  onValidationError?: (message: string) => void
}

export default function TaskAttachmentPicker({
  files,
  onChange,
  disabled,
  onValidationError,
}: TaskAttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileKeySet = useMemo(
    () => new Set(files.map((file) => `${file.name}:${file.size}:${file.lastModified}`)),
    [files],
  )

  function validateAndAppend(nextFiles: File[]) {
    const accepted: File[] = []
    for (const file of nextFiles) {
      const validationError = getValidationError(file)
      if (validationError) {
        onValidationError?.(validationError)
        continue
      }

      const key = `${file.name}:${file.size}:${file.lastModified}`
      if (fileKeySet.has(key) || accepted.some((item) => `${item.name}:${item.size}:${item.lastModified}` === key)) {
        continue
      }
      accepted.push(file)
    }

    if (accepted.length) {
      onChange([...files, ...accepted])
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? [])
    event.target.value = ''
    validateAndAppend(nextFiles)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setIsDragging(false)
    if (disabled) return
    validateAndAppend(Array.from(event.dataTransfer.files ?? []))
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        if (!disabled) setIsDragging(true)
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`cursor-pointer rounded-xl border border-dashed bg-[var(--bp-bg)] p-4 transition ${
        isDragging ? 'border-[var(--bp-accent)]/80' : 'border-[var(--bp-border)]'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:border-[var(--bp-accent)]/60'}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        onChange={handleInputChange}
        disabled={disabled}
      />
      <div className="text-center">
        <div className="text-sm font-black text-[var(--bp-accent)]">UPLOAD</div>
        <p className="mt-2 text-sm text-slate-300">Drag & drop files here, or browse from your device</p>
        <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="mt-3 rounded-lg border border-[var(--bp-accent)]/60 px-3 py-1.5 text-sm font-bold text-[var(--bp-accent)] hover:bg-[var(--bp-accent)]/10 disabled:cursor-not-allowed disabled:opacity-60">
          Browse files
        </button>
        <p className="mt-1 text-xs text-slate-500">Supports images, PDF, Word, Excel, PowerPoint, and text files</p>
      </div>

      {files.length ? (
        <div className="mt-4 space-y-2">
          {files.map((file) => (
            <AttachmentDraftRow
              key={`${file.name}:${file.size}:${file.lastModified}`}
              file={file}
              onRemove={() => onChange(files.filter((item) => item !== file))}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AttachmentDraftRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[var(--bp-surface)] p-3 text-left">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[9px] font-black text-white ${attachmentColor(file.type, file.name)}`}>
        {attachmentLabel(file.type, file.name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--bp-text)]">{file.name}</p>
        <p className="text-xs text-slate-500">
          {formatFileSize(file.size)}{file.type ? ` • ${file.type}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove()
        }}
        className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-300"
      >
        Remove
      </button>
    </div>
  )
}

function getValidationError(file: File) {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `${file.name} is too large. Maximum size is 10MB.`
  }

  if (
    file.type &&
    !ALLOWED_MIME_TYPES.has(file.type) &&
    !file.type.startsWith('text/') &&
    !file.type.startsWith('audio/') &&
    !file.type.startsWith('video/')
  ) {
    return `${file.name} is not a supported file type.`
  }

  if (!file.type && !isAllowedByExtension(file.name)) {
    return `${file.name} is not a supported file type.`
  }

  return ''
}

function isAllowedByExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'svg',
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'csv',
    'json',
    'log',
    'html',
    'htm',
    'mp3',
    'm4a',
    'ogg',
    'oga',
    'wav',
    'mp4',
    'webm',
    'ogv',
  ].includes(extension)
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentLabel(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase()
  if (normalized.includes('pdf')) return 'PDF'
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'IMG'
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'DOC'
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'XLS'
  if (normalized.match(/\.(pptx?)$/) || normalized.includes('powerpoint')) return 'SLD'
  return 'FILE'
}

function attachmentColor(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLowerCase()
  if (normalized.includes('pdf')) return 'bg-red-500'
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'bg-green-500'
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'bg-blue-500'
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'bg-indigo-500'
  return 'bg-orange-500'
}
