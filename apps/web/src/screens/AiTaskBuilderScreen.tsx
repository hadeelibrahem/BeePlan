import { useEffect, useRef, useState } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import { createReminder } from '../features/reminders/api/reminders.api'
import type { Reminder, ReminderFormValues } from '../features/reminders/types/reminders.types'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { ConfirmDestructiveModal } from '../components/ConfirmDestructiveModal'
import {
  sendTaskPlanChat,
  type ConversationState,
  type TaskPlan,
  type TaskPlanChatMessage,
  type TaskPlanPriority,
  type UnderstoodSummary,
} from '../lib/aiTaskPlanApi'
import type { ApiTask, TaskPayload } from '../lib/tasksApi'

type AiTaskBuilderScreenProps = SidebarNavHandlers & {
  accessToken?: string
  onCancel?: () => void
  onSaveTask?: (payload: TaskPayload) => Promise<ApiTask | undefined> | ApiTask | void
  onReminderCreated?: (reminder: Reminder) => void
  onSaved?: (task: ApiTask) => void
  onSignOut?: () => void
}

type ChatMessage = {
  id: number
  role: 'user' | 'assistant'
  content: string
  quickReplies?: string[]
  kind?: 'question' | 'advice' | 'plan'
  state?: ConversationState
  understoodSummary?: UnderstoodSummary
}

const GREETING =
  "Hi! I'm your AI Task Builder. Describe a big goal or task — for example \"prepare my graduation project presentation by next Sunday\" — and I'll break it into a full plan with subtasks, focus sessions, and reminders."

const GREETING_QUICK_REPLIES = [
  'Plan my exam study schedule',
  'Prepare a project presentation',
  'Organize a big work deliverable',
]

export default function AiTaskBuilderScreen({
  accessToken,
  onCancel,
  onSaveTask,
  onReminderCreated,
  onSaved,
  onSignOut,
  ...nav
}: AiTaskBuilderScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, role: 'assistant', content: GREETING, quickReplies: GREETING_QUICK_REPLIES },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<TaskPlan | null>(null)
  const [editing, setEditing] = useState(false)
  const [isDraftDirty, setIsDraftDirty] = useState(false)
  const [isRegenerateConfirmOpen, setIsRegenerateConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const nextIdRef = useRef(1)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

  function nextId() {
    return nextIdRef.current++
  }

  function toApiMessages(list: ChatMessage[]): TaskPlanChatMessage[] {
    return list.map(({ role, content }) => ({ role, content }))
  }

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading || saving || !accessToken) return

    setError('')
    setInput('')
    const outgoing: ChatMessage = { id: nextId(), role: 'user', content: trimmed }
    const conversation = [...messages, outgoing]
    setMessages(conversation)
    setLoading(true)

    try {
      const response = await sendTaskPlanChat(accessToken, toApiMessages(conversation))
      setMessages((current) => [
        ...current,
        {
          id: nextId(),
          role: 'assistant',
          content: response.message,
          quickReplies: response.type !== 'plan' ? response.quickReplies : undefined,
          kind: response.type,
          state: response.state,
          understoodSummary: response.understoodSummary,
        },
      ])
      if (response.type === 'plan' && response.plan) {
        setPlan(response.plan)
        setEditing(false)
        setIsDraftDirty(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI planning failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function regenerate() {
    if (isDraftDirty) {
      setIsRegenerateConfirmOpen(true)
      return
    }
    void send('Please regenerate the plan with a different structure or schedule, keeping the same goal and deadline.')
  }

  function applyPlanChange(nextPlan: TaskPlan) {
    setPlan(nextPlan)
    setIsDraftDirty(true)
  }

  async function savePlan() {
    if (!plan || saving) return
    if (!plan.mainTask.title.trim()) {
      setError('The plan needs a task title before saving.')
      return
    }

    setSaving(true)
    setError('')

    try {
      const totalMinutes = plan.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0)
      const createdTask = await onSaveTask?.({
        title: plan.mainTask.title.trim(),
        description: plan.mainTask.description,
        priority: plan.mainTask.priority,
        status: 'todo',
        dueDate: plan.mainTask.dueDate ?? undefined,
        estimatedTimeMinutes: totalMinutes,
        reminderEnabled: true,
        reminderBeforeMinutes: 30,
        isFocusTask: plan.focusSessions.length > 0,
        subtasks: plan.subtasks.map((subtask) => ({
          title: subtask.title,
          isDone: false,
          orderIndex: subtask.order,
          // The plan's Focus choice applies to the executable units it creates,
          // not only to their parent task.
          isFocusTask: plan.focusSessions.length > 0,
        })),
      })

      if (!createdTask) return

      // Reminders are best-effort: the task is already saved, so a reminder
      // failure should warn without losing the created task.
      let reminderFailures = 0
      for (const planReminder of plan.reminders) {
        try {
          const reminder = await createReminder(
            {
              title: planReminder.title,
              type: 'time',
              remindAt: planReminder.remindAt,
              priority: plan.mainTask.priority,
              repeatRule: { frequency: 'none', interval: 1 },
            } as ReminderFormValues,
            accessToken ?? '',
          )
          onReminderCreated?.(reminder)
        } catch {
          reminderFailures += 1
        }
      }

      if (reminderFailures > 0) {
        console.warn(`[AI Task Builder] ${reminderFailures} reminder(s) could not be created.`)
      }

      onSaved?.(createdTask)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save the plan.')
    } finally {
      setSaving(false)
    }
  }

  const lastMessage = messages[messages.length - 1]
  const activeQuickReplies = !loading && lastMessage?.role === 'assistant' ? lastMessage.quickReplies ?? [] : []
  const showReviewActions = !loading && lastMessage?.role === 'assistant' && lastMessage.state === 'review'
  const totalMinutes = plan ? plan.subtasks.reduce((sum, subtask) => sum + subtask.estimatedMinutes, 0) : 0

  return (
    <AppLayout
      active="tasks"
      {...nav}
      panelTitle="Plan smarter!"
      panelCaption="Let AI break your big goal into steps."
      panelPercent={0}
    >
      <div className="mb-3 flex items-center gap-2 text-xs text-slate-400">
        <button type="button" onClick={onCancel} className="hover:text-[var(--bp-text)]">
          Back
        </button>
        <span>Tasks</span>
        <span>/</span>
        <span className="text-[var(--bp-text)]">AI Plan Task</span>
      </div>

      <PageHeader
        title="AI Plan Task"
        subtitle="Describe your goal and let AI build a full task plan for you."
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tasks..."
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="flex min-h-[420px] flex-col rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4 shadow-2xl">
          <h3 className="mb-4 flex items-center gap-2 text-base font-black">
            <span className="text-[var(--bp-accent)]">AI</span>
            Planning Chat
          </h3>

          <div className="mb-3 max-h-[52vh] flex-1 space-y-3 overflow-y-auto pe-1">
            {messages.map((message) => {
              const isAdvice = message.role === 'assistant' && message.kind === 'advice'
              return (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                      message.role === 'user'
                        ? 'rounded-br-md bg-[var(--bp-accent)] font-semibold text-[var(--bp-accent-text)]'
                        : isAdvice
                          ? 'rounded-bl-md border border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/10 text-[var(--bp-text)]'
                          : 'rounded-bl-md border border-[var(--bp-border)] bg-[var(--bp-bg)] text-[var(--bp-text)]'
                    }`}
                  >
                    {isAdvice ? (
                      <p className="mb-1 text-xs font-black uppercase tracking-wide text-[var(--bp-accent)]">
                        Suggestion
                      </p>
                    ) : null}
                    {message.content}
                  </div>
                </div>
              )
            })}

            {loading ? (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-[var(--bp-border)] bg-[var(--bp-bg)] px-4 py-3">
                  <TypingDot delay="0ms" />
                  <TypingDot delay="150ms" />
                  <TypingDot delay="300ms" />
                </div>
              </div>
            ) : null}
            <div ref={chatEndRef} />
          </div>

          {activeQuickReplies.length ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {activeQuickReplies.map((reply) => (
                <button
                  key={reply}
                  type="button"
                  onClick={() => void send(reply)}
                  className="rounded-full border border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--bp-accent)] transition hover:bg-[var(--bp-accent)]/25"
                >
                  {reply}
                </button>
              ))}
            </div>
          ) : null}

          {showReviewActions ? (
            <div className="mb-3 rounded-2xl border border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/5 p-4">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--bp-accent)]">
                What I Understood
              </p>
              {lastMessage?.understoodSummary ? (
                <UnderstoodSummaryList summary={lastMessage.understoodSummary} />
              ) : (
                <p className="text-sm text-slate-400">No summary captured yet — feel free to add more details.</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void send('Yes, please generate the final task plan.')}
                  className="rounded-xl bg-[var(--bp-accent)] px-4 py-2 text-xs font-black text-[var(--bp-accent-text)] shadow-lg shadow-[var(--bp-accent)]/20 transition disabled:opacity-50"
                  disabled={loading}
                >
                  Generate Final Plan
                </button>
                <button
                  type="button"
                  onClick={() => void send("I'd like to adjust the scope before we finalize.")}
                  className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-2 text-xs font-bold text-[var(--bp-text)] transition hover:bg-[var(--bp-border)] disabled:opacity-50"
                  disabled={loading}
                >
                  Adjust Scope
                </button>
                <button
                  type="button"
                  onClick={() => void send('I want to add more details first.')}
                  className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-2 text-xs font-bold text-[var(--bp-text)] transition hover:bg-[var(--bp-border)] disabled:opacity-50"
                  disabled={loading}
                >
                  Add More Details
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex items-end gap-2 border-t border-[var(--bp-border)] pt-3">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send(input)
                }
              }}
              rows={2}
              className="min-h-11 w-full resize-none rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2.5 text-sm text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
              placeholder="Describe your goal, e.g. 'Finish my research paper by June 20'..."
              disabled={loading || saving}
            />
            <button
              type="button"
              onClick={() => void send(input)}
              disabled={loading || saving || !input.trim()}
              className="rounded-xl bg-[var(--bp-accent)] px-5 py-2.5 font-black text-[var(--bp-accent-text)] shadow-lg shadow-[var(--bp-accent)]/20 transition disabled:opacity-50"
            >
              Send
            </button>
          </div>

          {error ? <p className="mt-2 text-sm font-semibold text-red-300">{error}</p> : null}
        </section>

        <section className="space-y-3">
          {plan ? (
            <PlanPreview
              plan={plan}
              editing={editing}
              totalMinutes={totalMinutes}
              onChange={applyPlanChange}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-surface)]/30 p-8 text-center">
              <p className="text-3xl">🐝</p>
              <h3 className="mt-2 text-base font-black text-[var(--bp-text)]">Your plan will appear here</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Chat with the AI on the left. Once it has enough details, it will generate a full plan with subtasks,
                focus sessions, and reminders for you to review.
              </p>
            </div>
          )}

          {plan ? (
            <div className="flex flex-wrap justify-end gap-3 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-5 py-2.5 font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={regenerate}
                disabled={loading || saving}
                className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-5 py-2.5 font-bold text-[var(--bp-text)] hover:bg-[var(--bp-border)] disabled:opacity-60"
              >
                Regenerate Plan
              </button>
              <button
                type="button"
                onClick={() => setEditing((value) => !value)}
                disabled={saving}
                className={`rounded-xl border px-5 py-2.5 font-bold transition disabled:opacity-60 ${
                  editing
                    ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]'
                    : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:bg-[var(--bp-border)]'
                }`}
              >
                {editing ? 'Done Editing' : 'Edit Plan'}
              </button>
              <button
                type="button"
                onClick={() => void savePlan()}
                disabled={saving || loading}
                className="rounded-xl bg-[var(--bp-accent)] px-6 py-2.5 font-black text-[var(--bp-accent-text)] shadow-lg shadow-[var(--bp-accent)]/20 disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save Plan'}
              </button>
            </div>
          ) : null}
        </section>
      </div>
      <ConfirmDestructiveModal open={isRegenerateConfirmOpen} title="Regenerate plan?" message="Your manual changes will be discarded and replaced with a new AI plan." confirmLabel="Regenerate plan" isConfirming={loading} onCancel={() => !loading && setIsRegenerateConfirmOpen(false)} onConfirm={() => { setIsRegenerateConfirmOpen(false); void send('Please regenerate the plan with a different structure or schedule, keeping the same goal and deadline.') }} />
    </AppLayout>
  )
}

function PlanPreview({
  plan,
  editing,
  totalMinutes,
  onChange,
}: {
  plan: TaskPlan
  editing: boolean
  totalMinutes: number
  onChange: (plan: TaskPlan) => void
}) {
  function updateMainTask(patch: Partial<TaskPlan['mainTask']>) {
    onChange({ ...plan, mainTask: { ...plan.mainTask, ...patch } })
  }

  function updateSubtask(index: number, patch: Partial<TaskPlan['subtasks'][number]>) {
    onChange({
      ...plan,
      subtasks: plan.subtasks.map((subtask, itemIndex) =>
        itemIndex === index ? { ...subtask, ...patch } : subtask,
      ),
    })
  }

  function removeSubtask(index: number) {
    onChange({
      ...plan,
      subtasks: plan.subtasks
        .filter((_, itemIndex) => itemIndex !== index)
        .map((subtask, itemIndex) => ({ ...subtask, order: itemIndex + 1 })),
    })
  }

  function removeFocusSession(index: number) {
    onChange({ ...plan, focusSessions: plan.focusSessions.filter((_, itemIndex) => itemIndex !== index) })
  }

  function removeReminder(index: number) {
    onChange({ ...plan, reminders: plan.reminders.filter((_, itemIndex) => itemIndex !== index) })
  }

  const inputClass =
    'w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]'

  return (
    <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/50 p-4 shadow-2xl">
      <h3 className="mb-4 flex items-center gap-2 text-base font-black">
        <span className="text-[var(--bp-accent)]">PLAN</span>
        Generated Plan
      </h3>

      {editing ? (
        <div className="mb-4 space-y-3">
          <div>
            <PreviewLabel label="Task Title" />
            <input
              value={plan.mainTask.title}
              onChange={(event) => updateMainTask({ title: event.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <PreviewLabel label="Description" />
            <textarea
              value={plan.mainTask.description}
              onChange={(event) => updateMainTask({ description: event.target.value })}
              className={`${inputClass} min-h-20 resize-none`}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <PreviewLabel label="Due Date" />
              <input
                type="date"
                value={plan.mainTask.dueDate ? plan.mainTask.dueDate.slice(0, 10) : ''}
                onChange={(event) =>
                  updateMainTask({
                    dueDate: event.target.value
                      ? new Date(`${event.target.value}T00:00:00`).toISOString()
                      : null,
                  })
                }
                className={inputClass}
              />
            </div>
            <div>
              <PreviewLabel label="Priority" />
              <div className="grid grid-cols-3 gap-2">
                {(['low', 'medium', 'high'] as TaskPlanPriority[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => updateMainTask({ priority: item })}
                    className={`rounded-xl border px-2 py-2 text-xs font-bold capitalize transition ${
                      plan.mainTask.priority === item
                        ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 text-[var(--bp-accent)]'
                        : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-slate-300'
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4">
          <p className="text-lg font-black text-[var(--bp-text)]">{plan.mainTask.title}</p>
          {plan.mainTask.description ? (
            <p className="mt-1 text-sm leading-6 text-slate-400">{plan.mainTask.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <MetaChip label={`Due: ${formatDate(plan.mainTask.dueDate)}`} />
            <MetaChip label={`Priority: ${plan.mainTask.priority}`} tone={plan.mainTask.priority} />
            <MetaChip label={`Est. total: ${formatHours(totalMinutes)}`} />
          </div>
        </div>
      )}

      <PreviewSection title={`Subtasks (${plan.subtasks.length})`}>
        {plan.subtasks.length ? (
          <div className="space-y-2">
            {plan.subtasks.map((subtask, index) => (
              <div key={`${subtask.order}-${index}`} className="rounded-xl bg-[var(--bp-bg)] px-4 py-3">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-[var(--bp-accent)]">{subtask.order}.</span>
                    <input
                      value={subtask.title}
                      onChange={(event) => updateSubtask(index, { title: event.target.value })}
                      className={`${inputClass} flex-1`}
                    />
                    <input
                      type="number"
                      min={5}
                      value={subtask.estimatedMinutes}
                      onChange={(event) =>
                        updateSubtask(index, { estimatedMinutes: Math.max(0, Number(event.target.value) || 0) })
                      }
                      className={`${inputClass} w-20 text-center`}
                    />
                    <span className="text-xs text-slate-500">min</span>
                    <button
                      type="button"
                      onClick={() => removeSubtask(index)}
                      className="text-xs font-black text-red-300"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--bp-text)]">
                        <span className="me-1.5 text-[var(--bp-accent)]">{subtask.order}.</span>
                        {subtask.title}
                      </p>
                      {subtask.description ? (
                        <p className="mt-0.5 text-xs leading-5 text-slate-400">{subtask.description}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--bp-accent)]/15 px-2 py-1 text-[11px] font-bold text-[var(--bp-accent)]">
                      {formatMinutes(subtask.estimatedMinutes)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No subtasks suggested.</p>
        )}
      </PreviewSection>

      <PreviewSection title={`Suggested Focus Sessions (${plan.focusSessions.length})`}>
        {plan.focusSessions.length ? (
          <div className="space-y-2">
            {plan.focusSessions.map((session, index) => (
              <div
                key={`${session.startTime}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bp-bg)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--bp-text)]">{session.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatDateTime(session.startTime)} – {formatTime(session.endTime)}
                    {session.relatedSubtaskTitle ? ` · ${session.relatedSubtaskTitle}` : ''}
                  </p>
                </div>
                {editing ? (
                  <button
                    type="button"
                    onClick={() => removeFocusSession(index)}
                    className="text-xs font-black text-red-300"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No focus sessions suggested.</p>
        )}
      </PreviewSection>

      <PreviewSection title={`Reminders (${plan.reminders.length})`} last>
        {plan.reminders.length ? (
          <div className="space-y-2">
            {plan.reminders.map((reminder, index) => (
              <div
                key={`${reminder.remindAt}-${index}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-[var(--bp-bg)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-[var(--bp-text)]">{reminder.title}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{formatDateTime(reminder.remindAt)}</p>
                </div>
                {editing ? (
                  <button
                    type="button"
                    onClick={() => removeReminder(index)}
                    className="text-xs font-black text-red-300"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No reminders suggested.</p>
        )}
      </PreviewSection>
    </div>
  )
}

function PreviewSection({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={`border-t border-[var(--bp-border)] pt-3 ${last ? '' : 'mb-4'}`}>
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-300">{title}</p>
      {children}
    </div>
  )
}

function PreviewLabel({ label }: { label: string }) {
  return <label className="mb-1.5 block text-xs font-black uppercase tracking-wide text-slate-300">{label}</label>
}

function MetaChip({ label, tone }: { label: string; tone?: TaskPlanPriority }) {
  const color =
    tone === 'high'
      ? 'bg-red-500/20 text-red-300'
      : tone === 'low'
        ? 'bg-green-500/20 text-green-300'
        : tone === 'medium'
          ? 'bg-orange-500/20 text-orange-300'
          : 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]'

  return <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${color}`}>{label}</span>
}

function UnderstoodSummaryList({ summary }: { summary: UnderstoodSummary }) {
  return (
    <div className="space-y-1.5 text-sm">
      <SummaryRow label="Goal" value={summary.goal} />
      {summary.goalType ? <SummaryRow label="Type" value={summary.goalType} /> : null}
      {summary.deadline ? <SummaryRow label="Deadline" value={summary.deadline} /> : null}
      {summary.availableTime ? <SummaryRow label="Available time" value={summary.availableTime} /> : null}
      {summary.currentProgress ? <SummaryRow label="Progress so far" value={summary.currentProgress} /> : null}
      <SummaryBullets label="Deliverables" items={summary.deliverables} />
      <SummaryBullets label="Constraints" items={summary.constraints} />
      <SummaryBullets label="Risks" items={summary.risks} />
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[var(--bp-text)]">
      <span className="font-bold text-slate-400">{label}: </span>
      {value}
    </p>
  )
}

function SummaryBullets({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null

  return (
    <div>
      <span className="text-xs font-bold text-slate-400">{label}:</span>
      <ul className="ms-4 list-disc text-[var(--bp-text)]">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

function TypingDot({ delay }: { delay: string }) {
  return (
    <span
      className="h-2 w-2 animate-bounce rounded-full bg-[var(--bp-accent)]"
      style={{ animationDelay: delay }}
    />
  )
}

function formatDate(value: string | null) {
  if (!value) return 'No due date'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No due date'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatMinutes(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    return rest ? `${hours}h ${rest}m` : `${hours}h`
  }
  return `${minutes}m`
}

function formatHours(minutes: number) {
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`
}
