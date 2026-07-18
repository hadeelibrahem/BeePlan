import { useEffect, useMemo, useState } from 'react'
import { DangerButton, PrimaryButton, SecondaryButton } from './layout'
import { TaskStatusBadge } from './TaskBadges'

export type DependencyStatus = 'To Do' | 'In Progress' | 'Done' | 'Missed' | 'Blocked'
export type DependencyPriority = 'Low' | 'Medium' | 'High'

export type DependencyTask = {
  id: string
  title: string
  category: string
  status: DependencyStatus
  dueDate: string
  priority: DependencyPriority
}

type DependencyModalMode = 'add' | 'edit' | 'remove'

type TaskDependenciesWorkflowModalProps = {
  open: boolean
  mode: DependencyModalMode
  currentTaskId: string
  availableTasks: DependencyTask[]
  dependencies: DependencyTask[]
  dependency?: DependencyTask | null
  onClose: () => void
  onAdd: (tasks: DependencyTask[]) => void
  onSaveReplacement: (oldDependencyId: string, replacement: DependencyTask) => void
  onRemove: (dependencyId: string) => void
}

export function TaskDependenciesWorkflowModal({
  open,
  mode,
  currentTaskId,
  availableTasks,
  dependencies,
  dependency,
  onClose,
  onAdd,
  onSaveReplacement,
  onRemove,
}: TaskDependenciesWorkflowModalProps) {
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [replacementId, setReplacementId] = useState('')

  useEffect(() => {
    if (!open) return

    setSearch('')
    setSelectedIds([])
    setReplacementId('')
  }, [open, mode, dependency?.id])

  const existingDependencyIds = useMemo(() => new Set(dependencies.map((item) => item.id)), [dependencies])

  const addOptions = useMemo(() => {
    const query = search.trim().toLowerCase()

    return availableTasks.filter((task) => {
      if (task.id === currentTaskId) return false
      if (existingDependencyIds.has(task.id)) return false
      if (!query) return true

      return [task.title, task.category, task.status, task.priority].some((value) =>
        value.toLowerCase().includes(query),
      )
    })
  }, [availableTasks, currentTaskId, existingDependencyIds, search])

  const replacementOptions = useMemo(() => {
    const query = search.trim().toLowerCase()

    return availableTasks.filter((task) => {
      if (task.id === currentTaskId) return false
      if (task.id === dependency?.id) return false
      if (existingDependencyIds.has(task.id)) return false
      if (!query) return true

      return [task.title, task.category, task.status, task.priority].some((value) =>
        value.toLowerCase().includes(query),
      )
    })
  }, [availableTasks, currentTaskId, dependency?.id, existingDependencyIds, search])

  if (!open) return null

  const selectedTasks = availableTasks.filter((task) => selectedIds.includes(task.id))
  const replacementTask = replacementOptions.find((task) => task.id === replacementId)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 px-4 backdrop-blur-[2px] md:items-center md:py-8">
      <div className="w-full max-w-2xl animate-[statusSheetIn_180ms_ease-out] rounded-t-[28px] border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-5 shadow-2xl md:rounded-[28px] md:p-6">
        <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-[var(--bp-border)]" />

        {mode === 'add' ? (
          <>
            <ModalHeader
              title="Add Dependency"
              subtitle="Select tasks that must be completed before this task can start."
            />
            <SearchBox value={search} onChange={setSearch} />

            <div className="mt-4 max-h-[46vh] space-y-3 overflow-y-auto pe-1">
              {addOptions.length ? (
                addOptions.map((task) => (
                  <DependencyOption
                    key={task.id}
                    task={task}
                    selected={selectedIds.includes(task.id)}
                    multiple
                    onClick={() =>
                      setSelectedIds((current) =>
                        current.includes(task.id)
                          ? current.filter((id) => id !== task.id)
                          : [...current, task.id],
                      )
                    }
                  />
                ))
              ) : (
                <EmptyDependencyState message="No available tasks match your search." />
              )}
            </div>

            <footer className="mt-5 grid grid-cols-2 gap-3">
              <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={!selectedTasks.length}
                onClick={() => {
                  onAdd(selectedTasks)
                  onClose()
                }}
              >
                Add Dependency
              </PrimaryButton>
            </footer>
          </>
        ) : null}

        {mode === 'edit' && dependency ? (
          <>
            <ModalHeader title="Edit Dependency" subtitle="Review this dependency or replace it with another task." />

            <section className="rounded-[20px] border border-[var(--bp-border)] bg-[var(--bp-bg)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-black text-[var(--bp-text)]">{dependency.title}</h3>
                  <p className="mt-1 text-sm text-[var(--bp-muted)]">{dependency.category}</p>
                </div>
                <TaskStatusBadge status={dependency.status} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <InfoPill label="Due Date" value={dependency.dueDate} />
                <InfoPill label="Priority" value={dependency.priority} />
              </div>
            </section>

            <div className="mt-5">
              <p className="mb-3 text-sm font-black text-[var(--bp-text)]">Replace dependency with another task</p>
              <SearchBox value={search} onChange={setSearch} />
              <div className="mt-4 max-h-[34vh] space-y-3 overflow-y-auto pe-1">
                {replacementOptions.length ? (
                  replacementOptions.map((task) => (
                    <DependencyOption
                      key={task.id}
                      task={task}
                      selected={replacementId === task.id}
                      onClick={() => setReplacementId(task.id)}
                    />
                  ))
                ) : (
                  <EmptyDependencyState message="No replacement task is available." />
                )}
              </div>
            </div>

            <footer className="mt-5 grid grid-cols-2 gap-3">
              <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
              <PrimaryButton
                disabled={!replacementTask}
                onClick={() => {
                  if (!replacementTask) return
                  onSaveReplacement(dependency.id, replacementTask)
                  onClose()
                }}
              >
                Save Changes
              </PrimaryButton>
            </footer>
          </>
        ) : null}

        {mode === 'remove' && dependency ? (
          <>
            <ModalHeader
              title="Remove Dependency?"
              subtitle="This task will no longer depend on the selected task."
            />

            <section className="rounded-[20px] border border-red-500/30 bg-red-500/10 p-4">
              <p className="font-black text-[var(--bp-text)]">{dependency.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--bp-muted)]">
                Removing this dependency will keep both tasks, but this task will no longer wait for it.
              </p>
            </section>

            <footer className="mt-5 grid grid-cols-2 gap-3">
              <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
              <DangerButton
                onClick={() => {
                  onRemove(dependency.id)
                  onClose()
                }}
              >
                Remove Dependency
              </DangerButton>
            </footer>
          </>
        ) : null}
      </div>
    </div>
  )
}

function ModalHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-5 text-center">
      <h2 className="text-2xl font-black text-[var(--bp-text)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--bp-muted)]">{subtitle}</p>
    </header>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="sr-only">Search tasks</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search tasks..."
        className="w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
      />
    </label>
  )
}

function DependencyOption({
  task,
  selected,
  multiple,
  onClick,
}: {
  task: DependencyTask
  selected: boolean
  multiple?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid w-full gap-4 rounded-[20px] border p-4 text-start transition duration-200 active:scale-[0.99] sm:grid-cols-[1fr_auto] ${
        selected
          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] shadow-lg shadow-black/20'
          : 'border-[var(--bp-border)] bg-[var(--bp-bg)] hover:border-[var(--bp-accent)]/50'
      }`}
      aria-pressed={selected}
    >
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <span
            className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[10px] font-black ${
              selected
                ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)] text-[var(--bp-accent-text)]'
                : 'border-[var(--bp-border)] text-transparent'
            }`}
          >
            {multiple ? 'OK' : ''}
          </span>
          <div className="min-w-0">
            <p className="font-black text-[var(--bp-text)]">{task.title}</p>
            <p className="mt-1 text-sm text-[var(--bp-muted)]">{task.category}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <TaskStatusBadge status={task.status} />
        <span className="rounded-full bg-[var(--bp-border)] px-3 py-2 text-xs font-black text-[var(--bp-text)]">
          {task.priority}
        </span>
        <span className="rounded-full bg-[var(--bp-surface)] px-3 py-2 text-xs font-bold text-[var(--bp-muted)]">
          {task.dueDate}
        </span>
      </div>
    </button>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3">
      <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</p>
      <p className="mt-1 font-bold text-[var(--bp-text)]">{value}</p>
    </div>
  )
}

function EmptyDependencyState({ message }: { message: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] p-6 text-center text-sm font-semibold text-[var(--bp-muted)]">
      {message}
    </div>
  )
}
