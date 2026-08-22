import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import { DangerButton, OutlineButton, PrimaryButton } from '../components/layout/Buttons'
import AttachmentPreviewModal from '../components/AttachmentPreviewModal'
import DeleteTaskModal from '../components/DeleteTaskModal'
import SubtaskDetailModal from '../components/SubtaskDetailModal'
import SubtaskFormModal from '../components/SubtaskFormModal'
import RecurrenceSuggestionCard from '../components/RecurrenceSuggestionCard'
import { TaskPriorityBadge, TaskStatusBadge } from '../components/TaskBadges'
import {
  displaySubtaskTitle,
  formatDuration,
  getSubtaskIndicator,
  matchesSubtaskFilter,
  SUBTASK_INDICATOR_META,
  type SubtaskFilter,
} from '../lib/subtaskDisplay'
import { SubtaskVisibilityFilter } from '../features/collaboration/components/SubtaskVisibilityFilter'
import { type DependencyTask } from '../components/TaskDependenciesWorkflowModal'
import { TaskStatusWorkflowModal, type TaskStatus } from '../components/TaskStatusWorkflowModal'
import { InlineStatusControl } from '../components/InlineStatusControl'
import { ExistingScheduleConflict } from '../components/ExistingScheduleConflict'
import { TravelWeatherCard } from '../components/TravelWeatherCard'
import { ExistingTaskTimeConflict } from '../components/ExistingTaskTimeConflict'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { CollaborationPanel } from '../features/collaboration/components/CollaborationPanel'
import { SharedBadge } from '../features/collaboration/components/SharedBadge'
import { useTaskDeleteConfirmation } from '../features/tasks/taskDeleteConfirmation'
import {
  changeTaskStatus,
  getAttachments,
  recurrenceToUi,
  toApiStatus,
  toUiPriority,
  toUiStatus,
  updateSubtask,
  type ApiTask,
  type ApiSubtask,
  type ApiTaskAttachment,
  type RecurrenceSuggestion,
  type UiRecurrence,
} from '../lib/tasksApi'
import { getAchievements } from '../lib/achievementsApi'

type TaskDetailsScreenProps = SidebarNavHandlers & {
  task?: ApiTask | null
  tasks?: ApiTask[]
  accessToken?: string
  currentUserId?: string
  recurrenceSuggestions?: RecurrenceSuggestion[]
  notice?: string
  onNoticeShown?: () => void
  onTaskUpdated?: (task: ApiTask) => void
  onRefresh?: () => void
  onBack?: () => void
  onEdit?: () => void
  onOpenAiCollaboration?: () => void
  onAddToAchievement?: () => void
  onViewAchievement?: (achievementId: string) => void
  onDelete?: () => Promise<void> | void
  onMarkDone?: () => void
  onMakeRecurringSuggestion?: (suggestion: RecurrenceSuggestion) => void
  onDismissRecurrenceSuggestion?: (suggestion: RecurrenceSuggestion) => void
  onSignOut?: () => void
}

export default function TaskDetailsScreen({
  task,
  tasks = [],
  accessToken = '',
  currentUserId = '',
  recurrenceSuggestions = [],
  notice = '',
  onNoticeShown,
  onTaskUpdated,
  onRefresh,
  onBack,
  onEdit,
  onOpenAiCollaboration,
  onAddToAchievement,
  onViewAchievement,
  onDelete,
  onMakeRecurringSuggestion,
  onDismissRecurrenceSuggestion,
  onSignOut,
  ...nav
}: TaskDetailsScreenProps) {
  const { t, toggleLanguage, language } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<TaskStatus>(toTaskStatus(task))
  const [progress, setProgress] = useState(task?.progress ?? 0)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [statusModalInitial, setStatusModalInitial] = useState<TaskStatus | undefined>(undefined)
  const [statusSuccess, setStatusSuccess] = useState('')
  const [statusChanging, setStatusChanging] = useState(false)
  const [dependencies, setDependencies] = useState<DependencyTask[]>(
    task ? toDependencyTasks(task.dependencies) : [],
  )
  const [recurrence, setRecurrence] = useState(task ? recurrenceToUi(task.recurrence) : null)
  const [subtaskItems, setSubtaskItems] = useState<ApiSubtask[]>(task?.subtasks ?? [])
  const [detailSubtaskId, setDetailSubtaskId] = useState<string | null>(null)
  const [editSubtaskId, setEditSubtaskId] = useState<string | null>(null)
  const [attachmentItems, setAttachmentItems] = useState<ApiTaskAttachment[]>([])
  const [previewAttachment, setPreviewAttachment] = useState<ApiTaskAttachment | null>(null)
  const [sharedMemberCount, setSharedMemberCount] = useState(0)
  const [error, setError] = useState('')
  const [linkedAchievementId, setLinkedAchievementId] = useState<string | null>(null)
  useEffect(() => { if (status !== 'Done' || !accessToken || !task) { setLinkedAchievementId(null); return }; let active = true; void getAchievements(accessToken).then((all) => { if (active) setLinkedAchievementId(all.find((item) => item.relatedTaskId === task.id)?.id ?? null) }).catch(() => undefined); return () => { active = false } }, [accessToken, status, task?.id])

  const isOwner = task?.viewerRole === 'owner'
  const [subtaskFilter, setSubtaskFilter] = useState<SubtaskFilter>(
    isOwner ? 'team' : 'mine',
  )
  const [subtaskMemberId, setSubtaskMemberId] = useState('')
  const {
    isOpen: isDeleteDialogOpen,
    isDeleting: isDeletingTask,
    error: deleteError,
    openDeleteDialog,
    closeDeleteDialog,
    confirmDelete,
  } = useTaskDeleteConfirmation(onDelete)

  // "By Member" options are just the assignees that actually have subtasks —
  // no extra fetch, and it always matches what's filterable.
  const memberOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const item of subtaskItems) {
      if (item.assigneeUserId && item.assignee && !seen.has(item.assigneeUserId)) {
        seen.set(item.assigneeUserId, item.assignee)
      }
    }
    return [...seen.entries()].map(([userId, name]) => ({ userId, name }))
  }, [subtaskItems])

  const visibleSubtasks = useMemo(
    () =>
      subtaskItems.filter((item) =>
        matchesSubtaskFilter(item, subtaskFilter, {
          currentUserId,
          memberId: subtaskMemberId,
        }),
      ),
    [subtaskItems, subtaskFilter, currentUserId, subtaskMemberId],
  )

  const completedSubtasksCount = useMemo(
    () => subtaskItems.filter((subtask) => subtask.isDone).length,
    [subtaskItems],
  )
  const visibleCompletedCount = useMemo(
    () => visibleSubtasks.filter((subtask) => subtask.isDone).length,
    [visibleSubtasks],
  )
  const detailSubtask = useMemo(
    () => subtaskItems.find((item) => item.id === detailSubtaskId) ?? null,
    [subtaskItems, detailSubtaskId],
  )
  const editSubtask = useMemo(
    () => subtaskItems.find((item) => item.id === editSubtaskId) ?? null,
    [subtaskItems, editSubtaskId],
  )
  const syncTaskFromModal = useCallback(
    (updated: ApiTask) => {
      setSubtaskItems(updated.subtasks)
      setProgress(updated.progress)
      setStatus(toTaskStatus(updated))
      onTaskUpdated?.(updated)
    },
    [onTaskUpdated],
  )
  const dependenciesComplete = useMemo(
    () => dependencies.length > 0 && dependencies.every((item) => item.status === 'Done'),
    [dependencies],
  )
  const isBlocked = dependencies.length > 0 && !dependenciesComplete
  const reminderText = task?.reminderEnabled
    ? `${task.reminderBeforeMinutes ?? 30} minutes before due date`
    : 'No reminder set'
  const focusText = task?.isFocusTask ? 'Enabled' : 'Not set'
  // Read-only until we know otherwise so real owners/editors don't see a
  // one-render flash of hidden controls while `task.canEdit` is loading.
  const isViewer = task?.viewerRole === 'viewer' && task?.canEdit !== true

  useEffect(() => {
    if (!notice) return
    setError(notice)
    onNoticeShown?.()
  }, [notice, onNoticeShown])

  useEffect(() => {
    if (!task) return

    setStatus(toTaskStatus(task))
    setProgress(task.progress)
    setDependencies(toDependencyTasks(task.dependencies))
    setRecurrence(recurrenceToUi(task.recurrence))
    setSubtaskItems(task.subtasks)
  }, [task])

  useEffect(() => {
    if (!task || !accessToken) return
    let cancelled = false

    getAttachments(accessToken, task.id)
      .then((items) => {
        if (!cancelled) setAttachmentItems(items)
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Unable to load attachments.')
        }
      })

    return () => {
      cancelled = true
    }
  }, [task, accessToken])

  const handleOpenAttachment = useCallback(
    (attachment: ApiTaskAttachment) => {
      if (!task || !accessToken || !attachment.id) return
      setPreviewAttachment(attachment)
    },
    [task, accessToken],
  )

  const handleToggleSubtask = useCallback(
    async (subtask: ApiSubtask) => {
      if (!task || !accessToken) return

      // Optimistic update: flip the subtask and recompute progress locally
      // right away, then reconcile with the server response in the
      // background. Roll back only this subtask if the request fails.
      const nextIsDone = !subtask.isDone
      const previousSubtaskItems = subtaskItems
      const previousProgress = progress
      const optimisticSubtasks: ApiSubtask[] = subtaskItems.map((item) =>
        item.id === subtask.id
          ? { ...item, isDone: nextIsDone, status: nextIsDone ? 'done' : 'todo' }
          : item,
      )
      const optimisticProgress = optimisticSubtasks.length
        ? Math.round((optimisticSubtasks.filter((item) => item.isDone).length / optimisticSubtasks.length) * 100)
        : progress

      setSubtaskItems(optimisticSubtasks)
      setProgress(optimisticProgress)
      setError('')

      try {
        const updatedTask = await updateSubtask(accessToken, task.id, subtask.id, {
          isDone: nextIsDone,
          status: nextIsDone ? 'done' : 'todo',
        })
        setSubtaskItems(updatedTask.subtasks)
        setProgress(updatedTask.progress)
        onTaskUpdated?.(updatedTask)
      } catch (subtaskError) {
        setSubtaskItems(previousSubtaskItems)
        setProgress(previousProgress)
        setError(subtaskError instanceof Error ? subtaskError.message : 'Unable to update subtask.')
      }
    },
    [task, accessToken, subtaskItems, progress, onTaskUpdated],
  )

  const saveStatus = useCallback(
    async (nextStatus: {
      status: TaskStatus
      progress: number
      completionDate?: string
      missedReason?: string
    }) => {
      setStatusSuccess('')

      if (
        isBlocked &&
        (nextStatus.status === 'In Progress' || nextStatus.status === 'Done') &&
        nextStatus.status !== status
      ) {
        setError('This task cannot start until all its dependencies are completed.')
        setIsStatusModalOpen(false)
        return
      }

      const subtasksIncomplete = subtaskItems.length > 0 && completedSubtasksCount < subtaskItems.length
      if (nextStatus.status === 'Done' && subtasksIncomplete) {
        setError('Complete all subtasks before marking this task as Done.')
        setIsStatusModalOpen(false)
        return
      }

      setError('')

      if (task && accessToken) {
        // Optimistic update: reflect the new status/progress immediately and
        // close the sheet right away; roll back if the server rejects it.
        const previousStatus = status
        const previousProgress = progress
        setStatus(nextStatus.status)
        setProgress(nextStatus.progress)
        setIsStatusModalOpen(false)
        setStatusChanging(true)

        const payload = {
          status: toApiStatus(nextStatus.status),
          progress: nextStatus.progress,
          ...(nextStatus.status === 'Done' && nextStatus.completionDate
            ? { completionDate: nextStatus.completionDate }
            : {}),
          ...(nextStatus.status === 'Missed' && nextStatus.missedReason?.trim()
            ? { missedReason: nextStatus.missedReason.trim() }
            : {}),
        }
        try {
          const updatedTask = await changeTaskStatus(accessToken, task.id, payload)
          setStatus(toTaskStatus(updatedTask))
          setProgress(updatedTask.progress)
          setStatusSuccess(`Status updated to ${nextStatus.status}.`)
          onTaskUpdated?.(updatedTask)
        } catch (saveError) {
          setStatus(previousStatus)
          setProgress(previousProgress)
          setError(saveError instanceof Error ? saveError.message : 'Unable to change task status.')
        } finally {
          setStatusChanging(false)
        }
      }
    },
    [isBlocked, status, subtaskItems, completedSubtasksCount, task, accessToken, progress, onTaskUpdated],
  )

  // Inline control: simple statuses apply immediately; Done/Missed open the
  // modal so their metadata (completion date / missed reason) can be captured.
  const openStatusMetadataModal = useCallback((next: TaskStatus) => {
    setStatusSuccess('')
    setStatusModalInitial(next)
    setIsStatusModalOpen(true)
  }, [])

  const changeSimpleStatus = useCallback(
    (next: TaskStatus) => {
      // Keep the existing progress; a plain To Do / In Progress switch doesn't
      // recompute it (the modal is still the place to fine-tune progress).
      void saveStatus({ status: next, progress })
    },
    [saveStatus, progress],
  )

  return (
    <>
      <AppLayout
        active="tasks"
        {...nav}
        onNavigateTasks={onBack}
      >
        <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-2 text-xs text-[var(--bp-muted)]">
          <button type="button" onClick={onBack} className="font-semibold hover:text-[var(--bp-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]">
            {t('taskDetailsCore.tasks')}
          </button>
          <span>/</span>
          <span aria-current="page" className="text-[var(--bp-text)]">{t('taskUi.details.title')}</span>
        </nav>

        <PageHeader
          title={t('taskUi.details.title')}
          subtitle={t('taskUi.details.subtitle')}
          toolbar={
            <TopActionBar pageOnly
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('taskDetailsCore.searchTasks')}
              themeMode={mode}
              onToggleTheme={toggleTheme}
              languageLabel={t('common.languageToggle')}
              onToggleLanguage={toggleLanguage}
              onOpenNotifications={nav.onNavigateNotifications}
              onSignOut={onSignOut}
            />
          }
        />
        {task ? <ExistingScheduleConflict accessToken={accessToken} taskId={task.id} onResolved={onRefresh} /> : null}
        {task ? <TravelWeatherCard token={accessToken} task={task} /> : null}
        {task ? <ExistingTaskTimeConflict accessToken={accessToken} taskId={task.id} onResolved={onRefresh} /> : null}

        <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <TaskStatusBadge status={status} />
                <TaskPriorityBadge priority={task ? toUiPriority(task.priority) : 'Medium'} />
                <Badge color="yellow">{task?.category || 'Uncategorized'}</Badge>
                {task?.isShared || sharedMemberCount > 1 ? (
                  <SharedBadge memberCount={sharedMemberCount || undefined} />
                ) : null}
              </div>
              <h2 className="mb-1.5 text-lg font-black">{task?.title ?? 'No task selected'}</h2>
              <p className="max-w-3xl text-sm leading-6 text-[var(--bp-muted)]">
                {task?.description || 'No description provided.'}
              </p>
            </div>

            {isViewer ? null : (
              <div className="flex shrink-0 flex-wrap gap-2">
                {status === 'Done' && linkedAchievementId && onViewAchievement ? <OutlineButton size="sm" onClick={() => onViewAchievement(linkedAchievementId)}>{t('taskDetailsActions.viewAchievement')}</OutlineButton> : status === 'Done' && onAddToAchievement ? <OutlineButton size="sm" onClick={onAddToAchievement}>{t('taskDetailsActions.addToAchievement')}</OutlineButton> : null}
                <PrimaryButton size="sm" onClick={onEdit}>{t('taskDetailsCore.editTask')}</PrimaryButton>
                <OutlineButton
                  size="sm"
                  onClick={() => {
                    setStatusModalInitial(undefined)
                    setIsStatusModalOpen(true)
                  }}
                >
                  {t('taskDetailsCore.changeStatus')}
                </OutlineButton>
              </div>
            )}
          </div>

          {isViewer ? null : (
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--bp-border)]/70 pt-3">
              <InlineStatusControl
                status={status}
                blocked={isBlocked}
                busy={statusChanging}
                onSimpleChange={changeSimpleStatus}
                onNeedsMetadata={openStatusMetadataModal}
              />
              {statusSuccess ? <span className="text-xs font-semibold text-green-400">{statusSuccess}</span> : null}
            </div>
          )}

          <div className="mt-3 grid gap-2 border-t border-[var(--bp-border)]/70 pt-3 sm:grid-cols-3">
            <InfoBox title={t('taskDetailsMeta.created')} value={formatDate(task?.createdAt, language) || t('taskDetailsMeta.notAvailable')} />
            <InfoBox title={t('taskDetailsMeta.updated')} value={formatDate(task?.updatedAt, language) || t('taskDetailsMeta.notAvailable')} />
            <InfoBox
              title={t('taskForm.dueDate')}
              value={`${formatDate(task?.dueDate, language) || t('taskDetailsMeta.noDueDate')}${task?.dueTime ? ` - ${task.dueTime}` : ''}`}
            />
            <InfoBox title="Scheduled" value={task?.scheduledDate && task.scheduledStartTime ? `${task.scheduledDate} · ${task.scheduledStartTime}–${task.scheduledEndTime ?? 'derived'}` : 'Unscheduled'} />
          </div>
        </section>

        {task && accessToken && currentUserId ? (
          <div className="mt-4 space-y-3">
            {task.isShared || sharedMemberCount > 1 ? (
              <button
                type="button"
                onClick={onOpenAiCollaboration}
                className="flex w-full items-center justify-between rounded-2xl border border-[var(--bp-accent)]/55 bg-gradient-to-r from-[var(--bp-accent)]/[0.16] via-[var(--bp-surface)] to-[var(--bp-surface)] px-4 py-3 text-start shadow-[0_8px_22px_rgba(253,239,75,0.08)] transition hover:shadow-[0_10px_26px_rgba(253,239,75,0.14)]"
              >
                <span>
                  <span className="block text-sm font-black text-[var(--bp-text)]">AI Collaboration</span>
                  <span className="block text-xs text-[var(--bp-muted)]">
                    See today's plan, progress, and fair-split suggestions for the team.
                  </span>
                </span>
                <span className="text-[var(--bp-accent-ink)]">&rarr;</span>
              </button>
            ) : null}
            <CollaborationPanel
              task={task}
              accessToken={accessToken}
              currentUserId={currentUserId}
              onMembersLoaded={setSharedMemberCount}
            />
          </div>
        ) : null}

        {recurrenceSuggestions.length ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {recurrenceSuggestions.map((suggestion) => (
              <RecurrenceSuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onMakeRecurring={(item) => onMakeRecurringSuggestion?.(item)}
                onDismiss={(item) => onDismissRecurrenceSuggestion?.(item)}
              />
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_240px]">
          <section className="space-y-3">
            <SectionBlock title={t('taskDetailsCore.progress')}>
              <div className="mb-2.5 flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-black leading-none text-[var(--bp-text)]">{progress}%</p>
                  <p className="mt-1 text-xs text-[var(--bp-muted)]">
                  {t('taskDetailsCore.subtasksCompleted', { completed: completedSubtasksCount, total: subtaskItems.length })}
                  </p>
                </div>
                <span className="rounded-full border border-[var(--bp-accent)]/45 bg-[var(--bp-accent-soft)] px-2.5 py-1 text-xs font-black text-[var(--bp-accent-ink)]">{t('taskDetailsCore.completion')}</span>
              </div>
              <div role="progressbar" aria-label={t('taskDetailsCore.taskProgress')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-2.5 rounded-full bg-[var(--bp-border)]">
                <div className="h-2.5 rounded-full bg-[var(--bp-accent)] shadow-[0_0_10px_rgba(253,239,75,0.35)]" style={{ width: `${progress}%` }} />
              </div>
            </SectionBlock>

            <div className="grid gap-3 lg:grid-cols-2">
              <SectionBlock
                className="flex h-[640px] flex-col"
                title="Subtasks"
                subtitle={`${visibleCompletedCount} of ${visibleSubtasks.length} completed`}
              >
                {subtaskItems.length ? (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="sticky top-0 z-10 -mx-1 mb-2 bg-[var(--bp-surface)] px-1 pb-1">
                      <SubtaskVisibilityFilter
                        filter={subtaskFilter}
                        onFilterChange={setSubtaskFilter}
                        isOwner={isOwner}
                        memberOptions={memberOptions}
                        memberId={subtaskMemberId}
                        onMemberChange={setSubtaskMemberId}
                      />
                    </div>
                    {visibleSubtasks.length ? (
                      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]">
                        <div className="divide-y divide-[var(--bp-border)]/60 overflow-hidden rounded-xl border border-[var(--bp-border)]/70 bg-[var(--bp-bg)]">
                        {visibleSubtasks.map((item) => (
                          <Subtask
                            key={item.id}
                            subtask={item}
                            canEdit={!isViewer}
                            onToggle={handleToggleSubtask}
                            onOpen={() => setDetailSubtaskId(item.id)}
                          />
                        ))}
                        </div>
                      </div>
                    ) : (
                      <EmptyBlock className="flex flex-1 items-center justify-center"
                        title="No subtasks in this view"
                        description="Try a different filter to see more subtasks."
                      />
                    )}
                  </div>
                ) : (
                  <EmptyBlock className="flex flex-1 items-center justify-center" title="No subtasks yet" description="Steps will appear here once added from Edit Task." />
                )}
              </SectionBlock>

              <SectionBlock className="flex h-[640px] flex-col" title="Dependencies">
                {dependencies.length ? (
                  <>
                    <div
                      className={`mb-3 rounded-xl border px-3 py-2 text-xs font-semibold ${
                        dependenciesComplete
                          ? 'border-green-500/30 bg-green-500/10 text-green-300'
                          : 'border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/10 text-[var(--bp-accent-ink)]'
                      }`}
                    >
                      {dependenciesComplete
                        ? 'All dependencies are completed. This task is ready to start.'
                        : 'This task cannot start until all dependencies are completed.'}
                    </div>
                    <div className="divide-y divide-[var(--bp-border)]/70 overflow-hidden rounded-xl border border-[var(--bp-border)]/70 bg-[var(--bp-bg)]">
                      {dependencies.map((dependency) => (
                        <Dependency key={dependency.id} task={dependency} />
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyBlock className="flex flex-1 items-center justify-center" title="No dependencies" description="Tasks that must finish first will appear here." />
                )}
              </SectionBlock>
            </div>

            <div className="space-y-3 rounded-2xl border border-[var(--bp-border)]/60 bg-[var(--bp-surface)]/45 p-2">
            <div className="grid gap-2 lg:grid-cols-2">
              <SectionBlock tone="grouped" title="Recurring">
                <RecurrenceDetails
                  recurrence={recurrence}
                  nextOccurrenceDate={task?.recurrence?.nextOccurrenceDate}
                  dueTime={task?.dueTime}
                />
              </SectionBlock>
              <SectionBlock tone="grouped" title="Automation">
                <div className="divide-y divide-[var(--bp-border)]">
                  <AutomationRow label={t('createTask.reminder')} value={reminderText} />
                  <AutomationRow label={t('taskDetailsMeta.focus')} value={focusText} />
                </div>
              </SectionBlock>

              <SectionBlock tone="grouped" title="Notes">
                <p className="text-sm leading-6 text-[var(--bp-muted)]">{task?.notes || 'No notes yet.'}</p>
              </SectionBlock>
            </div>

            <div className="grid gap-2 lg:grid-cols-2">
              <SectionBlock tone="grouped" title="Time Tracking">
                <div className="divide-y divide-[var(--bp-border)]">
                  <AutomationRow label={t('taskDetailsMeta.estimated')} value={t('taskDetailsMeta.hours', { count: task?.estimatedHours ?? 0 })} />
                  <AutomationRow label={t('taskDetailsMeta.spent')} value={t('taskDetailsMeta.hours', { count: task?.spentHours ?? 0 })} />
                  <AutomationRow label={t('taskDetailsMeta.remaining')} value={t('taskDetailsMeta.hours', { count: task?.remainingHours ?? 0 })} />
                </div>
              </SectionBlock>

              <SectionBlock tone="grouped" title="Attachments" subtitle={`${attachmentItems.length} files`}>
                {attachmentItems.length ? (
                  <div className="space-y-2">
                    {attachmentItems.map((file, index) => (
                      <Attachment key={file.id ?? `${file.fileName ?? file.name}-${index}`} file={file} onOpen={handleOpenAttachment} />
                    ))}
                  </div>
                ) : (
                  <EmptyBlock title="No attachments" description="Files added from Edit Task will appear here." />
                )}
              </SectionBlock>
            </div>
            </div>
          </section>

          <aside className="hidden xl:block">
            <SectionBlock title={t('taskDetailsMeta.details')}>
              <div className="divide-y divide-[var(--bp-border)]">
                <MetaRow label={t('taskForm.status')} value={t(`taskLabels.status.${status === 'To Do' ? 'todo' : status === 'In Progress' ? 'inProgress' : status.toLowerCase()}`)} color="blue" />
                <MetaRow
                  label={t('taskForm.priority')}
                  value={t(`taskLabels.priority.${(task ? toUiPriority(task.priority) : 'Medium').toLowerCase()}`)}
                  color={priorityMetaColor(task?.priority)}
                />
                <MetaRow label={t('createTask.category')} value={task?.category || t('taskDetailsMeta.uncategorized')} color="yellow" />
                <MetaRow
                  label={t('taskForm.dueDate')}
                  value={formatDate(task?.dueDate, language) || t('taskDetailsMeta.noDueDate')}
                  secondaryValue={task?.dueTime || t('taskDetailsMeta.noDueTime')}
                />
              </div>
            </SectionBlock>
          </aside>
        </div>
        {!isViewer ? <section className="mt-6 border-t border-red-500/25 pt-4"><p className="mb-2 text-xs font-black uppercase tracking-wide text-red-400">{t('taskDetailsActions.dangerZone')}</p><DangerButton size="sm" onClick={openDeleteDialog}>{t('taskDetailsActions.deleteTask')}</DangerButton></section> : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
            {error}
          </p>
        ) : null}
      </AppLayout>
      <TaskStatusWorkflowModal
        open={isStatusModalOpen}
        status={status}
        initialStatus={statusModalInitial}
        progress={progress}
        hasSubtasks={subtaskItems.length > 0}
        subtasksComplete={subtaskItems.length === 0 || completedSubtasksCount === subtaskItems.length}
        subtaskProgress={subtaskItems.length ? Math.round((completedSubtasksCount / subtaskItems.length) * 100) : 0}
        completedSubtasksCount={completedSubtasksCount}
        totalSubtasksCount={subtaskItems.length}
        onClose={() => {
          setIsStatusModalOpen(false)
          setStatusModalInitial(undefined)
        }}
        onSave={(nextStatus) => void saveStatus(nextStatus)}
      />
      <AttachmentPreviewModal
        open={Boolean(previewAttachment && task && accessToken)}
        accessToken={accessToken}
        taskId={task?.id ?? ''}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        onError={setError}
      />
      {task && detailSubtask ? (
        <SubtaskDetailModal
          task={{ ...task, subtasks: subtaskItems }}
          subtask={detailSubtask}
          accessToken={accessToken}
          canEdit={!isViewer}
          onClose={() => setDetailSubtaskId(null)}
          onEdit={() => {
            setEditSubtaskId(detailSubtask.id)
            setDetailSubtaskId(null)
          }}
          onTaskUpdated={syncTaskFromModal}
        />
      ) : null}
      {task && editSubtask && !isViewer ? (
        <SubtaskFormModal
          mode="edit"
          siblings={subtaskItems.filter((item) => item.id !== editSubtask.id)}
          initialSubtask={editSubtask}
          onCancel={() => setEditSubtaskId(null)}
          onBack={() => setEditSubtaskId(null)}
          onSubmit={async (payload) => {
            try {
              const updated = await updateSubtask(accessToken, task.id, editSubtask.id, payload)
              syncTaskFromModal(updated)
              setEditSubtaskId(null)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Unable to update subtask.')
            }
          }}
        />
      ) : null}
      {isDeleteDialogOpen ? (
        <DeleteTaskModal
          taskTitle={task?.title}
          error={deleteError}
          isDeleting={isDeletingTask}
          onCancel={closeDeleteDialog}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/20 text-blue-400',
    red: 'bg-red-500/20 text-red-400',
    yellow: 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]',
    green: 'bg-green-500/20 text-green-400',
    purple: 'bg-purple-500/20 text-purple-400',
  }

  return <span className={`rounded-md px-2 py-1 text-xs font-bold ${colors[color]}`}>{children}</span>
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg bg-[var(--bp-bg)] px-3 py-2.5">
      <p className="text-[10px] font-black uppercase text-[var(--bp-muted)]">{title}</p>
      <p className="mt-1 text-sm font-bold text-[var(--bp-text)]">{value}</p>
    </div>
  )
}

function SectionBlock({
  title,
  subtitle,
  children,
  tone = 'default',
  className = '',
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  tone?: 'default' | 'grouped'
  className?: string
}) {
  return (
    <section className={`${tone === 'grouped' ? 'rounded-xl px-3 py-3 transition-colors duration-200 hover:bg-[var(--bp-surface)]/70' : 'rounded-2xl border border-[var(--bp-border)]/65 bg-[var(--bp-surface)]/90 p-4 shadow-sm transition-shadow duration-200 hover:shadow-md'} ${className}`}>
      <div className="mb-2.5">
        <h3 className="text-sm font-black">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-[var(--bp-muted)]">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function EmptyBlock({ title, description, className = '' }: { title: string; description: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-dashed border-[var(--bp-border)]/75 bg-[var(--bp-bg)]/70 px-4 py-3 text-center ${className}`}>
      <div>
        <p className="text-sm font-black text-[var(--bp-text)]">{title}</p>
        <p className="mt-1 text-xs text-[var(--bp-muted)]">{description}</p>
      </div>
    </div>
  )
}

function RecurrenceDetails({
  recurrence,
  nextOccurrenceDate,
  dueTime,
}: {
  recurrence: UiRecurrence | null
  nextOccurrenceDate?: string | null
  dueTime?: string
}) {
  if (!recurrence || recurrence.frequency === 'Never') {
    return (
      <EmptyBlock
        title="Not a recurring task"
        description="Set a repeat schedule from Edit Task to see it here."
      />
    )
  }

  const daysValue = formatRecurrenceWeekdays(recurrence.weekdays)
  const nextOccurrence = formatOccurrence(nextOccurrenceDate, dueTime)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <InfoBox title="Frequency" value={formatRecurrenceFrequency(recurrence)} />
      {daysValue ? <InfoBox title="Days" value={daysValue} /> : null}
      <InfoBox title="Ends" value={formatRecurrenceEnd(recurrence)} />
      <InfoBox title="Next occurrence" value={nextOccurrence || 'No upcoming occurrences'} />
    </div>
  )
}

const WEEKDAY_ORDER = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

function formatRecurrenceFrequency(recurrence: UiRecurrence) {
  if (recurrence.frequency === 'Custom') {
    const unit =
      recurrence.customInterval === 1 ? recurrence.customUnit.replace(/s$/, '') : recurrence.customUnit
    return `Every ${recurrence.customInterval} ${unit}`
  }
  return recurrence.frequency
}

function formatRecurrenceWeekdays(weekdays: string[]) {
  return [...weekdays]
    .sort((a, b) => WEEKDAY_ORDER.indexOf(a) - WEEKDAY_ORDER.indexOf(b))
    .join(' • ')
}

function formatRecurrenceEnd(recurrence: UiRecurrence) {
  if (recurrence.endType === 'onDate' && recurrence.endDate) {
    return formatLocaleDate(recurrence.endDate) || 'Never ends'
  }
  if (recurrence.endType === 'after' && recurrence.occurrences > 0) {
    return `After ${recurrence.occurrences} occurrence${recurrence.occurrences === 1 ? '' : 's'}`
  }
  return 'Never ends'
}

function AutomationRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <span className="text-sm font-bold text-[var(--bp-text)]">{label}</span>
      <span className="text-end text-xs text-[var(--bp-muted)]">{value}</span>
    </div>
  )
}

const Subtask = memo(function Subtask({
  subtask,
  canEdit = true,
  onToggle,
  onOpen,
}: {
  subtask: ApiSubtask
  canEdit?: boolean
  onToggle: (subtask: ApiSubtask) => void
  onOpen: () => void
}) {
  const done = subtask.isDone || subtask.status === 'done'
  const indicator = getSubtaskIndicator(subtask)
  const meta = SUBTASK_INDICATOR_META[indicator]
  const estimate = formatDuration(subtask.estimatedDurationMinutes)
  const due = formatSubtaskDue(subtask.dueDate)

  return (
    <div className="group flex items-start gap-2.5 px-3 py-2 transition hover:bg-[var(--bp-border)]/20">
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => onToggle(subtask)}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[8px] font-black disabled:cursor-not-allowed ${
          done ? 'border-green-400 bg-green-400 text-black' : 'border-slate-500'
        }`}
        aria-label={done ? 'Mark subtask incomplete' : 'Mark subtask complete'}
      >
        {done ? '✓' : ''}
      </button>

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-start">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} aria-hidden title={meta.label} />
          <span
            className={`truncate text-sm font-semibold ${done ? 'text-[var(--bp-muted)] line-through' : 'text-[var(--bp-text)]'}`}
          >
            {displaySubtaskTitle(subtask)}
          </span>
          {subtask.isShared ? <SharedBadge /> : null}
        </div>

        {subtask.assigneeUserId && subtask.assignee ? (
          <p className="mt-1 text-xs text-[var(--bp-muted)]">Assigned to {subtask.assignee}</p>
        ) : !subtask.assigneeUserId && !subtask.isShared ? (
          <p className="mt-1 text-xs text-[var(--bp-muted)]">Unassigned</p>
        ) : null}

        {(due || estimate) && !done ? (
          <p className="mt-1 text-xs text-[var(--bp-muted)]">
            {due}
            {due && estimate ? ' • ' : ''}
            {estimate ? `Est. ${estimate}` : ''}
          </p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <TaskPriorityBadge priority={subtask.priority} />
          <TaskStatusBadge status={subtask.status} />
          {subtask.isFocusTask ? (
            <span className="rounded-md bg-[var(--bp-accent)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--bp-accent-ink)]">
              🎯 Focus
            </span>
          ) : null}
          {subtask.estimatedDurationSource === 'ai' && subtask.estimatedDurationMinutes ? (
            <span className="rounded-md bg-[var(--bp-accent)]/15 px-1.5 py-0.5 text-xs font-bold text-[var(--bp-accent-ink)]">
              AI Estimate
            </span>
          ) : null}
        </div>
      </button>

      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open subtask: ${subtask.title}`}
        className="shrink-0 self-center rounded-lg border border-[var(--bp-border)] px-2 py-0.5 text-xs font-bold text-[var(--bp-muted)] transition hover:text-[var(--bp-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]"
      >
        Open
      </button>
    </div>
  )
})

function formatSubtaskDue(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (sameDay) return `Today • ${time}`
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • ${time}`
}

const Dependency = memo(function Dependency({ task }: { task: DependencyTask }) {
  return (
    <div className="grid w-full gap-2 rounded-xl bg-[var(--bp-bg)] px-3 py-2 md:grid-cols-[1fr_auto]">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dependencyDotColor(task.status)}`} />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[var(--bp-text)]">{task.title}</p>
          <p className="mt-0.5 text-xs text-[var(--bp-muted)]">
            {task.category} - Due {task.dueDate}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
        <TaskStatusBadge status={task.status} />
        <TaskPriorityBadge priority={task.priority} />
      </div>
    </div>
  )
})

function dependencyDotColor(status: DependencyTask['status']) {
  if (status === 'Done') return 'bg-green-400'
  if (status === 'Missed' || status === 'Blocked') return 'bg-red-400'
  if (status === 'In Progress') return 'bg-blue-400'
  return 'bg-slate-400'
}

function priorityMetaColor(priority?: ApiTask['priority']) {
  if (priority === 'low') return 'green'
  if (priority === 'medium') return 'yellow'
  return 'red'
}

const Attachment = memo(function Attachment({
  file,
  onOpen,
}: {
  file: ApiTaskAttachment
  onOpen?: (file: ApiTaskAttachment) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen?.(file)}
      className="flex w-full items-center gap-3 rounded-xl bg-[var(--bp-bg)] p-2.5 text-start transition hover:bg-[var(--bp-border)]/30"
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[9px] font-black text-white ${attachmentColor(file.fileType ?? file.type, file.fileName ?? file.name)}`}>
        {attachmentLabel(file.fileType ?? file.type, file.fileName ?? file.name)}
      </span>
      <span className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--bp-text)]">{file.fileName ?? file.name}</p>
        <p className="text-xs text-[var(--bp-muted)]">
          {formatFileSize(file.fileSize ?? file.size) || (file.fileType ?? file.type) || 'Attached file'}
        </p>
      </span>
    </button>
  )
})

function formatFileSize(size?: string | number) {
  const bytes = typeof size === 'string' ? Number(size) : size
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function attachmentLabel(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLocaleLowerCase()
  if (normalized.includes('pdf')) return 'PDF'
  if (normalized.includes('image') || normalized.match(/\.(png|jpe?g|gif|webp)$/)) return 'IMG'
  if (normalized.match(/\.(docx?|txt)$/) || normalized.includes('word')) return 'DOC'
  if (normalized.match(/\.(xlsx?|csv)$/) || normalized.includes('sheet') || normalized.includes('excel')) return 'XLS'
  if (normalized.match(/\.(pptx?)$/) || normalized.includes('powerpoint')) return 'SLD'
  return 'FILE'
}

function attachmentColor(type?: string, fileName?: string) {
  const normalized = `${type ?? ''} ${fileName ?? ''}`.toLocaleLowerCase()
  if (normalized.includes('pdf')) return 'bg-red-500'
  if (normalized.includes('image') || normalized.includes('jpg') || normalized.includes('png')) return 'bg-green-500'
  if (normalized.includes('sheet') || normalized.includes('excel') || normalized.includes('csv')) return 'bg-blue-500'
  if (normalized.includes('word') || normalized.includes('doc')) return 'bg-indigo-500'
  return 'bg-orange-500'
}

function MetaRow({
  label,
  value,
  secondaryValue,
  color,
}: {
  label: string
  value: string
  secondaryValue?: string
  color?: 'red' | 'blue' | 'yellow' | 'green'
}) {
  const valueColor =
    color === 'red' ? 'text-red-400' : color === 'blue' ? 'text-blue-400' : color === 'yellow' ? 'text-[var(--bp-accent-ink)]' : color === 'green' ? 'text-[var(--bp-success)]' : 'text-[var(--bp-text)]'

  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">{label}</p>
      <div className="min-w-0 text-end">
        <span className={`inline-flex rounded-full bg-[var(--bp-bg)] px-2 py-0.5 text-xs font-bold ${valueColor}`}>{value}</span>
        {secondaryValue ? <p className="mt-0.5 text-xs text-[var(--bp-muted)]">{secondaryValue}</p> : null}
      </div>
    </div>
  )
}

function toTaskStatus(task?: ApiTask | null): TaskStatus {
  return task ? (toUiStatus(task.status) as TaskStatus) : 'In Progress'
}

function toDependencyTasks(items: ApiTask[] | ApiTask['dependencies']): DependencyTask[] {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category || 'General',
    status: toUiStatus(item.status) as DependencyTask['status'],
    dueDate: formatDate(item.dueDate) || 'No due date',
    priority: normalizeDependencyPriority(toUiPriority(item.priority)),
  }))
}

function normalizeDependencyPriority(priority: string): DependencyTask['priority'] {
  if (priority === 'Low' || priority === 'High') return priority
  return 'Medium'
}

function formatDate(value?: string, language: 'en' | 'ar' = 'en') {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

// Anchor date-only strings (YYYY-MM-DD) to local midnight so locale formatting
// doesn't shift them across a day boundary in the user's timezone.
function toLocalDate(value?: string | null) {
  if (!value) return null
  const raw = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatLocaleDate(value?: string | null) {
  const date = toLocalDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function formatClockTime(time?: string) {
  if (!time) return ''
  const match = /^(\d{1,2}):(\d{2})/.exec(time)
  if (!match) return ''
  const date = new Date()
  date.setHours(Number(match[1]), Number(match[2]), 0, 0)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date)
}

function formatOccurrence(value?: string | null, time?: string) {
  const date = toLocalDate(value)
  if (!date) return ''
  const datePart = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
  const timePart = formatClockTime(time)
  return timePart ? `${datePart} • ${timePart}` : datePart
}
