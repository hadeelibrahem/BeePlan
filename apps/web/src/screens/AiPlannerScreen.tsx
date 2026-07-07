import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AppLayout, PageHeader, TopActionBar, type SidebarNavHandlers } from '../components/layout'
import { OutlineButton, PrimaryButton, SecondaryButton } from '../components/layout/Buttons'
import { useLanguage } from '../i18n/LanguageContext'
import {
  generateDailyPlan,
  getPlannerPreferences,
  updatePlannerPreferences,
  type DailyPlan,
  type DailyPlanItem,
  type EnergyLevel,
  type PlannerPreferences,
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
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('simple')
  const [preferences, setPreferences] = useState<PlannerPreferences | null>(null)
  const [lockedItems, setLockedItems] = useState<Record<string, DailyPlanItem>>({})

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
    void loadPlan()
  }, [accessToken, refreshKey])

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

  async function loadPlan(lockedOverride?: typeof lockedPayload) {
    if (!accessToken) return

    setLoading(true)
    setError('')
    setAccepted(false)
    try {
      const nextPlan = await generateDailyPlan(accessToken, {
        date: new Date().toISOString().slice(0, 10),
        currentTime: currentTime(),
        lockedItems: lockedOverride ?? lockedPayload,
      })
      setPlan(nextPlan)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to generate today\'s plan.')
    } finally {
      setLoading(false)
    }
  }

  function resetPlan() {
    setLockedItems({})
    setAccepted(false)
    void loadPlan([])
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
    setLockedItems((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? item),
        [field]: value,
        locked: true,
      },
    }))
    setPlan((current) => (current ? updatePlanItem(current, item, field, value) : current))
  }

  const planDate = plan?.date ?? new Date().toISOString().slice(0, 10)
  const progressPercent = Math.min(100, Math.round((completedCount / Math.max(1, taskCount)) * 100))
  const detailed = viewMode === 'detailed'

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
      panelCaption={plan?.source === 'ai' ? 'AI generated' : 'Rules fallback'}
      panelPercent={progressPercent}
    >
      <PageHeader
        title="AI Planner"
        subtitle="A clean daily schedule first — open the details to see how the AI planned it."
        toolbar={
          <TopActionBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search plan..."
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
      />

      {/* HERO — today's plan summary + key stats -------------------------- */}
      <section className="mb-4 overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-gradient-to-br from-[var(--bp-accent)]/[0.08] via-[var(--bp-surface)] to-[var(--bp-surface)] p-5 shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]">
                <SparkleGlyph />
              </span>
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">Today&apos;s Plan</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                  plan?.source === 'ai' ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]' : 'bg-slate-500/15 text-slate-300'
                }`}
              >
                {plan?.source === 'ai' ? 'AI generated' : 'Rules fallback'}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-[var(--bp-text)]">{formatLongDate(planDate)}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
              {plan?.summary ?? 'Generate an optimized schedule for the rest of your day and let the assistant sequence your work.'}
            </p>
          </div>

          {/* Progress ring */}
          <div className="flex shrink-0 items-center gap-4 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-bg)]/60 p-4">
            <div className="relative flex items-center justify-center">
              <ProgressRing percent={progressPercent} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-black text-[var(--bp-text)]">{progressPercent}%</span>
                <span className="text-[10px] font-bold uppercase text-slate-500">done</span>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <RingStat label="Completed" value={String(completedCount)} tone="text-green-300" />
              <RingStat label="Remaining" value={String(Math.max(0, taskCount - completedCount))} tone="text-[var(--bp-text)]" />
              <RingStat label="Focus hours" value={insights ? formatDuration(insights.focusMinutes) : '0m'} tone="text-sky-300" />
            </div>
          </div>
        </div>

        {/* Key stats — planned work / tasks / breaks */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <StatTile emoji="⏱️" label="Planned work" value={formatDuration(plannedMinutes)} />
          <StatTile emoji="✅" label="Tasks" value={String(taskCount)} />
          <StatTile emoji="☕" label="Breaks" value={String(insights?.breaks ?? 0)} />
        </div>
      </section>

      {/* ACTION BAR + VIEW TOGGLE ---------------------------------------- */}
      <section className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3 shadow-xl">
        <PrimaryButton size="md" onClick={() => void loadPlan()} loading={loading}>
          <span className="inline-flex items-center gap-1.5"><SparkleGlyph className="h-4 w-4" /> Generate Smart Plan</span>
        </PrimaryButton>
        <OutlineButton size="md" onClick={() => void loadPlan()} disabled={loading}>
          <span className="inline-flex items-center gap-1.5"><RefreshGlyph /> Regenerate</span>
        </OutlineButton>
        <SecondaryButton size="md" onClick={() => setAccepted(true)} disabled={!plan || loading}>
          <span className="inline-flex items-center gap-1.5"><CheckGlyph /> {accepted ? 'Accepted' : 'Accept Plan'}</span>
        </SecondaryButton>
        <OutlineButton size="md" onClick={resetPlan} disabled={loading}>
          <span className="inline-flex items-center gap-1.5"><RefreshGlyph /> Reset</span>
        </OutlineButton>
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </section>

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
        <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-8 text-center text-sm font-bold text-slate-400 shadow-xl">
          Generating your smart daily plan...
        </div>
      ) : null}

      {plan ? (
        <div className="space-y-4">
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
                  <span className="text-xs font-bold text-slate-500">
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
                            onComplete={item.taskId ? () => onCompleteTask?.(item.taskId!) : undefined}
                          />
                        </TimelineRow>
                      )
                    })}
                  </div>
                ) : (
                  <p className="py-2 text-sm text-slate-500">Nothing planned here.</p>
                )}
              </section>
            )
          })}

          {plan.unscheduled.length ? (
            <section className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.04] p-4 shadow-xl">
              <h3 className="flex items-center gap-2 text-sm font-black text-[var(--bp-text)]">
                <span>📥</span> Could not fit these tasks today
              </h3>
              <p className="mb-3 mt-1 text-xs text-slate-400">
                {plan.unscheduled.length} task{plan.unscheduled.length > 1 ? 's' : ''} left unscheduled by the planner.
              </p>
              <div className="space-y-2">
                {plan.unscheduled.map((item, index) => {
                  const category = unscheduledCategory(item.reason)
                  return (
                    <div
                      key={`${item.taskId ?? item.reminderId ?? index}`}
                      className="rounded-xl border border-dashed border-amber-500/30 bg-[var(--bp-bg)] p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-[var(--bp-text)]">{item.title}</p>
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${category.tone}`}>
                          <span>{category.emoji}</span> {category.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

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
                      <p className="flex items-center gap-1.5 text-xs font-black uppercase text-slate-500">
                        <span>📈</span> Productivity Score
                      </p>
                      <span className="text-lg font-black text-[var(--bp-accent)]">{insights?.productivityScore ?? 0}</span>
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
                      <div key={index} className="flex items-start gap-2.5 rounded-xl bg-[var(--bp-bg)] p-3 text-sm text-slate-300">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--bp-accent)]/15 text-xs text-[var(--bp-accent)]">
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
            <p className="pt-1 text-center text-xs text-slate-500">
              Switch to <span className="font-bold text-[var(--bp-text)]">Detailed View</span> to see reasons, validation, and how the AI built this plan.
            </p>
          )}
        </div>
      ) : null}
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
            mode === value ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]' : 'text-slate-400 hover:text-[var(--bp-text)]'
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

  function update<K extends keyof PlannerPreferences>(key: K, value: PlannerPreferences[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setMessage(null)
  }

  function updateEnergy(part: keyof PlannerPreferences['energy'], value: EnergyLevel) {
    setDraft((current) => ({ ...current, energy: { ...current.energy, [part]: value } }))
    setMessage(null)
  }

  const start = toMinutes(draft.focusStartTime)
  const end = toMinutes(draft.focusEndTime)
  const invalidFocus = start != null && end != null && start >= end

  async function handleSave() {
    if (invalidFocus) {
      setMessage({ ok: false, text: 'Focus start time must be before focus end time.' })
      return
    }
    setSaving(true)
    const result = await onSave(draft)
    setSaving(false)
    setMessage({ ok: result.ok, text: result.message })
  }

  return (
    <CollapsibleSection title="AI Planning Preferences" emoji="⚙️" defaultOpen={false}>
      <p className="mb-3 text-xs text-slate-400">
        Teach BeePlan how you like your day planned. Saved preferences apply the next time you generate a plan — they never
        override deadlines, reminders, dependencies, or locked tasks.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <PrefGroup title="Focus hours" hint="When you do your best deep work.">
          <div className="flex items-end gap-2">
            <PrefTime label="From" value={draft.focusStartTime} onChange={(value) => update('focusStartTime', value)} />
            <PrefTime label="To" value={draft.focusEndTime} onChange={(value) => update('focusEndTime', value)} />
          </div>
          {invalidFocus ? <p className="mt-1 text-[11px] font-bold text-red-300">Start must be before end.</p> : null}
        </PrefGroup>

        <PrefGroup title="Break style" hint="How long you work before a break.">
          <div className="flex items-end gap-2">
            <PrefNumber label="Work block (min)" value={draft.workBlockMinutes} min={15} max={120} onChange={(value) => update('workBlockMinutes', value)} />
            <PrefNumber label="Break (min)" value={draft.breakMinutes} min={5} max={30} onChange={(value) => update('breakMinutes', value)} />
          </div>
        </PrefGroup>

        <PrefGroup title="Energy pattern" hint="Difficult work is placed in your high-energy periods." className="md:col-span-2">
          <div className="grid gap-2 sm:grid-cols-4">
            {(['morning', 'afternoon', 'evening', 'night'] as const).map((part) => (
              <PrefEnergy key={part} label={capitalize(part)} value={draft.energy[part]} onChange={(value) => updateEnergy(part, value)} />
            ))}
          </div>
        </PrefGroup>

        <PrefGroup title="Planning rules" className="md:col-span-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <PrefToggle label="Schedule difficult tasks during focus hours" checked={draft.scheduleHardTasksInFocus} onChange={(value) => update('scheduleHardTasksInFocus', value)} />
            <PrefToggle label="Finish started tasks first" checked={draft.finishStartedFirst} onChange={(value) => update('finishStartedFirst', value)} />
            <PrefToggle label="Group similar tasks together" checked={draft.groupSimilarTasks} onChange={(value) => update('groupSimilarTasks', value)} />
            <PrefToggle label="Leave buffer before reminders/meetings" checked={draft.bufferBeforeMeetings} onChange={(value) => update('bufferBeforeMeetings', value)} />
          </div>
          {draft.bufferBeforeMeetings ? (
            <div className="mt-2 w-44">
              <PrefNumber label="Buffer before meetings (min)" value={draft.bufferMinutes} min={0} max={60} onChange={(value) => update('bufferMinutes', value)} />
            </div>
          ) : null}
        </PrefGroup>

        <PrefGroup title="Personal note" hint="Anything else about how you like your day planned." className="md:col-span-2">
          <textarea
            value={draft.note}
            maxLength={1000}
            rows={3}
            onChange={(event) => update('note', event.target.value)}
            placeholder="Tell BeePlan how you like your day planned..."
            className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-sm text-[var(--bp-text)] placeholder:text-slate-500"
          />
          <p className="mt-0.5 text-right text-[11px] text-slate-500">{draft.note.length}/1000</p>
        </PrefGroup>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <PrimaryButton size="sm" onClick={handleSave} loading={saving} disabled={invalidFocus}>
          Save Preferences
        </PrimaryButton>
        {message ? (
          <span className={`text-xs font-bold ${message.ok ? 'text-green-300' : 'text-red-300'}`}>{message.text}</span>
        ) : null}
      </div>
    </CollapsibleSection>
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
      <p className="mb-2 mt-0.5 min-h-[14px] text-[11px] text-slate-500">{hint ?? ''}</p>
      {children}
    </div>
  )
}

function PrefTime({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex-1">
      <span className="mb-1 block text-[11px] font-bold text-slate-500">{label}</span>
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
      <span className="mb-1 block text-[11px] font-bold text-slate-500">{label}</span>
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

function PrefEnergy({ label, value, onChange }: { label: string; value: EnergyLevel; onChange: (value: EnergyLevel) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-bold text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as EnergyLevel)}
        className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1.5 text-xs font-bold text-[var(--bp-text)]"
      >
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </label>
  )
}

function PrefToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-lg bg-[var(--bp-bg)] px-2.5 py-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--bp-accent)]"
      />
      <span className="text-xs font-bold text-[var(--bp-text)]">{label}</span>
    </label>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function RingStat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span className={`text-sm font-black ${tone}`}>{value}</span>
    </div>
  )
}

function ProgressRing({ percent, size = 92, stroke = 8 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--bp-border)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--bp-accent)"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700"
      />
    </svg>
  )
}

function StatTile({ emoji, label, value }: { emoji: string; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)]/60 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--bp-accent)]/40">
      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-500">
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
        <ChevronGlyph className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <div className="mt-3">{children}</div> : null}
    </section>
  )
}

function InsightCard({ emoji, title, body, hint }: { emoji: string; title: string; body: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-[var(--bp-bg)] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-black uppercase text-slate-500">
        <span>{emoji}</span> {title}
      </p>
      <p className="mt-1 text-sm font-bold leading-snug text-[var(--bp-text)]">{body}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
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
        <p className="text-[11px] font-semibold text-slate-500">
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
  onComplete,
}: {
  item: DailyPlanItem
  completed: boolean
  locked: boolean
  current: boolean
  onLock: () => void
  onMove: (field: 'startTime' | 'endTime', value: string) => void
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
      className={`group rounded-xl border p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
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
            {item.category ? <Badge tone="plain">{item.category}</Badge> : null}
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-[var(--bp-accent)]/15 px-1.5 py-0.5 text-[10px] font-black uppercase text-[var(--bp-accent)]">
                <LockGlyph /> Locked
              </span>
            ) : null}
          </div>

          {/* time + duration + Why? */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            {editing ? (
              <>
                <input
                  type="time"
                  value={item.startTime}
                  onChange={(event) => onMove('startTime', event.target.value)}
                  className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1 text-xs font-bold text-[var(--bp-text)]"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="time"
                  value={item.endTime}
                  onChange={(event) => onMove('endTime', event.target.value)}
                  className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-2 py-1 text-xs font-bold text-[var(--bp-text)]"
                />
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-bold text-slate-300">
                <ClockGlyph />
                {formatClock(item.startTime)} – {formatClock(item.endTime)}
              </span>
            )}
            <span className="rounded-md bg-[var(--bp-bg)] px-1.5 py-0.5 font-bold text-slate-400">{formatDuration(item.durationMinutes)}</span>
            {item.rationale ? (
              <button
                type="button"
                onClick={() => setShowWhy((value) => !value)}
                aria-expanded={showWhy}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-[var(--bp-accent)] transition hover:bg-[var(--bp-accent)]/10"
              >
                {showWhy ? 'Hide' : 'Why?'}
                <ChevronGlyph className={`h-3 w-3 transition-transform duration-200 ${showWhy ? 'rotate-180' : ''}`} />
              </button>
            ) : null}
          </div>

          {/* AI reason — hidden until "Why?" is clicked */}
          {showWhy && item.rationale ? (
            <div className="mt-2 rounded-lg border border-[var(--bp-accent)]/20 bg-[var(--bp-accent)]/[0.05] px-2.5 py-2">
              <p className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-[var(--bp-accent)]">
                <SparkleGlyph className="h-3 w-3" /> Scheduled here because
              </p>
              <p className="mt-0.5 text-xs leading-snug text-slate-300">{item.rationale}</p>
            </div>
          ) : null}
        </div>

        {/* actions */}
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={onLock}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-black transition ${
              locked ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]' : 'bg-[var(--bp-border)] text-[var(--bp-text)] hover:brightness-110'
            }`}
          >
            <LockGlyph /> {locked ? 'Locked' : 'Lock'}
          </button>
          <button
            type="button"
            onClick={() => setEditing((value) => !value)}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-300 transition hover:bg-[var(--bp-border)]/50 hover:text-[var(--bp-text)]"
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
    yellow: 'bg-yellow-500/15 text-yellow-300',
    green: 'bg-green-500/15 text-green-300',
    focus: 'bg-blue-500/15 text-blue-300',
    plain: 'bg-[var(--bp-bg)] text-slate-300',
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
          ai ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]' : 'bg-amber-500/15 text-amber-300'
        }`}
      >
        {ai ? <SparkleGlyph className="h-5 w-5" /> : <ShieldGlyph className="h-5 w-5" />}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-black text-[var(--bp-text)]">
          {ai ? 'Generated with AI reasoning, validated by scheduling rules.' : 'Generated by rules.'}
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {ai
            ? 'The AI reasoning layer ranked your tasks, then the rule engine validated the schedule.'
            : 'Generated by rules because AI was unavailable or returned an invalid plan.'}
        </p>
      </div>
      <span
        className={`ml-auto shrink-0 self-center rounded-full px-3 py-1 text-[10px] font-black uppercase ${
          ai ? 'bg-[var(--bp-accent)]/15 text-[var(--bp-accent)]' : 'bg-amber-500/15 text-amber-300'
        }`}
      >
        {ai ? 'AI + Rules' : 'Rules only'}
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
          title="Rule Engine"
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
          title="AI Reasoning"
          accent="text-[var(--bp-accent)]"
          active={source === 'ai'}
          items={[
            'Ranked tasks by urgency, priority, focus, progress & due dates',
            'Added a human explanation for each task',
          ]}
        />
        <StepCard
          step={3}
          emoji="🗓️"
          title="Scheduler Engine"
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
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--bp-surface)] text-xs font-black text-slate-300">
          {step}
        </span>
        <span className="text-base">{emoji}</span>
        <h4 className={`text-sm font-black ${accent}`}>{title}</h4>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((entry, index) => (
          <li key={index} className="flex items-start gap-1.5 text-xs text-slate-400">
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
    ? 'bg-slate-500/15 text-slate-400'
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
        {detail ? <p className="text-[11px] text-slate-500">{detail}</p> : null}
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
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--bp-surface)] text-xs font-black text-[var(--bp-accent)]">
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

function unscheduledCategory(reason: string): { label: string; emoji: string; tone: string } {
  const value = reason.toLowerCase()
  if (value.includes('depend')) return { label: 'Blocked by dependency', emoji: '🔗', tone: 'bg-purple-500/15 text-purple-300' }
  if (value.includes('hour') || value.includes('working')) return { label: 'Outside working hours', emoji: '🕘', tone: 'bg-sky-500/15 text-sky-300' }
  if (value.includes('time') || value.includes('fit')) return { label: 'Not enough time', emoji: '⌛', tone: 'bg-amber-500/15 text-amber-300' }
  return { label: 'Unscheduled', emoji: '📥', tone: 'bg-slate-500/15 text-slate-300' }
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
  return item.taskId ?? item.reminderId ?? item.id
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
