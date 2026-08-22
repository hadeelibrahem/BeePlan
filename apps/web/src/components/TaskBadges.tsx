import { PRIORITY_BADGE_META, STATUS_BADGE_META, type BadgeMeta } from '../lib/subtaskDisplay'
import { useLanguage } from '../i18n/LanguageContext'

const TONE_CLASS: Record<BadgeMeta['tone'], string> = {
  neutral: 'bg-[var(--bp-border)] text-[var(--bp-muted)]',
  info: 'bg-blue-500/15 text-blue-600 dark:text-blue-300',
  success: 'bg-[var(--bp-success)]/15 text-[var(--bp-success)]',
  warning: 'bg-[var(--bp-warning)]/15 text-[var(--bp-warning)]',
  danger: 'bg-[var(--bp-danger)]/15 text-[var(--bp-danger)]',
}

function Badge({ meta }: { meta: BadgeMeta }) {
  const { t } = useLanguage()
  const statusKey: Record<string, string> = { todo: 'todo', 'To Do': 'todo', in_progress: 'inProgress', 'In Progress': 'inProgress', done: 'done', Done: 'done', blocked: 'blocked', Blocked: 'blocked', missed: 'missed', Missed: 'missed' }
  const priorityKey: Record<string, string> = { low: 'low', Low: 'low', medium: 'medium', Medium: 'medium', high: 'high', High: 'high', urgent: 'urgent', Urgent: 'urgent' }
  const key = statusKey[meta.label] ? `taskLabels.status.${statusKey[meta.label]}` : priorityKey[meta.label] ? `taskLabels.priority.${priorityKey[meta.label]}` : undefined
  return <span className={`rounded-md px-2 py-0.5 text-xs font-bold ${TONE_CLASS[meta.tone]}`}>{key ? t(key) : meta.label}</span>
}

export function TaskStatusBadge({ status }: { status: string }) {
  return <Badge meta={STATUS_BADGE_META[status] ?? { label: status, tone: 'neutral' }} />
}

export function TaskPriorityBadge({ priority }: { priority: string }) {
  return <Badge meta={PRIORITY_BADGE_META[priority] ?? { label: priority, tone: 'neutral' }} />
}
