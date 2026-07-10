import { useState } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import TaskAttachmentPicker from '../components/TaskAttachmentPicker'
import {
  TaskRecurrenceModal,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceModal'
import {
  TaskDependenciesWorkflowModal,
  type DependencyTask,
} from '../components/TaskDependenciesWorkflowModal'
import SubtaskFormModal from '../components/SubtaskFormModal'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import {
  recurrenceToApi,
  uploadAttachment,
  toApiPriority,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  type ApiTask,
  type SubtaskPayload,
  type TaskPayload,
} from '../lib/tasksApi'

type CreateTaskScreenProps = SidebarNavHandlers & {
  tasks?: ApiTask[]
  accessToken?: string
  onCancel?: () => void
  onSave?: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onCreated?: (task: ApiTask) => void
  onSignOut?: () => void
}

export default function CreateTaskScreen({
  tasks = [],
  accessToken,
  onCancel,
  onSave,
  onCreated,
  onSignOut,
  ...nav
}: CreateTaskScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [priority, setPriority] = useState('Medium')
  const [status, setStatus] = useState('To Do')
  const [category, setCategory] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [reminderBeforeMinutes, setReminderBeforeMinutes] = useState(30)
  const [subtasks, setSubtasks] = useState<(SubtaskPayload & { title: string })[]>([])
  const [isSubtaskModalOpen, setIsSubtaskModalOpen] = useState(false)
  const [dependencyModalOpen, setDependencyModalOpen] = useState(false)
  const [dependencies, setDependencies] = useState<DependencyTask[]>([])
  const [attachments, setAttachments] = useState<File[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAttachments, setUploadingAttachments] = useState(false)
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(null)
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false)
  const recurrenceSummary = createRecurrenceSummary(recurrence)
  const availableDependencies = tasks.map(toDependencyTask)

  async function handleSave() {
    if (!title.trim()) {
      setError('Task title is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const createdTask = await onSave?.({
        title: title.trim(),
        description,
        notes,
        priority: toApiPriority(priority),
        status: toApiStatus(status),
        category,
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : undefined,
        dueTime,
        reminderEnabled: true,
        reminderBeforeMinutes,
        recurrence: recurrenceToApi(recurrence),
        subtasks,
      })

      if (!createdTask) return

      if (attachments.length && accessToken) {
        setUploadingAttachments(true)
        for (const file of attachments) {
          await uploadAttachment(accessToken, createdTask.id, file)
        }
      }

      onCreated?.(createdTask)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save task.')
    } finally {
      setUploadingAttachments(false)
      setSaving(false)
    }
  }

  return (
    <>
      <AppLayout
        active="tasks"
        {...nav}
        onNavigateTasks={onCancel}
        panelTitle="Keep going!"
        panelCaption="You're doing great today."
        panelPercent={0}
      >
          <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
            <button type="button" onClick={onCancel} className="hover:text-[var(--bp-text)]">
              Back
            </button>
            <span>Tasks</span>
            <span>/</span>
            <span className="text-[var(--bp-text)]">Create New Task</span>
          </div>

          <PageHeader
            title="Create New Task"
            subtitle="Organize your work and stay productive."
            toolbar={
              <TopActionBar
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search tasks..."
                themeMode={mode}
                onToggleTheme={toggleTheme}
                languageLabel={t('common.languageToggle')}
                onToggleLanguage={toggleLanguage}
                onProfileClick={onSignOut}
              />
            }
          />

          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4 shadow-2xl">
              <SectionTitle icon="INFO" title="Task Information" />

              <FieldLabel label="Task Title" required />
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="mb-4 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
                placeholder="Enter task title..."
              />

              <FieldLabel label="Description" />
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mb-1.5 min-h-28 w-full resize-none rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
                placeholder="Describe your task..."
              />
              <p className="mb-4 text-end text-xs text-slate-500">{description.length}/500</p>

              <div className="mb-4 border-t border-[var(--bp-border)] pt-4">
                <FieldLabel label="Subtasks" />
                <p className="mb-3 text-sm text-slate-400">Break down your task into smaller steps</p>
                <button
                  type="button"
                  onClick={() => setIsSubtaskModalOpen(true)}
                  className="w-full rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2.5 font-bold text-[var(--bp-accent)] transition hover:border-[var(--bp-accent)]/60"
                >
                  + Add Subtask
                </button>
                {subtasks.length ? (
                  <div className="mt-3 space-y-2">
                    {subtasks.map((subtask, index) => (
                      <div key={`${subtask.title}-${index}`} className="flex items-center justify-between rounded-xl bg-[var(--bp-bg)] px-4 py-3 text-sm text-[var(--bp-text)]">
                        <span>{subtask.title}</span>
                        <button
                          type="button"
                          onClick={() => setSubtasks((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                          className="text-xs font-black text-red-300"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="mb-4 border-t border-[var(--bp-border)] pt-4">
                <FieldLabel label="Notes" />
              <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-20 w-full resize-none rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
                  placeholder="Additional notes (optional)..."
                />
              </div>

              <div className="border-t border-[var(--bp-border)] pt-4">
                <FieldLabel label="Attachments" />
                <TaskAttachmentPicker
                  files={attachments}
                  onChange={setAttachments}
                  disabled={saving || uploadingAttachments}
                  onValidationError={setError}
                />
              </div>
            </section>

            <section className="space-y-3">
              <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                <SectionTitle icon="SET" title="Task Settings" />

                <FieldLabel label="Priority" />
                <div className="mb-4 grid grid-cols-3 gap-2">
                  {['Low', 'Medium', 'High'].map((item) => (
                    <Segment key={item} active={priority === item} label={item} color={item === 'Low' ? 'text-green-400' : item === 'High' ? 'text-red-400' : 'text-orange-400'} onClick={() => setPriority(item)} />
                  ))}
                </div>

                <FieldLabel label="Task Status" />
                <div className="mb-4 grid grid-cols-4 gap-2">
                  {['To Do', 'In Progress', 'Done', 'Missed'].map((item) => (
                    <Segment key={item} active={status === item} label={item} color={item === 'Done' ? 'text-green-400' : item === 'Missed' ? 'text-red-400' : item === 'In Progress' ? 'text-blue-400' : 'text-[var(--bp-accent)]'} onClick={() => setStatus(item)} />
                  ))}
                </div>

                <FieldLabel label="Category" />
                <select value={category} onChange={(event) => setCategory(event.target.value)} className="mb-4 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]">
                  <option>Select category...</option>
                  <option>Work</option>
                  <option>Personal</option>
                  <option>Study</option>
                  <option>Health</option>
                </select>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <FieldLabel label="Due Date" />
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(event) => setDueDate(event.target.value)}
                      className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Due Time" />
                    <input
                      type="time"
                      value={dueTime}
                      onChange={(event) => setDueTime(event.target.value)}
                      className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                  <FieldLabel label="Recurring Task" />
                  <button
                    type="button"
                    onClick={() => setIsRecurrenceModalOpen(true)}
                    className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-start font-bold text-[var(--bp-text)] outline-none transition hover:border-[var(--bp-accent)]"
                  >
                    {recurrenceSummary}
                  </button>
                </div>

                <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                  <FieldLabel label="Dependencies" />
                  <p className="mb-3 text-sm text-slate-400">Task depends on another task</p>
                  <button
                    type="button"
                    onClick={() => setDependencyModalOpen(true)}
                    className="w-full rounded-xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2.5 font-bold text-[var(--bp-accent)] transition hover:border-[var(--bp-accent)]/60 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!availableDependencies.length}
                  >
                    + Add Dependency
                  </button>
                  {dependencies.length ? (
                    <div className="mt-4 space-y-2">
                      {dependencies.map((dependency) => (
                        <div key={dependency.id} className="rounded-xl bg-[var(--bp-bg)] px-4 py-3">
                          <p className="font-bold text-[var(--bp-text)]">{dependency.title}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {dependency.category} - {dependency.status}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      {availableDependencies.length ? 'No dependencies selected yet.' : 'Create another task first to add dependencies.'}
                    </p>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <FieldLabel label="Reminder" />
                    <p className="text-sm text-slate-400">BeePlan will remind you before the due date.</p>
                  </div>
                  <div className="flex h-6 w-11 items-center justify-end rounded-full bg-[var(--bp-accent)] p-1">
                    <div className="h-4 w-4 rounded-full bg-white" />
                  </div>
                </div>

                <FieldLabel label="Reminder Time" />
                <select value={reminderBeforeMinutes} onChange={(event) => setReminderBeforeMinutes(Number(event.target.value))} className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]">
                  <option value={30}>30 minutes before</option>
                  <option value={10}>10 minutes before</option>
                  <option value={60}>1 hour before</option>
                  <option value={1440}>1 day before</option>
                </select>
              </div>

              <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
                <FieldLabel label="Quick Tip" />
                <p className="text-sm leading-6 text-slate-400">
                  Break large tasks into subtasks to make them easier to manage.
                </p>
              </div>
            </section>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t border-[var(--bp-border)] pt-4">
            {error ? <p className="me-auto self-center text-sm font-semibold text-red-300">{error}</p> : null}
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-6 py-2.5 font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || uploadingAttachments}
              className="rounded-xl bg-[var(--bp-accent)] px-6 py-2.5 font-black text-[var(--bp-accent-text)] shadow-lg shadow-[var(--bp-accent)]/20 disabled:opacity-60"
            >
              {saving || uploadingAttachments ? 'Saving...' : 'Save Task'}
            </button>
          </div>
      </AppLayout>
      <TaskRecurrenceModal
        open={isRecurrenceModalOpen}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        accessToken={accessToken}
        onClose={() => setIsRecurrenceModalOpen(false)}
        onSave={setRecurrence}
        onRemove={() => setRecurrence(null)}
        onApplyTime={setDueTime}
      />
      <TaskDependenciesWorkflowModal
        open={dependencyModalOpen}
        mode="add"
        currentTaskId="new-task-draft"
        availableTasks={availableDependencies}
        dependencies={dependencies}
        onClose={() => setDependencyModalOpen(false)}
        onAdd={(selectedTasks) => {
          setDependencies((current) => {
            const currentIds = new Set(current.map((item) => item.id))
            return [...current, ...selectedTasks.filter((item) => !currentIds.has(item.id))]
          })
        }}
        onSaveReplacement={() => undefined}
        onRemove={(dependencyId) => setDependencies((current) => current.filter((item) => item.id !== dependencyId))}
      />
      {isSubtaskModalOpen ? (
        <SubtaskFormModal
          mode="add"
          onBack={() => setIsSubtaskModalOpen(false)}
          onCancel={() => setIsSubtaskModalOpen(false)}
          onSubmit={(payload) => {
            if (!payload.title?.trim()) return
            setSubtasks((current) => [...current, { ...payload, title: payload.title!.trim() }])
            setIsSubtaskModalOpen(false)
          }}
        />
      ) : null}
    </>
  )
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="mb-4 flex items-center gap-2 text-base font-black">
      <span className="text-[var(--bp-accent)]">{icon}</span>
      {title}
    </h3>
  )
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-300">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({
  label,
  active,
  color,
  onClick,
}: {
  label: string
  active?: boolean
  color: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-2 text-sm font-bold transition ${
        active
          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]'
          : `border-[var(--bp-border)] bg-[var(--bp-surface)] ${color}`
      }`}
    >
      {label}
    </button>
  )
}

function toDependencyTask(task: ApiTask): DependencyTask {
  return {
    id: task.id,
    title: task.title,
    category: task.category || 'General',
    status: toUiStatus(task.status) as DependencyTask['status'],
    dueDate: formatDate(task.dueDate) || 'No due date',
    priority: normalizePriority(toUiPriority(task.priority)),
  }
}

function normalizePriority(priority: string): DependencyTask['priority'] {
  if (priority === 'Low' || priority === 'High') return priority
  return 'Medium'
}

function formatDate(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}




