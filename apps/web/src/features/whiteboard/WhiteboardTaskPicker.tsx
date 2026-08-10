import { useMemo, useState } from 'react'
import type { ApiTask } from '../../lib/tasksApi'
import { filterWhiteboardTasks, getTaskSubtaskProgress } from './whiteboardTaskUtils'
import { WhiteboardFloatingPanel } from './WhiteboardFloatingPanel'

type Props = { open: boolean; tasks: ApiTask[]; loading: boolean; error: string | null; onClose: () => void; onRetry: () => void; onAdd: (task: ApiTask) => void; notice: string | null }

export function WhiteboardTaskPicker({ open, tasks, loading, error, onClose, onRetry, onAdd, notice }: Props) {
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => filterWhiteboardTasks(tasks, search), [tasks, search])
  if (!open) return null
  return (
    <WhiteboardFloatingPanel id="task-picker" title="Add Task to Whiteboard" onClose={onClose} closeLabel="Close task picker" initialPosition={({ height }) => ({ x: 16, y: Math.max(16, Math.min(120, height - 520)) })} className="w-[calc(100%-1rem)] sm:w-96">
      <aside className="flex max-h-[calc(100vh-7rem)] w-full flex-col p-4" aria-label="Task picker">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" className="rounded-lg border border-[var(--bp-border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--bp-accent)]" />
        {notice && <p className="mt-3 rounded-lg bg-[var(--bp-accent-soft)] p-2 text-xs text-[var(--bp-accent)]">{notice}</p>}
        {loading && <p className="mt-6 text-sm text-[var(--bp-muted)]">Loading tasks...</p>}
        {error && <div className="mt-6 text-sm"><p className="text-[var(--bp-muted)]">Unable to load tasks.</p><button type="button" onClick={onRetry} className="mt-2 font-semibold text-[var(--bp-accent)]">Retry</button></div>}
        {!loading && !error && <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto">{filtered.map((task) => { const progress = getTaskSubtaskProgress(task); return <div key={task.id} className="rounded-xl border border-[var(--bp-border)] p-3"><div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold">{task.title}</h3><span className="text-[10px] font-semibold capitalize text-[var(--bp-accent)]">{task.priority}</span></div><p className="mt-1 text-[11px] text-[var(--bp-muted)]">{task.status.replace('_', ' ')} · Due {task.dueDate || 'No date'} · Subtasks {progress.completed}/{progress.total}</p><button type="button" onClick={() => onAdd(task)} className="mt-3 w-full rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-xs font-semibold text-[var(--bp-accent-text)]">Add to board</button></div> })}{filtered.length === 0 && <p className="py-6 text-center text-sm text-[var(--bp-muted)]">No open tasks found.</p>}</div>}
      </aside>
    </WhiteboardFloatingPanel>
  )
}
