import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import { OutlineButton, PrimaryButton, SecondaryButton } from '../components/layout/Buttons'
import { ScheduleConflictModal } from '../components/ScheduleConflictModal'
import { ExistingTaskTimeConflict } from '../components/ExistingTaskTimeConflict'
import { TaskTimeConflictModal, type ScheduleChoice } from '../components/TaskTimeConflictModal'
import { changeTaskStatus, getNearestTaskSchedule, resolveTaskScheduleConflict, updateTask, type TaskTimeConflict } from '../lib/tasksApi'
import { useLanguage } from '../i18n/LanguageContext'
import {
  acceptDailyPlan,
  generateDailyPlan,
  getDailyPlannerCandidates,
  saveDailyPlannerSelection,
  getDailyPlanAcceptance,
  getPlannerPreferences,
  updatePlannerPreferences,
  skipCommitmentOccurrence,
  resolveScheduleConflict,
  type CapacitySummary,
  type DailyPlan,
  type DailyPlanItem,
  type PlanAcceptance,
  type PlannerPreferences,
  type ScheduleConflict,
  type PostponeStatus,
  type UnscheduledItem,
  type PlannerCandidates,
} from '../lib/plannerApi'
import { useTheme } from '../theme/ThemeContext'

type AiPlannerScreenProps = SidebarNavHandlers & {
  accessToken: string
  refreshKey?: number
  completedTaskIds?: Set<string>
  onCompleteTask?: (taskId: string) => Promise<void> | void
  onSignOut?: () => void
}

type SectionKey = 'morning' | 'afternoon' | 'evening' | 'night'
type ViewMode = 'simple' | 'detailed'

const SECTION_META: Record<SectionKey, { title: string; emoji: string; tint: string; accent: string }> = {
  morning: { title: 'Morning', emoji: '🌅', tint: 'bg-amber-400/[0.06]', accent: 'text-amber-300' },
  afternoon: { title: 'Afternoon', emoji: '☀️', tint: 'bg-sky-400/[0.06]', accent: 'text-sky-300' },
  evening: { title: 'Evening', emoji: '🌇', tint: 'bg-orange-400/[0.06]', accent: 'text-orange-300' },
  night: { title: 'Night', emoji: '🌙', tint: 'bg-indigo-400/[0.06]', accent: 'text-indigo-300' },
}

const planCache = new Map<string, { plan: DailyPlan; accepted: boolean }>()

function planCacheKey(accessToken: string, date: string) {
  return `${accessToken}:${date}`
}

export function conflictForItem(item: DailyPlanItem, plan: DailyPlan): ScheduleConflict | null {
  if (item.type !== 'task') return null
  const taskStart = toMinutes(item.startTime)
  const taskEnd = toMinutes(item.endTime)
  if (taskStart === null || taskEnd === null) return null
  for (const commitment of Object.values(plan.sections).flat()) {
    if (commitment.type !== 'calendar' || commitment.category !== 'Commitment') continue
    const commitmentStart = toMinutes(commitment.startTime)
    const commitmentEnd = toMinutes(commitment.endTime)
    if (commitmentStart === null || commitmentEnd === null) continue
    const conflictMinutes = Math.max(
      0,
      Math.min(taskEnd, commitmentEnd) - Math.max(taskStart, commitmentStart),
    )
    if (conflictMinutes === 0) continue
    return {
      id: `${item.id}:${commitment.id}`,
      task: {
        itemId: item.id,
        taskId: item.taskId,
        subtaskId: item.subtaskId,
        title: item.title,
        startTime: item.startTime,
        endTime: item.endTime,
        durationMinutes: item.durationMinutes,
        isFocusTask: Boolean(item.isFocusTask),
      },
      commitment: {
        id: commitment.id.replace(/^commitment-/, ''),
        title: commitment.title,
        startTime: commitment.startTime,
        endTime: commitment.endTime,
      },
      conflictMinutes,
    }
  }
  return null
}

export function taskConflictForItem(item: DailyPlanItem, plan: DailyPlan): TaskTimeConflict | null {
  if (item.type !== 'task') return null
  const start = toMinutes(item.startTime)
  const end = toMinutes(item.endTime)
  if (start === null || end === null) return null
  for (const existing of Object.values(plan.sections).flat()) {
    if (existing.type !== 'task' || existing.id === item.id) continue
    const existingStart = toMinutes(existing.startTime)
    const existingEnd = toMinutes(existing.endTime)
    if (existingStart === null || existingEnd === null) continue
    const overlapMinutes = Math.max(0, Math.min(end, existingEnd) - Math.max(start, existingStart))
    if (!overlapMinutes) continue
    const candidate = (value: DailyPlanItem) => ({ id: value.subtaskId ?? value.taskId ?? value.id, title: value.title, priority: value.priority, dueDate: null, durationMinutes: value.durationMinutes, scheduledDate: plan.date, scheduledStartTime: value.startTime, scheduledEndTime: value.endTime })
    const existingTask = candidate(existing)
    const proposedTask = candidate(item)
    return { id: `task:${existingTask.id}:${plan.date}:${existing.startTime}-${existing.endTime}|task:${proposedTask.id}:${plan.date}:${item.startTime}-${item.endTime}`, existingTask, proposedTask, overlapMinutes }
  }
  return null
}

export default function AiPlannerScreen({
  accessToken,
  refreshKey = 0,
  completedTaskIds = new Set(),
  onCompleteTask,
  onSignOut,
  ...nav
}: AiPlannerScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState<DailyPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState('')
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('simple')
  const [preferences, setPreferences] = useState<PlannerPreferences | null>(null)
  const [lockedItems, setLockedItems] = useState<Record<string, DailyPlanItem>>({})
  const [pendingConflict, setPendingConflict] = useState<{
    conflict: ScheduleConflict
    proposedPlan: DailyPlan
    proposedItem?: DailyPlanItem
    oldTime?: { startTime: string; endTime: string }
  } | null>(null)
  const [resolvingConflict, setResolvingConflict] = useState(false)
  const [dismissedConflict, setDismissedConflict] = useState<ScheduleConflict | null>(null)
  const [candidatePickerOpen, setCandidatePickerOpen] = useState(false)
  const [candidates, setCandidates] = useState<PlannerCandidates | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [selectionMode, setSelectionMode] = useState<'selectedOnly' | 'selectedPlusAutoFill'>('selectedOnly')
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidateFilter, setCandidateFilter] = useState<'all' | 'today' | 'overdue' | 'upcoming' | 'unscheduled'>('all')
  const [pendingTaskConflict, setPendingTaskConflict] = useState<{ conflict: TaskTimeConflict; proposedItem: DailyPlanItem } | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const allItems = useMemo(() => (plan ? Object.values(plan.sections).flat() : []), [plan])
  const lockedPayload = useMemo(
    () =>
      Object.values(lockedItems).map((item) => ({
        taskId: item.taskId,
        reminderId: item.reminderId,
        startTime: item.startTime,
        endTime: item.endTime,
      })),
    [lockedItems],
  )
  const plannedMinutes = allItems
    .filter((item) => item.type === 'task')
    .reduce((sum, item) => sum + item.durationMinutes, 0)
  const completedCount = allItems.filter((item) => item.taskId && completedTaskIds.has(item.taskId)).length
  const taskCount = allItems.filter((item) => item.type === 'task').length
  const nowMinutes = toMinutes(currentTime())

  const insights = useMemo(() => buildInsights(plan, completedTaskIds, lockedItems), [plan, completedTaskIds, lockedItems])
  const validation = useMemo(() => buildValidation(plan, lockedItems), [plan, lockedItems])

  useEffect(() => {
    void initializePlan()
  }, [accessToken, refreshKey])

  useEffect(() => {
    if (!accessToken || !plan) return
    planCache.set(planCacheKey(accessToken, plan.date), { plan, accepted })
  }, [accessToken, accepted, plan])

  useEffect(() => {
    if (!accessToken) return
    let active = true
    getPlannerPreferences(accessToken)
      .then((prefs) => {
        if (active) setPreferences(prefs)
      })
      .catch(() => {
        /* preferences are optional — the planner still works without them */
      })
    return () => {
      active = false
    }
  }, [accessToken])

  async function savePreferences(next: PlannerPreferences): Promise<{ ok: boolean; message: string }> {
    try {
      const saved = await updatePlannerPreferences(accessToken, next)
      setPreferences(saved)
      return { ok: true, message: 'Preferences saved — click Generate Smart Plan to apply them.' }
    } catch (saveError) {
      return { ok: false, message: saveError instanceof Error ? saveError.message : 'Failed to save preferences.' }
    }
  }

  /**
   * On first load, show whatever the user already accepted for today (so
   * "Accept Plan" survives navigation/reload) instead of silently replacing
   * it with a freshly generated plan. Only Generate/Regenerate/Reset should
   * produce a new plan.
   */
  async function initializePlan() {
    if (!accessToken) return

    const cached = planCache.get(planCacheKey(accessToken, today))
    if (cached) {
      setPlan(cached.plan)
      setAccepted(cached.accepted)
      return
    }

    setLoading(true)
    setError('')
    setAcceptError('')
    try {
      let acceptance: PlanAcceptance | null = null
      try {
        acceptance = await getDailyPlanAcceptance(accessToken, today)
      } catch {
        acceptance = null
      }

      if (acceptance) {
        setPlan(acceptance.plan)
        setAccepted(true)
        planCache.set(planCacheKey(accessToken, today), { plan: acceptance.plan, accepted: true })
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load an existing plan.')
    } finally {
      setLoading(false)
    }
  }

  async function loadPlan(lockedOverride?: typeof lockedPayload, selection?: { mode: 'selectedOnly' | 'selectedPlusAutoFill'; selectedItems: { taskId: string; subtaskId?: string | null }[] }) {
    if (!accessToken) return

    // Regeneration creates a pending draft, so discard the prior accepted
    // cache entry before fetching it.
    planCache.delete(planCacheKey(accessToken, today))
    setLoading(true)
    setError('')
    setAcceptError('')
    setAccepted(false)
    try {
      const nextPlan = await generateDailyPlan(accessToken, {
        date: today,
        regenerate: Boolean(plan),
        currentTime: currentTime(),
        lockedItems: lockedOverride ?? lockedPayload,
        ...(selection ?? {}),
      })
      if (nextPlan.conflicts?.length) {
        setPendingConflict({ conflict: nextPlan.conflicts[0], proposedPlan: nextPlan })
        return
      }
      setPlan(nextPlan)
      setAccepted(false)
      planCache.set(planCacheKey(accessToken, nextPlan.date), { plan: nextPlan, accepted: false })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to generate today\'s plan.')
    } finally {
      setLoading(false)
    }
  }

  async function acceptPlan() {
    if (!accessToken || !plan || accepting) return

    setAccepting(true)
    setAcceptError('')
    try {
      const saved = await acceptDailyPlan(accessToken, plan)
      setPlan(saved.plan)
      setAccepted(true)
      planCache.set(planCacheKey(accessToken, saved.date), { plan: saved.plan, accepted: true })
    } catch (acceptErr) {
      setAcceptError(acceptErr instanceof Error ? acceptErr.message : 'Unable to accept plan.')
    } finally {
      setAccepting(false)
    }
  }

  async function openCandidatePicker() {
    setCandidatePickerOpen(true)
    try {
      const next = await getDailyPlannerCandidates(accessToken, today)
      setCandidates(next)
      setSelectedKeys(new Set(next.selectedItems.map((item) => `${item.taskId}:${item.subtaskId ?? ''}`)))
    } catch (pickerError) {
      setError(pickerError instanceof Error ? pickerError.message : 'Unable to load what can be scheduled today.')
    }
  }

  async function generateFromSelection() {
    if (!candidates) return
    const selectedItems = candidates.items.filter((item) => selectedKeys.has(`${item.taskId}:${item.subtaskId ?? ''}`)).map((item) => ({ taskId: item.taskId, subtaskId: item.subtaskId }))
    await saveDailyPlannerSelection(accessToken, { date: today, selectedItems })
    setCandidatePickerOpen(false)
    await loadPlan(undefined, { mode: selectionMode, selectedItems })
  }

  function resetPlan() {
    setLockedItems({})
    setPlan(null)
    setAccepted(false)
    setAcceptError('')
    setError('')
    if (accessToken) planCache.delete(planCacheKey(accessToken, planDate))
  }

  function toggleLock(item: DailyPlanItem) {
    setLockedItems((current) => {
      const next = { ...current }
      const key = itemKey(item)
      if (next[key]) delete next[key]
      else next[key] = { ...item, locked: true }
      return next
    })
  }

  function moveItem(item: DailyPlanItem, field: 'startTime' | 'endTime', value: string) {
    const key = itemKey(item)
    const proposedItem = { ...(lockedItems[key] ?? item), [field]: value, locked: true }
    if (!plan) return
    const proposedPlan = updatePlanItem(plan, item, field, value)
    const conflict = conflictForItem(proposedItem, plan)
    if (conflict) {
      setPendingConflict({
        conflict,
        proposedPlan,
        proposedItem,
        oldTime: { startTime: item.startTime, endTime: item.endTime },
      })
      return
    }
    const taskConflict = plan ? taskConflictForItem(proposedItem, plan) : null
    if (taskConflict) {
      setPendingTaskConflict({ conflict: taskConflict, proposedItem })
      return
    }
    setLockedItems((current) => ({ ...current, [key]: proposedItem }))
    setPlan(proposedPlan)
  }

  function dragItem(item: DailyPlanItem, startTime: string) {
    const start = toMinutes(startTime)
    if (start === null) return
    const endTime = minutesToClock(start + item.durationMinutes)
    const withStart = updatePlanItem(plan!, item, 'startTime', startTime)
    const proposedPlan = updatePlanItem(withStart, item, 'endTime', endTime)
    const proposedItem = { ...item, startTime, endTime, locked: true }
    const conflict = conflictForItem(proposedItem, plan!)
    if (conflict) {
      setPendingConflict({
        conflict,
        proposedPlan,
        proposedItem,
        oldTime: { startTime: item.startTime, endTime: item.endTime },
      })
      return
    }
    const taskConflict = plan ? taskConflictForItem(proposedItem, plan) : null
    if (taskConflict) {
      setPendingTaskConflict({ conflict: taskConflict, proposedItem })
      return
    }
    setLockedItems((current) => ({ ...current, [itemKey(item)]: proposedItem }))
    setPlan(proposedPlan)
  }

  async function keepCommitment() {
    if (!pendingConflict) return
    setResolvingConflict(true)
    try {
        const conflictItemId = pendingConflict.conflict.task.itemId
        const remainingLocks = allItems
          .filter((item) => (item.type === 'task' || item.type === 'reminder') && item.id !== conflictItemId)
          .map((item) => ({
            itemId: item.id,
            taskId: item.taskId,
            reminderId: item.reminderId,
            title: item.title,
            startTime: item.startTime,
            endTime: item.endTime,
          }))
      const next = await generateDailyPlan(accessToken, {
        date: planDate,
        currentTime: currentTime(),
        lockedItems: remainingLocks,
      })
      setLockedItems((current) =>
        Object.fromEntries(
            Object.entries(current).filter(([itemId]) => itemId !== conflictItemId),
        ),
      )
      setPlan(next)
      await resolveScheduleConflict(accessToken, { conflictKey: pendingConflict.conflict.id, date: planDate, taskId: pendingConflict.conflict.task.taskId, commitmentId: pendingConflict.conflict.commitment.id, resolution: 'keep_commitment' })
      setPendingConflict(null)
      setDismissedConflict(null)
    } finally {
      setResolvingConflict(false)
    }
  }

  async function keepTask() {
    if (!pendingConflict) return
    setResolvingConflict(true)
    try {
      await skipCommitmentOccurrence(
        accessToken,
        pendingConflict.conflict.commitment.id,
        planDate,
      )
      await resolveScheduleConflict(accessToken, { conflictKey: pendingConflict.conflict.id, date: planDate, taskId: pendingConflict.conflict.task.taskId, commitmentId: pendingConflict.conflict.commitment.id, resolution: 'keep_task' })
      if (pendingConflict.proposedItem) {
        const key = itemKey(pendingConflict.proposedItem)
        setLockedItems((current) => ({ ...current, [key]: pendingConflict.proposedItem! }))
      }
      setPlan({ ...pendingConflict.proposedPlan, conflicts: [] })
      setPendingConflict(null)
      setDismissedConflict(null)
    } finally {
      setResolvingConflict(false)
    }
  }

  async function moveTaskConflict(side: 'existing' | 'new', mode: 'auto' | 'manual', manual?: ScheduleChoice) {
    if (!pendingTaskConflict) return
    const target = side === 'existing' ? pendingTaskConflict.conflict.existingTask : pendingTaskConflict.conflict.proposedTask
    const schedule = mode === 'manual' ? manual : (await getNearestTaskSchedule(accessToken, target)).schedule
    if (!schedule || !window.confirm(`Current schedule → Proposed schedule\n${target.scheduledDate} ${target.scheduledStartTime}–${target.scheduledEndTime} → ${schedule.scheduledDate} ${schedule.scheduledStartTime}–${schedule.scheduledEndTime}`)) return
    await updateTask(accessToken, target.id, schedule)
    await resolveTaskScheduleConflict(accessToken, { conflictKey: pendingTaskConflict.conflict.id, date: planDate, taskId: target.id, resolution: side === 'existing' ? (mode === 'auto' ? 'move_existing_auto' : 'move_existing_manual') : (mode === 'auto' ? 'move_new_auto' : 'move_new_manual') })
    setPendingTaskConflict(null)
    await loadPlan()
  }

  const planDate = plan?.date ?? new Date().toISOString().slice(0, 10)
  const progressPercent = Math.min(100, Math.round((completedCount / Math.max(1, taskCount)) * 100))
  const detailed = viewMode === 'detailed'
  const visibleCandidateItems = candidates?.items.filter((item) => {
    const matchesSearch = item.title.toLowerCase().includes(candidateSearch.toLowerCase())
    const category = item.scheduleCategory === 'scheduledToday' ? 'today' : item.scheduleCategory
    return matchesSearch && (candidateFilter === 'all' || category === candidateFilter)
  }) ?? []

  return (
    <AppLayout
      active="planner"
      onNavigateDashboard={nav.onNavigateDashboard}
      onNavigateTasks={nav.onNavigateTasks}
      onNavigateFocus={nav.onNavigateFocus}
      onNavigateReminders={nav.onNavigateReminders}
      onNavigateCalendar={nav.onNavigateCalendar}
      onNavigateNotes={nav.onNavigateNotes}
      onNavigateAnalytics={nav.onNavigateAnalytics}
      onNavigatePlanner={nav.onNavigatePlanner}
      panelTitle="Smart day"
      panelCaption={plan?.source === 'ai' ? 'AI-assisted plan' : 'Standard plan'}
      panelPercent={progressPercent}
    >
      <PageHeader
        title={t('taskUi.planner.title')}
        subtitle={t('taskUi.planner.subtitle')}
        toolbar={
          <TopActionBar pageOnly
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search plan..."
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      {/* HERO — today's plan summary + key stats -------------------------- */}
      {dismissedConflict ? <div role="alert" className="mb-4 rounded-xl border border-amber-400/50 bg-amber-400/10 p-3 text-sm text-[var(--bp-text)]"><strong>Unresolved Schedule Conflict:</strong> {dismissedConflict.task.title} overlaps {dismissedConflict.commitment.title} by {dismissedConflict.conflictMinutes} minutes. <button type="button" className="underline" onClick={() => { if (plan) setPendingConflict({ conflict: dismissedConflict, proposedPlan: plan }); setDismissedConflict(null) }}>Resolve now</button></div> : null}
      <ExistingTaskTimeConflict accessToken={accessToken} date={planDate} plan={plan} />
      <section className="mb-4 rounded-2xl border border-[var(--bp-border)] bg-gradient-to-r from-[var(--bp-accent)]/[0.08] via-[var(--bp-surface)] to-[var(--bp-surface)] p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bp-accent)]/15 text-[var(--bp-accent-ink)]">
                <SparkleGlyph />
              </span>
              <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Today&apos;s Plan</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                  plan?.source === 'ai' ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent-ink)]' : 'bg-slate-500/15 text-[var(--bp-subtle)]'
                }`}
              >
                {plan?.source === 'ai' ? 'AI-assisted' : 'Standard plan'}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-[var(--bp-text)]">{formatLongDate(planDate)}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--bp-muted)]">
              {plan?.summary ?? 'Generate a schedule when you are ready. Your current plan stays here while you move around BeePlan.'}
            </p>
          </div>

          {/* Progress ring */}
        </div>

        {/* Key stats — planned work / tasks / breaks */}
        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--bp-border)] bg-[var(--bp-border)] sm:grid-cols-4">
          <SummaryMetric label="Progress" value={`${progressPercent}%`} detail={`${completedCount} complete`} />
          <StatTile emoji="⏱️" label="Planned work" value={formatDuration(plannedMinutes)} />
          <StatTile emoji="✅" label="Tasks" value={String(taskCount)} />
          <StatTile emoji="☕" label="Breaks" value={String(insights?.breaks ?? 0)} />
        </div>
      </section>

      {/* ACTION BAR + VIEW TOGGLE ---------------------------------------- */}
      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3 shadow-xl">
        <SecondaryButton size="md" onClick={() => void openCandidatePicker()} loading={candidatePickerOpen && !candidates}>
          Choose what to schedule today
        </SecondaryButton>
        <PrimaryButton size="md" onClick={() => void loadPlan()} loading={loading}>
          <span className="inline-flex items-center gap-1.5"><SparkleGlyph className="h-4 w-4" /> {plan ? 'Regenerate plan' : 'Generate plan'}</span>
        </PrimaryButton>
        <SecondaryButton size="md" onClick={() => void acceptPlan()} disabled={!plan || loading || accepting || accepted}>
          <span className="inline-flex items-center gap-1.5">
            <CheckGlyph /> {accepted ? 'Accepted' : accepting ? 'Accepting...' : 'Accept Plan'}
          </span>
        </SecondaryButton>
        <OutlineButton size="md" onClick={resetPlan} disabled={loading}>
          <span className="inline-flex items-center gap-1.5"><RefreshGlyph /> Reset</span>
        </OutlineButton>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </section>

      {candidatePickerOpen ? (
        <section className="mb-4 rounded-2xl border border-[var(--bp-accent)]/30 bg-[var(--bp-surface)] p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h3 className="text-base font-black text-[var(--bp-text)]">Choose what to schedule today</h3><p className="text-sm text-[var(--bp-muted)]">Selected work is revalidated by the API before it is scheduled.</p></div>
            <div className="flex gap-2"><button className="text-xs font-bold underline" onClick={() => setSelectedKeys(new Set(candidates?.items.map((item) => `${item.taskId}:${item.subtaskId ?? ''}`) ?? []))}>Select all</button><button className="text-xs font-bold underline" onClick={() => setSelectedKeys(new Set())}>Clear all</button></div>
          </div>
          {candidates ? <>
            <div className="mt-3 rounded-xl bg-[var(--bp-bg)] p-3 text-sm"><strong>Selected: {formatDuration((candidates.items.filter((item) => selectedKeys.has(`${item.taskId}:${item.subtaskId ?? ''}`)).reduce((sum, item) => sum + item.estimatedMinutes, 0)))}</strong><span className="ms-3 text-[var(--bp-muted)]">Available today: {formatDuration(candidates.availableMinutes)}</span></div>
            <div className="mt-3 flex flex-wrap gap-2"><input value={candidateSearch} onChange={(event) => setCandidateSearch(event.target.value)} placeholder="Search tasks and subtasks" className="min-w-48 flex-1 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm" />{(['all', 'today', 'overdue', 'upcoming', 'unscheduled'] as const).map((filter) => <button key={filter} onClick={() => setCandidateFilter(filter)} className="rounded-lg px-2.5 py-1.5 text-xs font-bold">{filter}</button>)}</div>
            <div className="mt-3 grid gap-2 md:grid-cols-2">{visibleCandidateItems.map((item) => { const key = `${item.taskId}:${item.subtaskId ?? ''}`; const checked = selectedKeys.has(key); return <label key={key} className={`flex cursor-pointer gap-3 rounded-xl border border-[var(--bp-border)] p-3 ${item.isManuallySelectable === false ? 'opacity-60' : ''}`}><input type="checkbox" disabled={item.isManuallySelectable === false} checked={checked} onChange={() => setSelectedKeys((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next })} /><span className="min-w-0 flex-1"><span className="block text-sm font-bold text-[var(--bp-text)]">{item.title}</span><span className="block text-xs capitalize text-[var(--bp-muted)]">{item.scheduleCategory ?? 'unscheduled'} · {item.priority} · {item.estimatedMinutes} min{item.dueDate ? ` · due ${item.dueDate.slice(0, 10)}` : ''}{item.blockedReason ? ` · ${item.blockedReason}` : ''}</span></span></label> })}</div>
            <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-sm font-bold text-[var(--bp-text)]">Mode <select value={selectionMode} onChange={(event) => setSelectionMode(event.target.value as typeof selectionMode)} className="ms-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-2 py-1"><option value="selectedOnly">Selected only</option><option value="selectedPlusAutoFill">Selected + backlog fill</option></select></label><PrimaryButton size="sm" onClick={() => void generateFromSelection()} loading={loading}>Plan selected work</PrimaryButton><button className="text-sm font-bold underline" onClick={() => setCandidatePickerOpen(false)}>Cancel</button></div>
          </> : <p className="mt-4 text-sm text-[var(--bp-muted)]">Loading eligible work…</p>}
        </section>
      ) : null}

      {acceptError ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">
          {acceptError}
        </p>
      ) : null}

      {/* AI PLANNING PREFERENCES — collapsed by default ------------------- */}
      {preferences ? (
        <div className="mb-4">
          <PlanningPreferencesCard preferences={preferences} onSave={savePreferences} />
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-300">
          {error}
        </p>
      ) : null}

      {loading && !plan ? (
        <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-8 text-center text-sm font-bold text-[var(--bp-muted)] shadow-xl">
          Loading your saved plan...
        </div>
      ) : null}

      {!loading && !error && !plan ? (
        <div className="rounded-2xl border border-dashed border-[var(--bp-border)] bg-[var(--bp-surface)] p-8 text-center shadow-xl">
          <h2 className="text-base font-black text-[var(--bp-text)]">No plan for today yet</h2>
          <p className="mt-2 text-sm text-[var(--bp-muted)]">Generate a plan when you want help organizing the rest of your day.</p>
        </div>
      ) : null}

      {plan ? (
        <div className="space-y-4">
          {/* CAPACITY SUMMARY — scheduled vs postponed ------------------ */}
          <CapacitySummaryCard capacity={plan.capacity} />

          {/* SCHEDULE — always visible ---------------------------------- */}
          {(Object.keys(SECTION_META) as SectionKey[]).map((section) => {
            const rawItems = plan.sections[section].filter((item) => matchesSearch(item, search))
            const items = rawItems
              .map((item) => lockedItems[itemKey(item)] ?? item)
              .sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0))
            const stats = sectionStats(items)
            const rows = buildTimelineRows(items)
            const meta = SECTION_META[section]

            return (
              <section
                key={section}
                className={`rounded-2xl border border-[var(--bp-border)] ${meta.tint} p-4 shadow-xl`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-black text-[var(--bp-text)]">
                    <span className="text-lg">{meta.emoji}</span>
                    <span className={meta.accent}>{meta.title}</span>
                  </h3>
                  <span className="text-xs font-bold text-[var(--bp-muted)]">
                    {stats.tasks} {stats.tasks === 1 ? 'task' : 'tasks'} · {formatDuration(stats.minutes)}
                  </span>
                </div>

                {rows.length ? (
                  <div>
                    {rows.map((row, index) => {
                      const isLast = index === rows.length - 1
                      if (row.kind === 'free') {
                        return <FreeBlock key={`free-${index}`} start={row.start} end={row.end} minutes={row.minutes} isLast={isLast} />
                      }
                      const item = row.item
                      const completed = Boolean(item.taskId && completedTaskIds.has(item.taskId))
                      const locked = Boolean(lockedItems[itemKey(item)] ?? item.locked)
                      return (
                        <TimelineRow key={item.id} status={itemStatus(item, completed, nowMinutes)} isLast={isLast}>
                          <PlanCard
                            item={item}
                            completed={completed}
                            locked={locked}
                            current={itemStatus(item, completed, nowMinutes) === 'current'}
                            onLock={() => toggleLock(item)}
                            onMove={(field, value) => moveItem(item, field, value)}
                            onDropItem={dragItem}
                            onComplete={item.taskId ? () => onCompleteTask?.(item.taskId!) : undefined}
                          />
                        </TimelineRow>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-2 text-sm text-[var(--bp-muted)]">Nothing planned here.</p>
                )}
              </section>
            )
          })}

          {plan.unscheduled.length ? <PostponedList items={plan.unscheduled} /> : null}

          {/* DETAILED VIEW — explainability, collapsed by default -------- */}
          {detailed ? (
            <div className="space-y-3">
              <PlanSourceBanner source={plan.source} />

              <HowItWasBuilt source={plan.source} />

              <WhyThisOrder />

              {validation ? <PlanValidationCard validation={validation} /> : null}

              <CollapsibleSection title="AI Insights" emoji="🧠" defaultOpen={false}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <InsightCard
                    emoji="🎯"
                    title="Today's Focus"
                    body={insights?.focus?.title ?? 'No focus task scheduled.'}
                    hint={insights?.focus ? `${formatDuration(insights.focus.durationMinutes)} · ${insights.focus.priority} priority` : undefined}
                  />
                  <InsightCard
                    emoji="🧗"
                    title="Most Difficult Task"
                    body={insights?.hardest?.title ?? 'Nothing scheduled yet.'}
                    hint={insights?.hardest ? `${formatDuration(insights.hardest.durationMinutes)} of effort` : undefined}
                  />
                  <InsightCard
                    emoji="⏰"
                    title="Upcoming Deadline"
                    body={insights?.nextFixed?.title ?? 'No fixed deadlines today.'}
                    hint={insights?.nextFixed ? `at ${formatClock(insights.nextFixed.startTime)}` : undefined}
                  />
                  <InsightCard
                    emoji="🕓"
                    title="Available Free Time"
                    body={
                      insights?.biggestGap
                        ? `${formatDuration(insights.biggestGap.minutes)} free`
                        : insights?.freeMinutes != null
                          ? `${formatDuration(insights.freeMinutes)} across the day`
                          : 'Fully scheduled.'
                    }
                    hint={insights?.biggestGap ? `${formatClock(insights.biggestGap.start)} – ${formatClock(insights.biggestGap.end)}` : undefined}
                  />
                  <div className="rounded-xl bg-[var(--bp-bg)] p-3 sm:col-span-2">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-black uppercase text-[var(--bp-muted)]">
                        <span>📈</span> Productivity Score
                      </p>
                      <span className="text-lg font-black text-[var(--bp-accent-ink)]">{insights?.productivityScore ?? 0}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--bp-border)]">
                      <div
                        className="h-full rounded-full bg-[var(--bp-accent)] transition-all duration-500"
                        style={{ width: `${insights?.productivityScore ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CollapsibleSection>

              {insights?.recommendations.length ? (
                <CollapsibleSection title="AI Recommendations" emoji="💡" defaultOpen={false}>
                  <div className="space-y-2">
                    {insights.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start gap-2.5 rounded-xl bg-[var(--bp-bg)] p-3 text-sm text-[var(--bp-subtle)]">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--bp-accent)]/15 text-xs text-[var(--bp-accent-ink)]">
                          {index + 1}
                        </span>
                        <span className="leading-relaxed">{rec}</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleSection>
              ) : null}
            </div>
          ) : (
            <p className="pt-1 text-center text-xs text-[var(--bp-muted)]">
              Switch to <span className="font-bold text-[var(--bp-text)]">Detailed View</span> to see reasons, validation, and how the AI built this plan.
            </p>
          )}
        </div>
      ) : null}
      <ScheduleConflictModal
        conflict={pendingConflict?.conflict ?? null}
        oldTime={pendingConflict?.oldTime}
        busy={resolvingConflict}
        onKeepCommitment={() => void keepCommitment()}
        onKeepTask={() => void keepTask()}
        onManual={() => { setDismissedConflict(pendingConflict?.conflict ?? null); setPendingConflict(null) }}
        onCancel={() => { setDismissedConflict(pendingConflict?.conflict ?? null); setPendingConflict(null) }}
      />
      <TaskTimeConflictModal conflict={pendingTaskConflict?.conflict ?? null} onMoveExisting={(mode, schedule) => void moveTaskConflict('existing', mode, schedule)} onMoveNew={(mode, schedule) => void moveTaskConflict('new', mode, schedule)} onCancelExisting={() => {
        if (!pendingTaskConflict || !window.confirm('Cancel the existing task? It will be marked missed and not deleted.')) return
        void changeTaskStatus(accessToken, pendingTaskConflict.conflict.existingTask.id, { status: 'missed' }).then(() => setPendingTaskConflict(null)).then(() => loadPlan())
      }} onCancelNew={() => setPendingTaskConflict(null)} onCancelChanges={() => setPendingTaskConflict(null)} />
    </AppLayout>
  )
}

/* ------------------------------------------------------------------ */
/* Presentational components                                          */
/* ------------------------------------------------------------------ */

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="ml-auto inline-flex items-center rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] p-0.5">
      {(['simple', 'detailed'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`rounded-md px-3 py-1.5 text-xs font-black transition ${
            mode === value ? 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]' : 'text-[var(--bp-muted)] hover:text-[var(--bp-text)]'
          }`}
        >
          {value === 'simple' ? 'Simple View' : 'Detailed View'}
        </button>
      ))}
    </div>
  )
}

function PlanningPreferencesCard({
  preferences,
  onSave,
}: {
  preferences: PlannerPreferences
  onSave: (next: PlannerPreferences) => Promise<{ ok: boolean; message: string }>
}) {
  const [draft, setDraft] = useState<PlannerPreferences>(preferences)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  type AvailabilityWindow = PlannerPreferences['unavailableHours'][number] & { label?: string }
  const [availability, setAvailability] = useState<AvailabilityWindow[]>([
    { ...preferences.lunch, label: 'Lunch' },
    ...preferences.unavailableHours,
  ])
  const [focusStyle, setFocusStyle] = useState(() => preferences.workBlockMinutes === 25 && preferences.breakMinutes === 5 ? 'Pomodoro' : preferences.workBlockMinutes === 90 && preferences.breakMinutes === 15 ? 'Deep Work' : preferences.workBlockMinutes === 50 && preferences.breakMinutes === 10 ? 'Standard' : 'Custom')

  function update<K extends keyof PlannerPreferences>(key: K, value: PlannerPreferences[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setMessage(null)
  }

  function updateWindow(key: 'sleep', field: 'start' | 'end', value: string) {
    setDraft((current) => ({ ...current, [key]: { ...current[key], [field]: value } }))
    setMessage(null)
  }

  function addUnavailable() {
    setAvailability((current) => [...current, { start: '18:00', end: '19:00', label: '' }])
    setMessage(null)
  }

  function updateUnavailable(index: number, field: 'start' | 'end' | 'label', value: string) {
    setAvailability((current) => current.map((window, i) => (i === index ? { ...window, [field]: value } : window)))
    setMessage(null)
  }

  function removeUnavailable(index: number) {
    setAvailability((current) => current.filter((_, i) => i !== index))
    setMessage(null)
  }

  const start = toMinutes(draft.focusStartTime)
  const end = toMinutes(draft.focusEndTime)
  const invalidFocus = start != null && end != null && start >= end
  const invalidAvailability = availability.some((window) => {
    const windowStart = toMinutes(window.start)
    const windowEnd = toMinutes(window.end)
    return windowStart != null && windowEnd != null && windowStart >= windowEnd
  })

  function chooseFocusStyle(value: string) {
    setFocusStyle(value)
    const preset = value === 'Pomodoro' ? [25, 5] : value === 'Standard' ? [50, 10] : value === 'Deep Work' ? [90, 15] : null
    if (preset) setDraft((current) => ({ ...current, workBlockMinutes: preset[0], breakMinutes: preset[1] }))
  }

  async function handleSave() {
    if (invalidFocus) {
      setMessage({ ok: false, text: 'Focus start time must be before focus end time.' })
      return
    }
    if (invalidAvailability) {
      setMessage({ ok: false, text: 'Each unavailable block must start before it ends.' })
      return
    }
    setSaving(true)
    const [lunchWindow, ...otherWindows] = availability
    const result = await onSave({
      ...draft,
      lunch: lunchWindow ? { start: lunchWindow.start, end: lunchWindow.end } : draft.lunch,
      unavailableHours: otherWindows.map(({ label, ...window }) => window),
    })
    setSaving(false)
    setMessage({ ok: result.ok, text: result.message })
  }

  return (
    <CollapsibleSection title="AI Planning Preferences" emoji="⚙️" defaultOpen={true}>
      <p className="mb-3 text-xs text-[var(--bp-muted)]">
        Teach BeePlan how you like your day planned. Saved preferences apply the next time you generate a plan — they never
        override deadlines, reminders, dependencies, or locked tasks.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <PrefGroup title="Focus Hours" hint="When you prefer to do your best work.">
          <div className="flex items-end gap-2">
            <PrefTime label="From" value={draft.focusStartTime} onChange={(value) => update('focusStartTime', value)} />
            <PrefTime label="To" value={draft.focusEndTime} onChange={(value) => update('focusEndTime', value)} />
          </div>
          {invalidFocus ? <p className="mt-1 text-[11px] font-bold text-red-300">Start must be before end.</p> : null}
        </PrefGroup>

        <PrefGroup title="Focus Style" hint="Choose a rhythm that feels natural.">
          <PrefChoice value={focusStyle} onChange={chooseFocusStyle} options={['Pomodoro', 'Standard', 'Deep Work', 'Custom']} descriptions={['25 / 5', '50 / 10', '90 / 15', 'Set your own']} />
          {focusStyle === 'Custom' ? <div className="mt-3 flex items-end gap-2"><PrefNumber label="Work block (min)" value={draft.workBlockMinutes} min={15} max={120} onChange={(value) => update('workBlockMinutes', value)} /><PrefNumber label="Break (min)" value={draft.breakMinutes} min={5} max={30} onChange={(value) => update('breakMinutes', value)} /></div> : null}
        </PrefGroup>

        <PrefGroup title="Daily Work Capacity" hint="BeePlan automatically keeps a reasonable buffer for the unexpected.">
          <div className="grid grid-cols-5 gap-1.5">{['2h', '4h', '6h', '8h', 'Custom'].map((value) => <button key={value} type="button" onClick={() => value === 'Custom' ? setAdvancedOpen(true) : update('maxDailyWorkMinutes', Number(value.replace('h', '')) * 60)} className={`rounded-lg border px-2 py-2 text-xs font-black transition ${value === `${draft.maxDailyWorkMinutes / 60}h` ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]' : 'border-[var(--bp-border)] text-[var(--bp-muted)] hover:border-[var(--bp-accent)]/50'}`}>{value}</button>)}</div>
        </PrefGroup>

        <PrefGroup title="Sleep Hours" hint="Protected rest time the planner always keeps clear.">
          <div className="space-y-2">
            <div>
              <p className="mb-1 text-[11px] font-bold text-[var(--bp-muted)]">Sleep (can cross midnight)</p>
              <div className="flex items-end gap-2">
                <PrefTime label="From" value={draft.sleep.start} onChange={(value) => updateWindow('sleep', 'start', value)} />
                <PrefTime label="To" value={draft.sleep.end} onChange={(value) => updateWindow('sleep', 'end', value)} />
              </div>
            </div>
          </div>
        </PrefGroup>

        <PrefGroup title="Availability" hint="Add lunch, commute, gym, prayer, family, or any other protected time." className="md:col-span-2">
          {availability.length ? (
            <div className="space-y-2">
              {availability.map((window, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <PrefTime label="From" value={window.start} onChange={(value) => updateUnavailable(index, 'start', value)} />
                  <PrefTime label="To" value={window.end} onChange={(value) => updateUnavailable(index, 'end', value)} />
                  <label className="min-w-[130px] flex-1"><span className="mb-1 block text-[11px] font-bold text-[var(--bp-muted)]">Label (optional)</span><input value={window.label ?? ''} placeholder="Lunch, Gym..." onChange={(event) => updateUnavailable(index, 'label', event.target.value)} className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1.5 text-xs font-bold text-[var(--bp-text)]" /></label>
                  <button
                    type="button"
                    onClick={() => removeUnavailable(index)}
                    className="mb-0.5 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs font-black text-red-300 transition hover:bg-red-500/25"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--bp-muted)]">No unavailable blocks yet.</p>
          )}
          <button
            type="button"
            onClick={addUnavailable}
            className="mt-2 rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-2.5 py-1.5 text-xs font-black text-[var(--bp-text)] transition hover:border-[var(--bp-accent)]/40"
          >
            + Add time block
          </button>
        </PrefGroup>

        <div className="md:col-span-2 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)]/30">
          <button type="button" onClick={() => setAdvancedOpen((value) => !value)} aria-expanded={advancedOpen} className="flex w-full items-center justify-between px-3 py-3 text-left"><span><span className="block text-sm font-black text-[var(--bp-text)]">Advanced Preferences</span><span className="text-xs text-[var(--bp-muted)]">Add personal context the AI cannot infer automatically.</span></span><ChevronGlyph className={`h-4 w-4 text-[var(--bp-muted)] transition-transform ${advancedOpen ? 'rotate-180' : ''}`} /></button>
          {advancedOpen ? <div className="grid gap-3 border-t border-[var(--bp-border)] p-3">
            <PrefGroup title="Personal Notes" hint="Tell the AI anything about your day that it cannot infer automatically.">
          <textarea
            value={draft.note}
            maxLength={1000}
            rows={3}
            onChange={(event) => update('note', event.target.value)}
            placeholder="Tell BeePlan how you like your day planned..."
            className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-sm text-[var(--bp-text)] placeholder:text-[var(--bp-muted)]"
          />
          <p className="mt-0.5 text-right text-[11px] text-[var(--bp-muted)]">{draft.note.length}/1000</p>
            </PrefGroup>
          </div> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <PrimaryButton size="sm" onClick={handleSave} loading={saving} disabled={invalidFocus || invalidAvailability}>
          Save Preferences
        </PrimaryButton>
        {message ? (
          <span className={`text-xs font-bold ${message.ok ? 'text-green-300' : 'text-red-300'}`}>{message.text}</span>
        ) : null}
      </div>
    </CollapsibleSection>
  )
}

function CapacitySummaryCard({ capacity }: { capacity: CapacitySummary }) {
  const requested = Math.max(1, capacity.requestedMinutes)
  const scheduledPct = Math.min(100, Math.round((capacity.scheduledMinutes / requested) * 100))
  const usedPct = Math.min(100, Math.round((capacity.scheduledMinutes / Math.max(1, capacity.availableMinutes)) * 100))

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-black text-[var(--bp-text)]">
          <span>📊</span> Today&apos;s capacity
        </h3>
        <span className="text-[11px] font-bold text-[var(--bp-muted)]">
          {usedPct}% of {formatDuration(capacity.availableMinutes)} budget used
        </span>
      </div>

      {/* requested = scheduled + postponed */}
      <div className="mb-3 h-2.5 w-full overflow-hidden rounded-full bg-[var(--bp-border)]">
        <div className="flex h-full w-full">
          <div className="h-full bg-[var(--bp-accent)] transition-all duration-500" style={{ width: `${scheduledPct}%` }} />
          <div className="h-full bg-amber-400/70 transition-all duration-500" style={{ width: `${100 - scheduledPct}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <CapacityStat label="Available" value={formatDuration(capacity.availableMinutes)} tone="text-sky-300" />
        <CapacityStat label="Requested" value={formatDuration(capacity.requestedMinutes)} tone="text-[var(--bp-text)]" />
        <CapacityStat label="Scheduled" value={formatDuration(capacity.scheduledMinutes)} tone="text-green-300" />
        <CapacityStat label="Postponed" value={formatDuration(capacity.postponedMinutes)} tone="text-amber-300" />
        <CapacityStat label="Tasks scheduled" value={String(capacity.scheduledTaskCount)} tone="text-green-300" />
        <CapacityStat label="Tasks postponed" value={String(capacity.postponedTaskCount)} tone="text-amber-300" />
      </div>
      <p className="mt-3 text-[11px] text-[var(--bp-muted)]">
        Keeps a {formatDuration(capacity.emergencyBufferMinutes)} emergency buffer free and never plans past your max daily work of{' '}
        {formatDuration(capacity.maxDailyWorkMinutes)}.
      </p>
    </section>
  )
}

function CapacityStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)]/60 p-2.5">
      <p className="text-[10px] font-black uppercase text-[var(--bp-muted)]">{label}</p>
      <p className={`mt-0.5 text-base font-black ${tone}`}>{value}</p>
    </div>
  )
}

function PostponedList({ items }: { items: UnscheduledItem[] }) {
  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-4 shadow-xl">
      <h3 className="flex items-center gap-2 text-sm font-black text-[var(--bp-text)]">
        <span>📥</span> Not scheduled today
      </h3>
      <p className="mb-3 mt-1 text-xs text-[var(--bp-muted)]">
        {items.length} task{items.length > 1 ? 's' : ''} moved out of today — nothing is silently dropped.
      </p>
      <div className="space-y-2">
        {items.map((item, index) => {
          const meta = postponeMeta(item.status)
          return (
            <div
              key={`${item.subtaskId ?? item.taskId ?? item.reminderId ?? index}`}
              className="rounded-xl border border-dashed border-amber-500/30 bg-[var(--bp-bg)] p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-[var(--bp-text)]">{item.title}</p>
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${meta.tone}`}>
                  <span>{meta.emoji}</span> {meta.label}
                </span>
                {item.priority ? <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge> : null}
              </div>
              <p className="mt-1 text-xs text-[var(--bp-muted)]">{item.reason}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--bp-muted)]">
                {item.estimatedMinutes ? <span>⏱️ {formatDuration(item.estimatedMinutes)}</span> : null}
                {item.deadline ? <span>📅 Due {formatShortDate(item.deadline)}</span> : null}
                {item.suggestedDate ? (
                  <span className="font-bold text-[var(--bp-accent-ink)]">➡️ Suggested: {formatShortDate(item.suggestedDate)}</span>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PrefGroup({
  title,
  hint,
  className = '',
  children,
}: {
  title: string
  hint?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)]/40 p-3 ${className}`}>
      <p className="text-xs font-black text-[var(--bp-text)]">{title}</p>
      <p className="mb-2 mt-0.5 min-h-[14px] text-[11px] text-[var(--bp-muted)]">{hint ?? ''}</p>
      {children}
    </div>
  )
}

function PrefTime({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[11px] font-bold text-[var(--bp-muted)]">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1.5 text-xs font-bold text-[var(--bp-text)]"
      />
    </label>
  )
}

function PrefNumber({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[11px] font-bold text-[var(--bp-muted)]">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value)
          onChange(Number.isFinite(next) ? next : min)
        }}
        className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1.5 text-xs font-bold text-[var(--bp-text)]"
      />
    </label>
  )
}

function PrefChoice({ value, onChange, options, descriptions = [] }: { value: string; onChange: (value: string) => void; options: string[]; descriptions?: string[] }) {
  return <div className="grid gap-2 sm:grid-cols-2">{options.map((option, index) => <label key={option} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition ${value === option ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)]' : 'border-[var(--bp-border)] hover:border-[var(--bp-accent)]/50'}`}><input type="radio" name="planner-choice" checked={value === option} onChange={() => onChange(option)} className="accent-[var(--bp-accent)]" /><span><span className="block text-xs font-black text-[var(--bp-text)]">{option}</span>{descriptions[index] ? <span className="text-[11px] text-[var(--bp-muted)]">{descriptions[index]}</span> : null}</span></label>)}</div>
}

function SummaryMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="bg-[var(--bp-bg)]/45 px-3 py-3"><dt className="text-[11px] font-bold text-[var(--bp-muted)]">{label}</dt><dd className="mt-1 text-lg font-black text-[var(--bp-text)]">{value}</dd><p className="mt-0.5 text-[11px] text-[var(--bp-muted)]">{detail}</p></div>
}

function StatTile({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="bg-[var(--bp-bg)]/45 px-3 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-[var(--bp-muted)]">
        <span className="text-sm">{emoji}</span>
        {label}
      </div>
      <p className="mt-1.5 text-lg font-black text-[var(--bp-text)]">{value}</p>
    </div>
  )
}

function CollapsibleSection({
  title,
  emoji,
  defaultOpen = true,
  children,
}: {
  title: string
  emoji: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 shadow-xl">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
      >
        <h3 className="flex items-center gap-2 text-sm font-black text-[var(--bp-text)]">
          <span>{emoji}</span> {title}
        </h3>
        <ChevronGlyph className={`h-4 w-4 text-[var(--bp-muted)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}

function InsightCard({ emoji, title, body, hint }: { emoji: string; title: string; body: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[var(--bp-bg)] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase text-[var(--bp-muted)]">
        <span>{emoji}</span> {title}
      </p>
      <p className="mt-1 text-sm font-bold leading-snug text-[var(--bp-text)]">{body}</p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--bp-muted)]">{hint}</p> : null}
    </div>
  )
}

type NodeStatus = 'completed' | 'current' | 'upcoming'

function TimelineRow({ status, isLast, children }: { status: NodeStatus; isLast: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-4">
        <TimelineNode status={status} />
        {!isLast ? <div className="mt-1 w-px flex-1 bg-[var(--bp-border)]" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-3">{children}</div>
    </div>
  )
}

function TimelineNode({ status }: { status: NodeStatus }) {
  if (status === 'completed') {
    return (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500/20 text-green-300">
        <CheckGlyph className="h-3 w-3" />
      </span>
    )
  }
  if (status === 'current') {
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--bp-accent)]/40" />
        <span className="relative h-3 w-3 rounded-full bg-[var(--bp-accent)]" />
      </span>
    )
  }
  return <span className="h-5 w-5 rounded-full border-2 border-[var(--bp-border)] bg-transparent" />
}

/** Subtle free-time separator — a thin muted line, not a highlighted card. */
function FreeBlock({ start, end, minutes, isLast }: { start: string; end: string; minutes: number; isLast: boolean }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-3">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--bp-border)]" />
        {!isLast ? <div className="mt-1 w-px flex-1 bg-[var(--bp-border)]" /> : null}
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <p className="text-[11px] font-semibold text-[var(--bp-muted)]">
          {formatDuration(minutes)} free · {formatClock(start)} – {formatClock(end)}
        </p>
      </div>
    </div>
  )
}

function PlanCard({
  item,
  completed,
  locked,
  current,
  onLock,
  onMove,
  onDropItem,
  onComplete,
}: {
  item: DailyPlanItem
  completed: boolean
  locked: boolean
  current: boolean
  onLock: () => void
  onMove: (field: 'startTime' | 'endTime', value: string) => void
  onDropItem: (item: DailyPlanItem, startTime: string) => void
  onComplete?: () => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [showWhy, setShowWhy] = useState(false)
  const isTask = item.type === 'task'
  const rationale = item.rationale?.toLowerCase() ?? ''
  const overdue = rationale.includes('overdue')
  const dueToday = !overdue && (rationale.includes('due today') || (rationale.includes('due') && rationale.includes('today')))

  return (
    <div
      draggable={isTask}
      onDragStart={(event) => {
        if (isTask) event.dataTransfer.setData('application/x-beeplan-task', JSON.stringify(item))
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-beeplan-task')) event.preventDefault()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const raw = event.dataTransfer.getData('application/x-beeplan-task')
        if (!raw) return
        try {
          onDropItem(JSON.parse(raw) as DailyPlanItem, item.startTime)
        } catch {
          // Ignore malformed external drag data.
        }
      }}
      aria-label={`${item.title}, ${item.startTime} to ${item.endTime}${isTask ? ', draggable' : ''}`}
      className={`group rounded-xl border p-3 shadow-sm transition-colors duration-200 ${
        locked
          ? 'border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/[0.06]'
          : current
            ? 'border-[var(--bp-accent)]/40 bg-[var(--bp-surface)]'
            : 'border-[var(--bp-border)] bg-[var(--bp-surface)]'
      } ${completed ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3">
        {isTask ? (
          <input
            type="checkbox"
            checked={completed}
            onChange={() => void onComplete?.()}
            className="mt-1 h-4 w-4 shrink-0 accent-[var(--bp-accent)]"
            aria-label={`Complete ${item.title}`}
          />
        ) : (
          <span className="mt-0.5 text-sm" aria-hidden>
            {typeGlyph(item.type)}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`truncate text-sm font-black text-[var(--bp-text)] ${completed ? 'line-through' : ''}`}>{item.title}</p>
            <Badge tone={priorityTone(item.priority)}>{item.priority}</Badge>
            {overdue ? <Badge tone="red">Overdue</Badge> : null}
            {dueToday ? <Badge tone="yellow">Due Today</Badge> : null}
            {item.isFocusTask ? <Badge tone="focus">Focus</Badge> : null}
            {item.selectionSource === 'user' ? <Badge tone="plain">Chosen by you</Badge> : item.selectionSource === 'autoFill' ? <Badge tone="yellow">Auto-filled</Badge> : item.selectionSource === 'scheduled' ? <Badge tone="plain">Scheduled for today</Badge> : null}
            {item.category ? <Badge tone="plain">{item.category}</Badge> : null}
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--bp-accent)]/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-[var(--bp-accent-ink)]">
                <LockGlyph /> Locked
              </span>
            ) : null}
          </div>

          {/* time + duration + Why? */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--bp-muted)]">
            {editing ? (
              <>
                <input
                  type="time"
                  value={item.startTime}
                  onChange={(event) => onMove('startTime', event.target.value)}
                  className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1 text-xs font-bold text-[var(--bp-text)]"
                />
                <span className="text-[var(--bp-muted)]">to</span>
                <input
                  type="time"
                  value={item.endTime}
                  onChange={(event) => onMove('endTime', event.target.value)}
                  className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1 text-xs font-bold text-[var(--bp-text)]"
                />
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-bold text-[var(--bp-subtle)]">
                <ClockGlyph />
                {formatClock(item.startTime)} – {formatClock(item.endTime)}
              </span>
            )}
            <span className="rounded-md bg-[var(--bp-bg)] px-1.5 py-0.5 font-bold text-[var(--bp-muted)]">{formatDuration(item.durationMinutes)}</span>
            {item.rationale ? (
              <button
                type="button"
                onClick={() => setShowWhy((value) => !value)}
                aria-expanded={showWhy}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-[var(--bp-accent-ink)] transition hover:bg-[var(--bp-accent)]/10"
              >
                {showWhy ? 'Hide' : 'Why?'}
                <ChevronGlyph className={`h-3 w-3 transition-transform duration-200 ${showWhy ? 'rotate-180' : ''}`} />
              </button>
            ) : null}
          </div>

          {/* AI reason — hidden until "Why?" is clicked */}
          {showWhy && item.rationale ? (
            <div className="mt-2 rounded-lg border border-[var(--bp-accent)]/20 bg-[var(--bp-accent)]/[0.05] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent-ink)]">
                <SparkleGlyph className="h-3 w-3" /> Scheduled here because
              </p>
              <p className="mt-0.5 text-xs leading-snug text-[var(--bp-subtle)]">{item.rationale}</p>
            </div>
          ) : null}
        </div>

        {/* actions */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onLock}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-black transition ${
              locked ? 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]' : 'bg-[var(--bp-border)] text-[var(--bp-text)] hover:brightness-110'
            }`}
          >
            <LockGlyph /> {locked ? 'Locked' : 'Lock'}
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--bp-subtle)] transition hover:bg-[var(--bp-border)]/50 hover:text-[var(--bp-text)]"
          >
            <EditGlyph /> {editing ? 'Done' : 'Edit Time'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Badge({ children, tone }: { children: string; tone: 'red' | 'yellow' | 'green' | 'focus' | 'plain' }) {
  const classes = {
    red: 'bg-red-500/15 text-red-300',
    yellow: 'border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]',
    green: 'bg-green-500/15 text-green-300',
    focus: 'bg-blue-500/15 text-blue-300',
    plain: 'bg-[var(--bp-bg)] text-[var(--bp-subtle)]',
  }
  return <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${classes[tone]}`}>{children}</span>
}

/* ------------------------------------------------------------------ */
/* Backend-intelligence panels (Detailed View)                        */
/* ------------------------------------------------------------------ */

function PlanSourceBanner({ source }: { source: DailyPlan['source'] }) {
  const ai = source === 'ai'
  return (
    <section
      className={`flex items-start gap-3 rounded-2xl border p-4 shadow-xl ${
        ai ? 'border-[var(--bp-accent)]/30 bg-[var(--bp-accent)]/[0.06]' : 'border-amber-500/30 bg-amber-500/[0.05]'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          ai ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent-ink)]' : 'bg-amber-500/15 text-amber-300'
        }`}
      >
        {ai ? <SparkleGlyph className="h-5 w-5" /> : <ShieldGlyph className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-black text-[var(--bp-text)]">
          {ai ? 'AI-assisted plan, checked against your schedule.' : 'Standard plan, built from your schedule.'}
        </p>
        <p className="mt-0.5 text-xs text-[var(--bp-muted)]">
          {ai
            ? 'Your priorities and available time were used to suggest a practical order for today.'
            : 'This plan uses your tasks, availability, and planning preferences.'}
        </p>
      </div>
      <span
        className={`ml-auto shrink-0 self-center rounded-full px-3 py-1 text-[10px] font-black uppercase ${
          ai ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent-ink)]' : 'bg-amber-500/15 text-amber-300'
        }`}
      >
        {ai ? 'AI-assisted' : 'Standard plan'}
      </span>
    </section>
  )
}

function HowItWasBuilt({ source }: { source: DailyPlan['source'] }) {
  return (
    <CollapsibleSection title="How this plan was built" emoji="🛠️" defaultOpen={false}>
      <div className="grid gap-3 md:grid-cols-3">
        <StepCard
          step={1}
          emoji="📏"
          title="Your schedule"
          accent="text-sky-300"
          items={[
            'Checked task dependencies',
            'Blocked completed tasks',
            'Protected locked tasks',
            'Avoided reminders & time overlaps',
          ]}
        />
        <StepCard
          step={2}
          emoji="🧠"
          title="Priority suggestions"
          accent="text-[var(--bp-accent-ink)]"
          active={source === 'ai'}
          items={[
            'Ranked tasks by urgency, priority, focus, progress & due dates',
            'Added a human explanation for each task',
          ]}
        />
        <StepCard
          step={3}
          emoji="🗓️"
          title="Time plan"
          accent="text-emerald-300"
          items={[
            'Assigned start & end times',
            'Inserted recovery breaks',
            'Split work into Morning / Afternoon / Evening / Night',
            'Marked tasks that do not fit as unscheduled',
          ]}
        />
      </div>
    </CollapsibleSection>
  )
}

function StepCard({
  step,
  emoji,
  title,
  accent,
  items,
  active,
}: {
  step: number
  emoji: string
  title: string
  accent: string
  items: string[]
  active?: boolean
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        active ? 'border-[var(--bp-accent)]/40 bg-[var(--bp-accent)]/[0.05]' : 'border-[var(--bp-border)] bg-[var(--bp-bg)]'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bp-surface)] text-xs font-black text-[var(--bp-subtle)]">
          {step}
        </span>
        <span className="text-base">{emoji}</span>
        <h4 className={`text-sm font-black ${accent}`}>{title}</h4>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((entry, index) => (
          <li key={index} className="flex items-start gap-1.5 text-xs text-[var(--bp-muted)]">
            <CheckGlyph className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
            <span className="leading-snug">{entry}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PlanValidationCard({ validation }: { validation: PlanValidation }) {
  return (
    <CollapsibleSection title="Plan Validation" emoji="🛡️" defaultOpen={false}>
      <div className="space-y-2">
        <ValidationRow ok={validation.noOverlaps} label="No time overlaps" />
        <ValidationRow
          ok
          label="Dependencies respected"
          detail={
            validation.dependencyBlocked
              ? `${validation.dependencyBlocked} blocked task${validation.dependencyBlocked > 1 ? 's' : ''} moved to unscheduled`
              : undefined
          }
        />
        <ValidationRow
          ok={validation.lockedCount > 0}
          neutral={validation.lockedCount === 0}
          label="Locked tasks preserved"
          detail={validation.lockedCount > 0 ? `${validation.lockedCount} locked in place` : 'No locked tasks'}
        />
        <ValidationRow ok label="Completed tasks excluded" />
        <ValidationRow
          ok={validation.breaksInserted}
          neutral={!validation.breaksInserted}
          label="Breaks inserted"
          detail={validation.breaks ? `${validation.breaks} break${validation.breaks > 1 ? 's' : ''}` : undefined}
        />
      </div>
    </CollapsibleSection>
  )
}

function ValidationRow({
  ok,
  neutral,
  label,
  detail,
}: {
  ok: boolean
  neutral?: boolean
  label: string
  detail?: string
}) {
  const tone = neutral
    ? 'bg-slate-500/15 text-[var(--bp-muted)]'
    : ok
      ? 'bg-green-500/20 text-green-300'
      : 'bg-amber-500/20 text-amber-300'
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-[var(--bp-bg)] p-2.5">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${tone}`}>
        {neutral ? (
          <span className="text-xs font-black">–</span>
        ) : ok ? (
          <CheckGlyph className="h-3 w-3" />
        ) : (
          <span className="text-xs font-black">!</span>
        )}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-bold text-[var(--bp-text)]">{label}</p>
        {detail ? <p className="text-[11px] text-[var(--bp-muted)]">{detail}</p> : null}
      </div>
    </div>
  )
}

function WhyThisOrder() {
  const factors = [
    { emoji: '🔴', text: 'Overdue tasks first' },
    { emoji: '📅', text: 'Due-today tasks next' },
    { emoji: '🧠', text: 'Focus work in the morning' },
    { emoji: '▶️', text: 'Started tasks prioritized' },
    { emoji: '🗂️', text: 'Similar categories grouped' },
    { emoji: '🪶', text: 'Light tasks placed later' },
  ]
  return (
    <CollapsibleSection title="Why this order?" emoji="🔢" defaultOpen={false}>
      <ol className="grid gap-2 sm:grid-cols-2">
        {factors.map((factor, index) => (
          <li key={index} className="flex items-center gap-2.5 rounded-xl bg-[var(--bp-bg)] p-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bp-surface)] text-xs font-black text-[var(--bp-accent-ink)]">
              {index + 1}
            </span>
            <span className="text-base">{factor.emoji}</span>
            <span className="text-xs font-bold text-[var(--bp-text)]">{factor.text}</span>
          </li>
        ))}
      </ol>
    </CollapsibleSection>
  )
}

/* ------------------------------------------------------------------ */
/* Inline glyphs                                                       */
/* ------------------------------------------------------------------ */

function SparkleGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2l1.8 4.9L18.7 8l-4.9 1.8L12 14.7 10.2 9.8 5.3 8l4.9-1.1L12 2Zm6 12l.9 2.4L21.3 17l-2.4.9L18 20.3l-.9-2.4L14.7 17l2.4-.6L18 14Z" />
    </svg>
  )
}

function ShieldGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RefreshGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 16" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20v-4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4">
      <path d="M5 12l4 4 10-10" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockGlyph({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  )
}

function EditGlyph({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M4 20h4L18 10l-4-4L4 16v4Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 6.5l4 4" strokeLinecap="round" />
    </svg>
  )
}

function ClockGlyph({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Logic-free helpers (presentation + derived display data)           */
/* ------------------------------------------------------------------ */

type TimelineRowData =
  | { kind: 'item'; item: DailyPlanItem }
  | { kind: 'free'; start: string; end: string; minutes: number }

function buildTimelineRows(items: DailyPlanItem[]): TimelineRowData[] {
  const rows: TimelineRowData[] = []
  items.forEach((item, index) => {
    rows.push({ kind: 'item', item })
    const next = items[index + 1]
    if (!next) return
    const end = toMinutes(item.endTime)
    const start = toMinutes(next.startTime)
    if (end != null && start != null && start - end >= 15) {
      rows.push({ kind: 'free', start: item.endTime, end: next.startTime, minutes: start - end })
    }
  })
  return rows
}

function sectionStats(items: DailyPlanItem[]) {
  const tasks = items.filter((item) => item.type === 'task')
  return {
    tasks: tasks.length,
    minutes: tasks.reduce((sum, item) => sum + item.durationMinutes, 0),
  }
}

function itemStatus(item: DailyPlanItem, completed: boolean, nowMinutes: number | null): NodeStatus {
  if (completed) return 'completed'
  const start = toMinutes(item.startTime)
  const end = toMinutes(item.endTime)
  if (nowMinutes != null && start != null && end != null && nowMinutes >= start && nowMinutes < end) return 'current'
  return 'upcoming'
}

function buildInsights(
  plan: DailyPlan | null,
  completedTaskIds: Set<string>,
  lockedItems: Record<string, DailyPlanItem>,
) {
  if (!plan) return null
  const items = Object.values(plan.sections)
    .flat()
    .map((item) => lockedItems[itemKey(item)] ?? item)
  const tasks = items.filter((item) => item.type === 'task')
  const focusTasks = tasks.filter((item) => item.isFocusTask)
  const total = tasks.length
  const completed = tasks.filter((item) => item.taskId && completedTaskIds.has(item.taskId)).length
  const breaks = items.filter((item) => item.type === 'break').length
  const scheduledMinutes = items.reduce((sum, item) => sum + item.durationMinutes, 0)
  const plannedMinutes = tasks.reduce((sum, item) => sum + item.durationMinutes, 0)
  const focusMinutes = focusTasks.reduce((sum, item) => sum + item.durationMinutes, 0)

  const workStart = toMinutes(plan.workingHours?.start)
  const workEnd = toMinutes(plan.workingHours?.end)
  const windowMinutes = workStart != null && workEnd != null && workEnd > workStart ? workEnd - workStart : null
  const freeMinutes = windowMinutes != null ? Math.max(0, windowMinutes - scheduledMinutes) : null

  const sorted = [...items].sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0))
  let biggestGap: { minutes: number; start: string; end: string } | null = null
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const end = toMinutes(sorted[i].endTime)
    const start = toMinutes(sorted[i + 1].startTime)
    if (end != null && start != null && start - end >= 15) {
      const gap = { minutes: start - end, start: sorted[i].endTime, end: sorted[i + 1].startTime }
      if (!biggestGap || gap.minutes > biggestGap.minutes) biggestGap = gap
    }
  }

  const hardest = [...tasks].sort((a, b) => b.durationMinutes - a.durationMinutes)[0] ?? null
  const focus =
    focusTasks[0] ?? [...tasks].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority))[0] ?? null
  const nextFixed = sorted.find((item) => item.type === 'reminder' || item.type === 'calendar') ?? null

  // Deterministic display heuristics derived only from the existing plan (no new API / logic).
  const confidence = Math.max(50, Math.min(99, (plan.source === 'ai' ? 92 : 74) - Math.min(20, plan.unscheduled.length * 5)))
  const completionRatio = total ? completed / total : 0
  const focusRatio = scheduledMinutes ? focusMinutes / scheduledMinutes : 0
  const productivityScore = Math.round(Math.max(0, Math.min(100, 55 + completionRatio * 30 + Math.min(15, focusRatio * 20))))

  let suggestion: string
  if (nextFixed && biggestGap && biggestGap.minutes >= 45) {
    suggestion = `You have a ${biggestGap.minutes}-minute focus window before ${nextFixed.title}.`
  } else if (biggestGap) {
    suggestion = `A ${biggestGap.minutes}-minute gap at ${formatClock(biggestGap.start)} is perfect for quick tasks.`
  } else {
    suggestion = 'Your day is tightly packed — protect a few minutes to breathe between tasks.'
  }

  const recommendations: string[] = []
  if (plan.unscheduled.length) {
    recommendations.push(
      `${plan.unscheduled.length} task${plan.unscheduled.length > 1 ? 's' : ''} didn't fit today — move ${
        plan.unscheduled.length > 1 ? 'them' : 'it'
      } to tomorrow or free up time.`,
    )
  }
  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (sorted[i].isFocusTask && sorted[i + 1].isFocusTask) {
      recommendations.push(`Add a short break between “${sorted[i].title}” and “${sorted[i + 1].title}” to reset your focus.`)
      break
    }
  }
  if (biggestGap) {
    recommendations.push(`Reply to emails or handle admin during the free window at ${formatClock(biggestGap.start)}.`)
  }
  if (focusTasks.length >= 2) {
    recommendations.push('Take a 10-minute break after your second deep-focus session to recover.')
  }
  if (!recommendations.length) {
    recommendations.push('Your schedule looks balanced — start with the first task and keep the momentum going.')
  }

  return {
    plannedMinutes,
    focusMinutes,
    freeMinutes,
    breaks,
    confidence,
    productivityScore,
    biggestGap,
    hardest,
    focus,
    nextFixed,
    suggestion,
    recommendations: recommendations.slice(0, 4),
  }
}

type PlanValidation = {
  noOverlaps: boolean
  breaksInserted: boolean
  breaks: number
  lockedCount: number
  dependencyBlocked: number
}

function buildValidation(plan: DailyPlan | null, lockedItems: Record<string, DailyPlanItem>): PlanValidation | null {
  if (!plan) return null
  const items = Object.values(plan.sections)
    .flat()
    .map((item) => lockedItems[itemKey(item)] ?? item)
  const sorted = [...items].sort((a, b) => (toMinutes(a.startTime) ?? 0) - (toMinutes(b.startTime) ?? 0))

  let noOverlaps = true
  for (let i = 1; i < sorted.length; i += 1) {
    const prevEnd = toMinutes(sorted[i - 1].endTime)
    const start = toMinutes(sorted[i].startTime)
    if (prevEnd != null && start != null && start < prevEnd) {
      noOverlaps = false
      break
    }
  }

  const breaks = items.filter((item) => item.type === 'break').length
  const lockedCount = items.filter((item) => item.locked).length
  const dependencyBlocked = plan.unscheduled.filter((entry) => /depend/i.test(entry.reason)).length

  return { noOverlaps, breaksInserted: breaks > 0, breaks, lockedCount, dependencyBlocked }
}

function postponeMeta(status: PostponeStatus): { label: string; emoji: string; tone: string } {
  switch (status) {
    case 'POSTPONED_CAPACITY':
      return { label: 'Postponed — day full', emoji: '⌛', tone: 'bg-amber-500/15 text-amber-300' }
    case 'BLOCKED_DEPENDENCY':
      return { label: 'Blocked by dependency', emoji: '🔗', tone: 'bg-purple-500/15 text-purple-300' }
    case 'NO_VALID_TIME_SLOT':
      return { label: 'No free slot today', emoji: '🕘', tone: 'bg-sky-500/15 text-sky-300' }
    case 'INVALID_TASK_DATA':
      return { label: 'Needs a duration', emoji: '⚠️', tone: 'bg-red-500/15 text-red-300' }
    default:
      return { label: 'Not scheduled', emoji: '📥', tone: 'bg-slate-500/15 text-[var(--bp-subtle)]' }
  }
}

function priorityRank(priority: DailyPlanItem['priority']) {
  if (priority === 'urgent') return 4
  if (priority === 'high') return 3
  if (priority === 'medium') return 2
  return 1
}

function typeGlyph(type: DailyPlanItem['type']) {
  if (type === 'break') return '☕'
  if (type === 'reminder') return '🔔'
  if (type === 'calendar') return '📅'
  return '•'
}

function priorityTone(priority: DailyPlanItem['priority']) {
  if (priority === 'urgent' || priority === 'high') return 'red'
  if (priority === 'medium') return 'yellow'
  return 'green'
}

function itemKey(item: DailyPlanItem) {
  // Subtask granularity first: two subtasks of the same parent share a taskId but
  // must lock / dedupe independently, so they never collapse into one entry.
  return item.subtaskId ?? item.taskId ?? item.reminderId ?? item.id
}

function updatePlanItem(plan: DailyPlan, target: DailyPlanItem, field: 'startTime' | 'endTime', value: string): DailyPlan {
  const key = itemKey(target)
  const sections = Object.fromEntries(
    Object.entries(plan.sections).map(([section, items]) => [
      section,
      items.map((item) => (itemKey(item) === key ? { ...item, [field]: value, locked: true } : item)),
    ]),
  ) as DailyPlan['sections']
  return { ...plan, sections }
}

function matchesSearch(item: DailyPlanItem, search: string) {
  const query = search.trim().toLowerCase()
  if (!query) return true
  return `${item.title} ${item.category ?? ''} ${item.priority}`.toLowerCase().includes(query)
}

function currentTime() {
  const date = new Date()
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function toMinutes(hhmm?: string): number | null {
  if (!hhmm) return null
  const [hours, minutes] = hhmm.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  return hours * 60 + minutes
}

function minutesToClock(minutes: number): string {
  const normalized = Math.max(0, Math.min(23 * 60 + 59, minutes))
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`
}

function formatClock(hhmm: string): string {
  const total = toMinutes(hhmm)
  if (total == null) return hhmm
  let hours = Math.floor(total / 60)
  const minutes = total % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  hours %= 12
  if (hours === 0) hours = 12
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`
}

function formatDuration(minutes: number): string {
  if (!minutes) return '0m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours}h ${rest}m` : `${hours}h`
}

function formatLongDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatShortDate(iso: string): string {
  // Accepts either YYYY-MM-DD or a full ISO timestamp (deadlines are ISO).
  const date = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
