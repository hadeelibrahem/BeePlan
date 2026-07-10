import type { PermissionStatus } from '../types/social.types'

// The four user-facing states the spec calls for, plus rejected. Each maps a
// backend status to a human label and a themed color.
const STATUS_META: Record<PermissionStatus, { label: string; className: string }> = {
  pending: {
    label: 'Waiting for friend approval',
    className: 'bg-amber-400/15 text-amber-500 border-amber-400/30',
  },
  active: {
    label: 'Active',
    className: 'bg-emerald-400/15 text-emerald-500 border-emerald-400/30',
  },
  expired: {
    label: 'Permission expired',
    className: 'bg-slate-400/15 text-slate-400 border-slate-400/30',
  },
  revoked: {
    label: 'Permission revoked',
    className: 'bg-rose-400/15 text-rose-500 border-rose-400/30',
  },
  rejected: {
    label: 'Request declined',
    className: 'bg-rose-400/15 text-rose-500 border-rose-400/30',
  },
}

export function PermissionStatusBadge({ status }: { status: PermissionStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${meta.className}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </span>
  )
}
