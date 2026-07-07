import { useEffect, useMemo, useState } from 'react'
import {
  downloadAttachment,
  getAttachmentPreviewBlob,
  type ApiTaskAttachment,
} from '../lib/tasksApi'

type XlsxModule = typeof import('xlsx')
type WorkBook = import('xlsx').WorkBook

type AttachmentPreviewModalProps = {
  open: boolean
  accessToken: string
  taskId: string
  attachment: ApiTaskAttachment | null
  onClose: () => void
  onError?: (message: string) => void
}

type PreviewKind = 'image' | 'pdf' | 'text' | 'html' | 'audio' | 'video' | 'spreadsheet' | 'office' | 'unsupported'

type SpreadsheetPreview = {
  activeSheet: string
  rows: string[][]
  sheetNames: string[]
  totalRows: number
  totalColumns: number
  truncated: boolean
}

const MAX_SPREADSHEET_ROWS = 250
const MAX_SPREADSHEET_COLUMNS = 50

export default function AttachmentPreviewModal({
  open,
  accessToken,
  taskId,
  attachment,
  onClose,
  onError,
}: AttachmentPreviewModalProps) {
  const [loading, setLoading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [textPreview, setTextPreview] = useState('')
  const [spreadsheetPreview, setSpreadsheetPreview] = useState<SpreadsheetPreview | null>(null)
  const [activeSheetName, setActiveSheetName] = useState('')
  const [error, setError] = useState('')
  const fileName = attachment?.fileName ?? attachment?.name ?? 'Attachment'
  const previewKind = useMemo(() => getPreviewKind(attachment), [attachment])
  const canFetchPreview = ['image', 'pdf', 'text', 'html', 'audio', 'video', 'spreadsheet'].includes(previewKind)

  useEffect(() => {
    if (!open || !attachment || !accessToken || !taskId || !canFetchPreview) {
      setLoading(false)
      setPreviewUrl('')
      setTextPreview('')
      setSpreadsheetPreview(null)
      setActiveSheetName('')
      setError('')
      return
    }

    let cancelled = false
    let objectUrl = ''

    setLoading(true)
    setPreviewUrl('')
    setTextPreview('')
    setSpreadsheetPreview(null)
    setError('')

    getAttachmentPreviewBlob(accessToken, taskId, attachment)
      .then(async ({ blob }) => {
        if (cancelled) return

        if (previewKind === 'spreadsheet') {
          const xlsx = await import('xlsx')
          const workbook = xlsx.read(await blob.arrayBuffer(), { type: 'array' })
          const sheetName = activeSheetName && workbook.Sheets[activeSheetName] ? activeSheetName : workbook.SheetNames[0]
          if (!sheetName) {
            setSpreadsheetPreview({
              activeSheet: '',
              rows: [],
              sheetNames: [],
              totalRows: 0,
              totalColumns: 0,
              truncated: false,
            })
            return
          }

          setActiveSheetName(sheetName)
          setSpreadsheetPreview(toSpreadsheetPreview(xlsx, workbook, sheetName))
          return
        }

        if (previewKind === 'text' || previewKind === 'html') {
          setTextPreview(await blob.text())
          return
        }

        objectUrl = URL.createObjectURL(blob)
        setPreviewUrl(objectUrl)
      })
      .catch((previewError: unknown) => {
        if (!cancelled) {
          setError(previewError instanceof Error ? previewError.message : 'Unable to load attachment preview.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [open, accessToken, taskId, attachment, canFetchPreview, previewKind, activeSheetName])

  if (!open || !attachment) return null

  async function handleDownload() {
    if (!attachment) return

    try {
      await downloadAttachment(accessToken, taskId, attachment)
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : 'Unable to download attachment.'
      setError(message)
      onError?.(message)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-[var(--bp-border)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-black text-[var(--bp-text)]">{fileName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{attachment.fileType ?? attachment.type ?? 'Attached file'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-xs font-black text-[var(--bp-accent-text)]"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close preview"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--bp-border)] text-lg font-black text-[var(--bp-text)]"
            >
              x
            </button>
          </div>
        </header>

        <div className="min-h-[360px] flex-1 overflow-auto bg-[var(--bp-bg)] p-4">
          {loading ? (
            <div className="flex h-[52vh] items-center justify-center text-sm font-bold text-slate-400">
              Loading preview...
            </div>
          ) : error ? (
            <PreviewFallback message={error} onDownload={handleDownload} />
          ) : canFetchPreview ? (
            <PreviewContent
              kind={previewKind}
              previewUrl={previewUrl}
              textPreview={textPreview}
              fileName={fileName}
              spreadsheetPreview={spreadsheetPreview}
              onSelectSheet={setActiveSheetName}
            />
          ) : (
            <PreviewFallback
              message="Preview is not available for this file type. You can download it instead."
              onDownload={handleDownload}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function PreviewContent({
  kind,
  previewUrl,
  textPreview,
  fileName,
  spreadsheetPreview,
  onSelectSheet,
}: {
  kind: PreviewKind
  previewUrl: string
  textPreview: string
  fileName: string
  spreadsheetPreview: SpreadsheetPreview | null
  onSelectSheet: (sheetName: string) => void
}) {
  if (kind === 'image') {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <img src={previewUrl} alt={fileName} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
      </div>
    )
  }

  if (kind === 'pdf') {
    return <iframe title={fileName} src={previewUrl} className="h-[70vh] w-full rounded-lg border border-[var(--bp-border)] bg-white" />
  }

  if (kind === 'video') {
    return <video src={previewUrl} controls className="mx-auto max-h-[70vh] w-full max-w-4xl rounded-lg bg-black" />
  }

  if (kind === 'audio') {
    return (
      <div className="flex min-h-[52vh] items-center justify-center">
        <audio src={previewUrl} controls className="w-full max-w-xl" />
      </div>
    )
  }

  if (kind === 'html') {
    return <iframe title={fileName} srcDoc={textPreview} sandbox="" className="h-[70vh] w-full rounded-lg border border-[var(--bp-border)] bg-white" />
  }

  if (kind === 'spreadsheet') {
    return <SpreadsheetPreviewTable preview={spreadsheetPreview} onSelectSheet={onSelectSheet} />
  }

  return (
    <pre className="min-h-[52vh] whitespace-pre-wrap break-words rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 text-sm leading-6 text-[var(--bp-text)]">
      {textPreview}
    </pre>
  )
}

function SpreadsheetPreviewTable({
  preview,
  onSelectSheet,
}: {
  preview: SpreadsheetPreview | null
  onSelectSheet: (sheetName: string) => void
}) {
  if (!preview) {
    return (
      <div className="flex h-[52vh] items-center justify-center text-sm font-bold text-slate-400">
        Loading spreadsheet...
      </div>
    )
  }

  if (!preview.rows.length) {
    return (
      <div className="flex h-[52vh] items-center justify-center rounded-lg border border-dashed border-[var(--bp-border)] text-sm font-semibold text-slate-400">
        This sheet is empty.
      </div>
    )
  }

  const headers = preview.rows[0] ?? []
  const bodyRows = preview.rows.slice(1)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase text-slate-500">Sheet</p>
          <p className="truncate text-sm font-bold text-[var(--bp-text)]">{preview.activeSheet}</p>
        </div>
        {preview.sheetNames.length > 1 ? (
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1">
            {preview.sheetNames.map((sheetName) => (
              <button
                key={sheetName}
                type="button"
                onClick={() => onSelectSheet(sheetName)}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-bold ${
                  sheetName === preview.activeSheet
                    ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]'
                    : 'text-slate-400 hover:bg-[var(--bp-border)]/40 hover:text-[var(--bp-text)]'
                }`}
              >
                {sheetName}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {preview.truncated ? (
        <p className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-xs font-semibold text-slate-400">
          Showing the first {MAX_SPREADSHEET_ROWS} rows and {MAX_SPREADSHEET_COLUMNS} columns of {preview.totalRows} rows and {preview.totalColumns} columns.
        </p>
      ) : null}

      <div className="max-h-[64vh] overflow-auto rounded-lg border border-[var(--bp-border)] bg-[var(--bp-surface)]">
        <table className="min-w-full border-collapse text-left text-xs text-[var(--bp-text)]">
          <thead className="sticky top-0 z-10 bg-[var(--bp-bg)]">
            <tr>
              <th className="border-b border-r border-[var(--bp-border)] px-2 py-2 text-slate-500">#</th>
              {headers.map((header, index) => (
                <th key={`${index}:${header}`} className="min-w-28 border-b border-r border-[var(--bp-border)] px-2 py-2 font-black text-slate-300">
                  {header || columnLabel(index)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-[var(--bp-bg)]/40">
                <td className="border-r border-[var(--bp-border)] px-2 py-1.5 font-bold text-slate-500">{rowIndex + 1}</td>
                {headers.map((_, columnIndex) => (
                  <td key={columnIndex} className="max-w-80 whitespace-pre-wrap break-words border-r border-[var(--bp-border)] px-2 py-1.5">
                    {row[columnIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function PreviewFallback({
  message,
  onDownload,
}: {
  message: string
  onDownload: () => Promise<void>
}) {
  return (
    <div className="flex min-h-[52vh] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--bp-border)] px-4 text-center">
      <p className="max-w-md text-sm font-semibold text-slate-300">{message}</p>
      <button
        type="button"
        onClick={() => void onDownload()}
        className="mt-4 rounded-lg bg-[var(--bp-accent)] px-4 py-2 text-sm font-black text-[var(--bp-accent-text)]"
      >
        Download
      </button>
    </div>
  )
}

function getPreviewKind(attachment: ApiTaskAttachment | null): PreviewKind {
  const normalized = `${attachment?.fileType ?? attachment?.type ?? ''} ${attachment?.fileName ?? attachment?.name ?? ''}`.toLowerCase()

  if (normalized.includes('pdf') || normalized.match(/\.pdf$/)) return 'pdf'
  if (normalized.startsWith('image/') || normalized.match(/\.(png|jpe?g|gif|webp|svg)$/)) return 'image'
  if (normalized.startsWith('video/') || normalized.match(/\.(mp4|webm|ogv|ogg)$/)) return 'video'
  if (normalized.startsWith('audio/') || normalized.match(/\.(mp3|m4a|oga|ogg|wav)$/)) return 'audio'
  if (normalized.includes('text/html') || normalized.match(/\.html?$/)) return 'html'
  if (normalized.includes('spreadsheet') || normalized.includes('excel') || normalized.match(/\.(xlsx?|csv)$/)) return 'spreadsheet'
  if (normalized.startsWith('text/') || normalized.includes('json') || normalized.match(/\.(txt|json|log)$/)) return 'text'
  if (normalized.match(/\.(docx?|xlsx?|pptx?)$/) || normalized.includes('word') || normalized.includes('excel') || normalized.includes('powerpoint')) {
    return 'office'
  }

  return 'unsupported'
}

function toSpreadsheetPreview(xlsx: XlsxModule, workbook: WorkBook, sheetName: string): SpreadsheetPreview {
  const worksheet = workbook.Sheets[sheetName]
  const allRows = xlsx.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    blankrows: false,
    defval: '',
    raw: false,
  })
  const totalColumns = allRows.reduce((largest, row) => Math.max(largest, row.length), 0)
  const limitedRows = allRows
    .slice(0, MAX_SPREADSHEET_ROWS + 1)
    .map((row) => row.slice(0, MAX_SPREADSHEET_COLUMNS).map((cell) => String(cell ?? '')))
  const normalizedRows = normalizeSpreadsheetRows(limitedRows)

  return {
    activeSheet: sheetName,
    rows: normalizedRows,
    sheetNames: workbook.SheetNames,
    totalRows: allRows.length,
    totalColumns,
    truncated: allRows.length > MAX_SPREADSHEET_ROWS || totalColumns > MAX_SPREADSHEET_COLUMNS,
  }
}

function normalizeSpreadsheetRows(rows: string[][]) {
  const columnCount = rows.reduce((largest, row) => Math.max(largest, row.length), 0)
  if (!columnCount) return []

  return rows.map((row) => {
    const nextRow = [...row]
    while (nextRow.length < columnCount) nextRow.push('')
    return nextRow
  })
}

function columnLabel(index: number) {
  let label = ''
  let value = index + 1

  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }

  return label
}
