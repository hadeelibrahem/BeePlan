import { useState } from 'react'
import { Modal } from '../../../components/layout/Modal'
import { apiRequest, getAuthHeaders } from '../../../lib/api'

const categories = ['harassment', 'spam', 'inappropriate_content', 'impersonation', 'abuse', 'other'] as const

export function ReportUserModal({ user, accessToken, open, onClose, onSubmitted }: { user: { id: string; fullName: string }; accessToken: string; open: boolean; onClose: () => void; onSubmitted?: () => void }) {
  const [category, setCategory] = useState<(typeof categories)[number]>('harassment')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    if (reason.trim().length < 3 || submitting) return
    setSubmitting(true); setError('')
    try { await apiRequest('/reports', { method: 'POST', headers: getAuthHeaders(accessToken), body: JSON.stringify({ reportedUserId: user.id, category, reason: reason.trim() }) }); setReason(''); onSubmitted?.(); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to submit this report.') }
    finally { setSubmitting(false) }
  }
  return <Modal open={open} title="Report user" description={`Reporting: ${user.fullName}`} onClose={() => !submitting && onClose()} footer={<><button type="button" disabled={submitting} onClick={onClose} className="rounded-lg border border-[var(--bp-border)] px-3 py-2 text-sm">Cancel</button><button type="button" disabled={submitting || reason.trim().length < 3} onClick={() => void submit()} className="rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-semibold text-[var(--bp-accent-text)] disabled:opacity-50">{submitting ? 'Submitting…' : 'Submit report'}</button></>}><label className="mt-4 block text-sm font-semibold">Category<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="mt-2 w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm">{categories.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}</select></label><label className="mt-4 block text-sm font-semibold">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-28 w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] p-3 text-sm" /></label>{error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}</Modal>
}
