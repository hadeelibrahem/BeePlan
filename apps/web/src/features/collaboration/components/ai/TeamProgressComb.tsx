import { SectionCard } from '../../../../components/layout/SectionCard'
import { EmptyState } from '../../../../components/layout/EmptyState'
import { useProgressQuery, type ProgressMember } from '../../api/ai-collaboration.api'

type Props = {
  taskId: string
  accessToken: string
}

const MEMBER_COLORS = ['#facc15', '#38bdf8', '#a78bfa', '#fb7185', '#34d399', '#f97316']

const HEX_CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'

function fairnessNote(members: ProgressMember[]): string {
  if (members.length < 2) return "This isn't a straight split — it's what's fair given where each of you stands this week."
  const sorted = [...members].sort((a, b) => b.percent - a.percent)
  const spread = sorted[0].percent - sorted[sorted.length - 1].percent
  if (spread <= 15) return 'Everyone is tracking closely together right now.'
  return `${sorted[0].displayName} is furthest along; the split accounts for where everyone started this week.`
}

/**
 * Per-member progress as a honeycomb-style grid: one hexagon cell per member,
 * filled proportionally to completedCount/totalCount, plus the overall
 * percent and a one-line fairness note.
 */
export function TeamProgressComb({ taskId, accessToken }: Props) {
  const progressQuery = useProgressQuery(taskId, accessToken)

  if (progressQuery.isLoading) {
    return (
      <SectionCard>
        <p className="text-sm text-slate-400">Loading progress…</p>
      </SectionCard>
    )
  }

  const data = progressQuery.data
  if (!data || !data.members.length) {
    return (
      <SectionCard>
        <EmptyState icon={<span>🐝</span>} title="No progress yet" description="Progress will show up here once work gets underway." />
      </SectionCard>
    )
  }

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-wide text-slate-400">Overall progress</h3>
          <span className="text-2xl font-black text-[var(--bp-accent)]">{data.overallPercent}%</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          {data.completedCount} of {data.totalCount} items completed across the team
        </p>
        <div className="mt-2 h-2 rounded-full bg-[var(--bp-border)]">
          <div className="h-2 rounded-full bg-[var(--bp-accent)]" style={{ width: `${data.overallPercent}%` }} />
        </div>
      </SectionCard>

      <SectionCard>
        <h3 className="mb-4 text-[10px] font-black uppercase tracking-wide text-slate-400">Team comb</h3>
        <div className="flex flex-wrap gap-6">
          {data.members.map((member, i) => (
            <MemberHex key={member.userId} member={member} color={MEMBER_COLORS[i % MEMBER_COLORS.length]} />
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-400">{fairnessNote(data.members)}</p>
      </SectionCard>
    </div>
  )
}

function MemberHex({ member, color }: { member: ProgressMember; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2" style={{ width: 84 }}>
      <div
        className="relative h-20 w-[84px] overflow-hidden bg-[var(--bp-border)]"
        style={{ clipPath: HEX_CLIP }}
      >
        <div
          className="absolute inset-x-0 bottom-0 transition-all"
          style={{ height: `${member.percent}%`, backgroundColor: color }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-sm font-black text-[var(--bp-text)]">
          {member.percent}%
        </div>
      </div>
      <p className="max-w-full truncate text-xs font-bold text-[var(--bp-text)]">{member.displayName}</p>
      <p className="text-[11px] text-slate-400">
        {member.completedCount}/{member.totalCount}
      </p>
    </div>
  )
}
