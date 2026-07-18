import { PRIORITY_BADGE_META, STATUS_BADGE_META, type BadgeMeta } from '../lib/subtaskDisplay'

const TONE_CLASS: Record<BadgeMeta['tone'], string> = {
  neutral: 'bg-[var(--bp-border)] text-[var(--bp-muted)]',
  info: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  success: 'bg-[var(--bp-success)]/15 text-[var(--bp-success)]',
  warning: 'bg-[var(--bp-warning)]/15 text-[var(--bp-warning)]',
  danger: 'bg-[var(--bp-danger)]/15 text-[var(--bp-danger)]',
}

function Badge({ meta }: { meta: BadgeMeta }) {
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>
}

export function TaskStatusBadge({ status }: { status: string }) {
  return <Badge meta={STATUS_BADGE_META[status] ?? { label: status, tone: 'neutral' }} />
}

export function TaskPriorityBadge({ priority }: { priority: string }) {
  return <Badge meta={PRIORITY_BADGE_META[priority] ?? { label: priority, tone: 'neutral' }} />
}
