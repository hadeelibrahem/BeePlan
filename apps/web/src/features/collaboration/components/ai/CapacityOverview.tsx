import type { CapacityBand, MemberCapacity } from '../../api/ai-collaboration.api'

type Props = {
  members: MemberCapacity[]
  /** Compact mode drops the "why" sentence — used inside the Overview tab. */
  compact?: boolean
}

const BAND_META: Record<CapacityBand, { label: string; barClass: string; badgeClass: string }> = {
  light: {
    label: 'Light',
    barClass: 'bg-green-400',
    badgeClass: 'bg-green-500/15 text-green-300',
  },
  moderate: {
    label: 'Moderate',
    barClass: 'bg-amber-400',
    badgeClass: 'bg-amber-500/15 text-amber-300',
  },
  busy: {
    label: 'Busy',
    barClass: 'bg-red-400',
    badgeClass: 'bg-red-500/15 text-red-300',
  },
}

/**
 * Capacity bars per member (light/moderate/busy) plus a short AI "why"
 * sentence. Never renders anything beyond band + percent — the backend never
 * sends a teammate's private schedule content, so there is nothing else to
 * accidentally leak here.
 */
export function CapacityOverview({ members, compact = false }: Props) {
  if (!members.length) {
    return <p className="text-xs text-slate-400">No team capacity data yet.</p>
  }

  const lightest = [...members].sort((a, b) => a.loadPercent - b.loadPercent)[0]

  return (
    <div className="space-y-3">
      <div className="space-y-2.5">
        {members.map((member) => {
          const meta = BAND_META[member.band]
          return (
            <div key={member.userId}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-bold text-[var(--bp-text)]">{member.displayName}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${meta.badgeClass}`}
                >
                  {meta.label}
                </span>
              </div>
              <div className="h-2 rounded-full bg-[var(--bp-border)]">
                <div
                  className={`h-2 rounded-full ${meta.barClass}`}
                  style={{ width: `${Math.min(100, Math.max(0, member.loadPercent))}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {!compact && lightest ? (
        <p className="text-xs text-slate-400">
          {lightest.displayName} has the lightest load right now, so more of the split leans their way.
        </p>
      ) : null}
    </div>
  )
}
