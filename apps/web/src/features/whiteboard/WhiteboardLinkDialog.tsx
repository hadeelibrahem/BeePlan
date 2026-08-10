import { useEffect, useState } from 'react'
import { normalizeWhiteboardUrl } from './whiteboardLinkUtils'

type Props = { open: boolean; initialUrl?: string; initialTitle?: string; onClose: () => void; onSave: (url: string, title: string) => void }

export function WhiteboardLinkDialog({ open, initialUrl = '', initialTitle = '', onClose, onSave }: Props) {
  const [url, setUrl] = useState(initialUrl)
  const [title, setTitle] = useState(initialTitle)
  const [error, setError] = useState('')
  useEffect(() => { if (open) { setUrl(initialUrl); setTitle(initialTitle); setError('') } }, [open, initialTitle, initialUrl])
  if (!open) return null
  const submit = () => {
    const normalized = normalizeWhiteboardUrl(url)
    if (!normalized) { setError('Enter a valid HTTP or HTTPS URL.'); return }
    onSave(normalized, title.trim())
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><form role="dialog" aria-modal="true" aria-label="Add link" onSubmit={(event) => { event.preventDefault(); submit() }} className="w-full max-w-md rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 shadow-2xl"><h2 className="text-lg font-bold text-[var(--bp-text)]">{initialUrl ? 'Edit Link' : 'Add Link'}</h2><label className="mt-4 block text-sm font-semibold text-[var(--bp-text)]">URL<input autoFocus value={url} onChange={(event) => setUrl(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--bp-border)] bg-transparent px-3 py-2 font-normal outline-none focus:border-[var(--bp-accent)]" placeholder="https://example.com" /></label><label className="mt-3 block text-sm font-semibold text-[var(--bp-text)]">Display title <span className="font-normal text-[var(--bp-muted)]">(optional)</span><input value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-[var(--bp-border)] bg-transparent px-3 py-2 font-normal outline-none focus:border-[var(--bp-accent)]" /></label>{error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm font-semibold">Cancel</button><button type="submit" className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-semibold text-[var(--bp-accent-text)]">{initialUrl ? 'Save' : 'Add'}</button></div></form></div>
}
