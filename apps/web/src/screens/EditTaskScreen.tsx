import { useEffect, useState } from 'react'
import DeleteSubtaskModal from '../components/DeleteSubtaskModal'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import SubtaskFormModal, { type SubtaskFormValues } from '../components/SubtaskFormModal'
import {
  TaskRecurrenceModal,
  createRecurrenceSummary,
  type RecurrenceSettings,
} from '../components/TaskRecurrenceModal'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import {
  recurrenceToApi,
  recurrenceToUi,
  toApiPriority,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  type ApiTask,
  type TaskPayload,
} from '../lib/tasksApi'

type EditTaskScreenProps = SidebarNavHandlers & {
  task: ApiTask
  onBack?: () => void
  onCancel?: () => void
  onDelete?: () => void
  onSave?: (payload: TaskPayload) => Promise<void> | void
  onSignOut?: () => void
}

type EditableSubtask = {
  title: string
  done: boolean
  assignee?: string
  dueDate?: string
  status?: string
}

export default function EditTaskScreen({ task, onBack, onCancel, onDelete, onSave, onSignOut, ...nav }: EditTaskScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [category, setCategory] = useState(task.category || 'General')
  const [status, setStatus] = useState(toUiStatus(task.status))
  const [priority, setPriority] = useState(toUiPriority(task.priority))
  const [dueDate, setDueDate] = useState(toDateInput(task.dueDate))
  const [dueTime, setDueTime] = useState(task.dueTime)
  const [notes, setNotes] = useState(task.notes)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [subtasks, setSubtasks] = useState<EditableSubtask[]>(() =>
    task.subtasks.map((item) => ({
      title: item.title,
      done: item.isDone,
      assignee: item.assignee,
      dueDate: item.dueDate,
      status: item.status,
    })),
  )
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [editingSubtaskIndex, setEditingSubtaskIndex] = useState<number | null>(null)
  const [deletingSubtaskIndex, setDeletingSubtaskIndex] = useState<number | null>(null)
  const [recurrence, setRecurrence] = useState<RecurrenceSettings | null>(recurrenceToUi(task.recurrence))
  const [isRecurrenceModalOpen, setIsRecurrenceModalOpen] = useState(false)
  const recurrenceSummary = createRecurrenceSummary(recurrence)

  useEffect(() => {
    if (!task) return

    setTitle(task.title)
    setDescription(task.description)
    setCategory(task.category || 'General')
    setStatus(toUiStatus(task.status))
    setPriority(toUiPriority(task.priority))
    setDueDate(toDateInput(task.dueDate))
    setDueTime(task.dueTime)
    setNotes(task.notes)
    setRecurrence(recurrenceToUi(task.recurrence))
    setSubtasks(
      task.subtasks.map((item) => ({
        title: item.title,
        done: item.isDone,
        assignee: item.assignee,
        dueDate: item.dueDate,
        status: item.status,
      })),
    )
  }, [task])

  const handleAddSubtask = (values: SubtaskFormValues) => {
    setSubtasks((current) => [...current, { title: values.title, done: false }])
    setAddingSubtask(false)
  }

  const handleEditSubtask = (values: SubtaskFormValues) => {
    if (editingSubtaskIndex === null) return
    setSubtasks((current) =>
      current.map((item, index) => (index === editingSubtaskIndex ? { ...item, title: values.title } : item)),
    )
    setEditingSubtaskIndex(null)
  }

  const handleConfirmDelete = () => {
    if (deletingSubtaskIndex === null) return
    setSubtasks((current) => current.filter((_, index) => index !== deletingSubtaskIndex))
    setDeletingSubtaskIndex(null)
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('Task title is required.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await onSave?.({
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        status: toApiStatus(status),
        priority: toApiPriority(priority),
        dueDate: dueDate || undefined,
        dueTime,
        notes: notes.trim(),
        estimatedTimeMinutes: task.estimatedTimeMinutes,
        spentTimeMinutes: task.spentTimeMinutes,
        remainingTimeMinutes: task.remainingTimeMinutes,
        reminderEnabled: task.reminderEnabled,
        reminderBeforeMinutes: task.reminderBeforeMinutes,
        recurrence: recurrenceToApi(recurrence),
        subtasks: subtasks.map((item, index) => ({
          title: item.title,
          isDone: item.done,
          orderIndex: index,
          assignee: item.assignee,
          dueDate: item.dueDate,
          status: item.status,
        })),
      })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save task changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <AppLayout
        active="tasks"
        onNavigateDashboard={nav.onNavigateDashboard}
        onNavigateTasks={onCancel}
        onNavigateReminders={nav.onNavigateReminders}
        onNavigateCalendar={nav.onNavigateCalendar}
        onNavigateNotes={nav.onNavigateNotes}
        onNavigateAnalytics={nav.onNavigateAnalytics}
        panelTitle="Editing task"
        panelCaption="Last updated today."
        panelPercent={72}
      >
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
            <button type="button" onClick={onBack} className="hover:text-[var(--bp-text)]">Back</button>
            <span>Tasks</span>
            <span>/</span>
            <span className="text-[var(--bp-text)]">Edit Task</span>
          </div>

          <PageHeader
            title="Edit Task"
            subtitle="Update task details, timing, progress, and supporting files."
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

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <section className="space-y-6">
              <Card title="Task Information" code="INFO">
                <FieldLabel label="Task Title" required />
                <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} />

                <FieldLabel label="Description" />
                <textarea
                  className={`${inputClass} min-h-36 resize-none`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel label="Category" />
                    <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>
                      <option>Marketing</option>
                      <option>Design</option>
                      <option>Development</option>
                      <option>Research</option>
                      <option>General</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel label="Status" />
                    <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
                      <option>To Do</option>
                      <option>In Progress</option>
                      <option>Done</option>
                      <option>Missed</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Card title="Editable Subtasks" action="+ Add Subtask" onAction={() => setAddingSubtask(true)}>
                <div className="space-y-3">
                  {subtasks.map((item, index) => (
                    <div key={item.title} className="grid gap-3 rounded-2xl bg-[var(--bp-surface)] p-4 md:grid-cols-[32px_1fr_auto_auto] md:items-center">
                      <button className={`h-6 w-6 rounded-md border ${item.done ? 'border-green-400 bg-green-400 text-xs font-black text-[#1F2937]' : 'border-slate-500'}`}>
                        {item.done ? 'OK' : ''}
                      </button>
                      <input className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-3 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]" defaultValue={item.title} />
                      <button
                        onClick={() => setEditingSubtaskIndex(index)}
                        className="rounded-xl bg-[var(--bp-border)] px-4 py-3 text-sm font-bold text-[var(--bp-text)]"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingSubtaskIndex(index)}
                        className="rounded-xl border border-red-500/40 px-4 py-3 text-sm font-bold text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Notes">
                <textarea
                  className={`${inputClass} min-h-28 resize-none`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </Card>

              <Card title="Attachments" action="Upload">
                <div className="space-y-3">
                  {task.attachments.map((file) => (
                    <div key={file.name} className="flex items-center gap-4 rounded-2xl bg-[var(--bp-surface)] p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--bp-border)] text-xs font-black text-[var(--bp-accent)]">{file.type ?? 'FILE'}</div>
                      <div className="flex-1">
                        <p className="font-bold text-[var(--bp-text)]">{file.name}</p>
                        <p className="text-sm text-slate-500">{file.size ?? 'Attached file'}</p>
                      </div>
                      <button className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300">Delete</button>
                    </div>
                  ))}
                  {!task.attachments.length ? <p className="text-sm text-slate-400">No attachments yet.</p> : null}
                </div>
              </Card>
            </section>

            <aside className="space-y-6">
              <Card title="Task Settings" code="SET">
                <FieldLabel label="Priority" />
                <div className="mb-5 grid grid-cols-3 gap-3">
                  <Segment active={priority === 'Low'} label="Low" color="text-green-400" onClick={() => setPriority('Low')} />
                  <Segment active={priority === 'Medium'} label="Medium" color="text-orange-400" onClick={() => setPriority('Medium')} />
                  <Segment active={priority === 'High'} label="High" color="text-red-400" onClick={() => setPriority('High')} />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <FieldLabel label="Due Date" />
                    <input type="date" className={inputClass} value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                  </div>
                  <div>
                    <FieldLabel label="Due Time" />
                    <input type="time" className={inputClass} value={dueTime} onChange={(event) => setDueTime(event.target.value)} />
                  </div>
                </div>
              </Card>

              <Card title="Progress Overview" code="72">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-400">
                    {subtasks.filter((item) => item.done).length} of {subtasks.length} subtasks completed
                  </span>
                  <span className="text-2xl font-black text-[var(--bp-accent)]">{task.progress}%</span>
                </div>
                <div className="h-3 rounded-full bg-[var(--bp-border)]">
                  <div className="h-3 rounded-full bg-[var(--bp-accent)]" style={{ width: `${task.progress}%` }} />
                </div>
              </Card>

              <Card title="Reminder & Recurring">
                <FieldLabel label="Reminder" />
                <select className={inputClass} defaultValue={formatReminder(task.reminderBeforeMinutes)}>
                  <option>10 minutes before</option>
                  <option>30 minutes before</option>
                  <option>1 hour before</option>
                  <option>1 day before</option>
                </select>

                <FieldLabel label="Recurring" />
                <button
                  type="button"
                  onClick={() => setIsRecurrenceModalOpen(true)}
                  className={`${inputClass} text-start font-bold`}
                >
                  {recurrenceSummary}
                </button>
              </Card>

              <Card title="Dependencies" action="+ Add">
                {task.dependencies.map((dependency) => (
                  <Dependency key={dependency.id} label={dependency.title} status={toUiStatus(dependency.status)} />
                ))}
                {!task.dependencies.length ? <p className="text-sm text-slate-400">No dependencies yet.</p> : null}
              </Card>

              <Card title="Activity Information">
                <InfoRow label="Created Date" value={formatDate(task.createdAt)} />
                <InfoRow label="Last Updated" value={formatDate(task.updatedAt)} />
              </Card>

              <Card title="Time Tracking">
                <InfoRow label="Estimated Time" value={`${task.estimatedHours}h`} />
                <InfoRow label="Time Spent" value={`${task.spentHours}h`} />
                <InfoRow label="Remaining Time" value={`${task.remainingHours}h`} />
              </Card>
            </aside>
          </div>

          <footer className="mt-8 flex flex-col gap-3 border-t border-[var(--bp-border)] pt-6 md:flex-row md:items-center md:justify-between">
            <button onClick={onDelete} className="rounded-xl border border-red-500/50 px-8 py-4 font-bold text-red-400">
              Delete Task
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={onCancel} className="rounded-xl bg-[var(--bp-border)] px-10 py-4 font-bold text-[var(--bp-text)]">
                Cancel Changes
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-xl bg-[var(--bp-accent)] px-10 py-4 font-black text-[var(--bp-accent-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </footer>
          {error ? <p className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-300">{error}</p> : null}
      </AppLayout>

      {addingSubtask ? (
        <SubtaskFormModal
          mode="add"
          onCancel={() => setAddingSubtask(false)}
          onBack={() => setAddingSubtask(false)}
          onSubmit={handleAddSubtask}
        />
      ) : null}

      {editingSubtaskIndex !== null ? (
        <SubtaskFormModal
          mode="edit"
          initialValues={{ title: subtasks[editingSubtaskIndex]?.title }}
          onCancel={() => setEditingSubtaskIndex(null)}
          onBack={() => setEditingSubtaskIndex(null)}
          onDelete={() => {
            setDeletingSubtaskIndex(editingSubtaskIndex)
            setEditingSubtaskIndex(null)
          }}
          onSubmit={handleEditSubtask}
        />
      ) : null}

      {deletingSubtaskIndex !== null ? (
        <DeleteSubtaskModal
          subtaskTitle={subtasks[deletingSubtaskIndex]?.title}
          onCancel={() => setDeletingSubtaskIndex(null)}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      <TaskRecurrenceModal
        open={isRecurrenceModalOpen}
        mode={recurrence ? 'edit' : 'create'}
        recurrence={recurrence}
        onClose={() => setIsRecurrenceModalOpen(false)}
        onSave={setRecurrence}
        onRemove={() => setRecurrence(null)}
      />
    </>
  )
}

const inputClass =
  'mb-5 w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-4 py-4 text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]'

function Card({
  title,
  code,
  action,
  onAction,
  children,
}: {
  title: string
  code?: string
  action?: string
  onAction?: () => void
  children: React.ReactNode
}) {
  return (
    <section className="rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-3 text-lg font-black">
          {code ? <span className="text-[var(--bp-accent)]">{code}</span> : null}
          {title}
        </h3>
        {action ? (
          <button onClick={onAction} className="font-bold text-[var(--bp-accent)]">
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-300">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({ label, active, color, onClick }: { label: string; active?: boolean; color: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-sm font-bold ${active ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]' : `border-[var(--bp-border)] bg-[var(--bp-surface)] ${color}`}`}
    >
      {label}
    </button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-2xl bg-[var(--bp-surface)] px-4 py-3">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <span className="font-bold text-[var(--bp-text)]">{value}</span>
    </div>
  )
}

function Dependency({ label, status }: { label: string; status: string }) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-2xl bg-[var(--bp-surface)] p-4">
      <span className="font-bold text-[var(--bp-text)]">{label}</span>
      <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300">{status}</span>
    </div>
  )
}

function toDateInput(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function formatDate(value?: string) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return date.toISOString().slice(0, 10)
}

function formatReminder(minutes?: number) {
  if (minutes === 10) return '10 minutes before'
  if (minutes === 60) return '1 hour before'
  if (minutes === 1440) return '1 day before'
  return '30 minutes before'
}
