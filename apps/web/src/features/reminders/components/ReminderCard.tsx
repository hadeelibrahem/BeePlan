import { useState } from 'react'
import { Check, Clock3, Copy, FileText, ListChecks, MapPin, MoreHorizontal, Pencil, Pause, Trash2, UserRound } from 'lucide-react'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { Reminder } from '../types/reminders.types'
import { getLocationLabel } from '../utils/locationLabel'

const TYPE_META = {
  time: { icon: Clock3, color: 'text-[var(--bp-accent-ink)]', bg: 'bg-[var(--bp-accent)]/15', label: 'Time' },
  location: { icon: MapPin, color: 'text-emerald-300', bg: 'bg-emerald-300/15', label: 'Location' },
  context: { icon: FileText, color: 'text-violet-300', bg: 'bg-violet-300/15', label: 'Context' },
  checklist: { icon: ListChecks, color: 'text-rose-300', bg: 'bg-rose-300/15', label: 'Checklist' },
  person: { icon: UserRound, color: 'text-sky-300', bg: 'bg-sky-300/15', label: 'People' },
} as const

const STATUS_BADGE: Record<Reminder['status'], string> = {
  active: 'border-emerald-400/35 bg-emerald-400/12 text-emerald-300',
  done: 'border-[var(--bp-border)] bg-[var(--bp-border)]/60 text-[var(--bp-muted)]',
  missed: 'border-red-400/35 bg-red-400/12 text-red-300',
  snoozed: 'border-[var(--bp-accent)]/35 bg-[var(--bp-accent)]/12 text-[var(--bp-accent-ink)]',
}
const PRIORITY_BADGE: Record<Reminder['priority'], string> = {
  low: 'border-slate-400/30 bg-slate-400/10 text-slate-300',
  medium: 'border-[var(--bp-accent)]/35 bg-[var(--bp-accent)]/10 text-[var(--bp-accent-ink)]',
  high: 'border-orange-400/35 bg-orange-400/10 text-orange-300',
  urgent: 'border-rose-400/35 bg-rose-400/10 text-rose-300',
}

type Props = { reminder: Reminder; onPress?: () => void; onToggle?: () => void; onEdit?: () => void; onDuplicate?: () => void; onDelete?: () => void }

export function ReminderCard({ reminder, onPress, onToggle, onEdit, onDuplicate, onDelete }: Props) {
  const { t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)
  const meta = TYPE_META[reminder.type]
  const Icon = meta.icon
  const completed = reminder.status === 'done'
  const subtitle = getSubtitle(reminder)

  return (
    <article className={`group relative rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2.5 transition-colors hover:border-[var(--bp-accent)]/45 ${completed ? 'opacity-70' : ''}`}>
      <div className="flex min-w-0 items-center gap-3">
        {onToggle && <button type="button" onClick={onToggle} aria-label={completed ? t('actions.markActive') : t('actions.markComplete')} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${completed ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)] text-[var(--bp-brand-dark)]' : 'border-[var(--bp-border)] hover:border-[var(--bp-accent)]'}`}>{completed && <Check className="h-3 w-3" />}</button>}
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`} title={meta.label}><Icon className="h-4 w-4" /></span>
        <button type="button" onClick={onPress} className="min-w-0 flex-1 text-start">
          <span className="flex min-w-0 items-center gap-2">
            <span className={`truncate text-sm font-semibold text-[var(--bp-text)] ${completed ? 'line-through' : ''}`}>{reminder.title}</span>
            <span className="hidden shrink-0 text-[10px] text-[var(--bp-subtle)] sm:inline">{meta.label}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--bp-muted)]">
            {subtitle && <span className="truncate">{subtitle}</span>}
            {reminder.type === 'time' && reminder.remindAt && <span className="shrink-0 text-[var(--bp-subtle)]">{formatRelativeDate(reminder.remindAt)}</span>}
          </span>
        </button>
        <span className={`hidden rounded-md border px-2 py-1 text-[10px] font-semibold capitalize sm:inline-flex ${STATUS_BADGE[reminder.status]}`}>{reminder.status === 'done' ? 'Completed' : reminder.status === 'snoozed' ? 'Paused' : reminder.status === 'missed' ? 'Expired' : 'Active'}</span>
        <span className={`hidden rounded-md border px-2 py-1 text-[10px] font-semibold capitalize md:inline-flex ${PRIORITY_BADGE[reminder.priority]}`}>{reminder.priority === 'urgent' ? 'High' : reminder.priority}</span>
        <div className="relative shrink-0">
          <button type="button" aria-label={`Actions for ${reminder.title}`} onClick={() => setMenuOpen((open) => !open)} className="rounded-lg p-1.5 text-[var(--bp-muted)] opacity-60 hover:bg-[var(--bp-border)] hover:text-[var(--bp-text)] group-hover:opacity-100"><MoreHorizontal className="h-4 w-4" /></button>
          {menuOpen && <div className="absolute end-0 top-9 z-20 w-40 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1.5 shadow-2xl">
            <MenuItem icon={<Pencil />} label="Edit" onClick={() => { setMenuOpen(false); (onEdit ?? onPress)?.() }} />
            <MenuItem icon={<Copy />} label="Duplicate" onClick={() => { setMenuOpen(false); onDuplicate?.() }} />
            <MenuItem icon={completed ? <Pause /> : <Check />} label={completed ? 'Pause' : 'Complete'} onClick={() => { setMenuOpen(false); onToggle?.() }} />
            <MenuItem icon={<Trash2 />} label="Delete" danger onClick={() => { setMenuOpen(false); onDelete?.() }} />
          </div>}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 sm:hidden"><span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[reminder.status]}`}>{reminder.status === 'done' ? 'Completed' : reminder.status === 'snoozed' ? 'Paused' : reminder.status === 'missed' ? 'Expired' : 'Active'}</span><span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold capitalize ${PRIORITY_BADGE[reminder.priority]}`}>{reminder.priority === 'urgent' ? 'High' : reminder.priority}</span></div>
    </article>
  )
}

function MenuItem({ icon, label, onClick, danger = false }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) { return <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold hover:bg-[var(--bp-border)] ${danger ? 'text-rose-300' : 'text-[var(--bp-text)]'}`}>{<span className="h-3.5 w-3.5">{icon}</span>}{label}</button> }

function getSubtitle(reminder: Reminder) { if (reminder.type === 'location' && reminder.location) return `${reminder.location.trigger === 'arrive' ? 'When arriving at' : 'When leaving'} ${getLocationLabel(reminder.location)}`; if (reminder.type === 'checklist' && reminder.checklistItems) return `${reminder.checklistItems.filter((item) => item.isDone).length}/${reminder.checklistItems.length} items completed`; if (reminder.type === 'context' && reminder.context) return reminder.context.condition; if (reminder.type === 'person' && reminder.person) return `When ${reminder.person.targetFriendName ?? reminder.person.targetName ?? 'your friend'} is nearby`; return '' }
function formatRelativeDate(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const now = new Date(); const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const days = Math.round((day.getTime() - today.getTime()) / 86400000); const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); if (days === 0) return `Today at ${time}`; if (days === 1) return `Tomorrow at ${time}`; if (days === -1) return `Yesterday at ${time}`; if (days > 1 && days < 7) return `In ${days} days`; return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }
