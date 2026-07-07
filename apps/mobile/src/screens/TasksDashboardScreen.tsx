import { Pressable, Text, View } from 'react-native'
import {
  BottomNavBar,
  FloatingActionButton,
  ScreenLayout,
  SectionCard,
  StatsCard,
} from '../components/layout'
import type { ApiTask, DashboardSummary } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'

type Props = {
  onSignOut: () => void
  onViewTasks: () => void
  onViewFocus?: () => void
  onViewReminders: () => void
  onCreateTask: () => void
  tasks?: ApiTask[]
  summary?: DashboardSummary | null
  summaryLoading?: boolean
  summaryError?: string
  tasksLoading?: boolean
  onRetrySummary?: () => void
}

export default function TasksDashboardScreen({
  onSignOut,
  onViewTasks,
  onViewFocus,
  onViewReminders,
  onCreateTask,
  tasks = [],
  summary = null,
  summaryLoading = false,
  summaryError = '',
  tasksLoading = false,
  onRetrySummary,
}: Props) {
  const { theme } = useTheme()
  const { colors } = theme
  const isLoading = summaryLoading && !summary
  const loadingLabel = '...'
  const todayTasksValue = isLoading ? loadingLabel : String(summary?.todayTasks ?? 0)
  const completedValue = isLoading ? loadingLabel : String(summary?.completedTasks ?? 0)
  const highPriorityValue = isLoading ? loadingLabel : String(summary?.highPriorityTasks ?? 0)
  const remindersValue = isLoading ? loadingLabel : String(summary?.reminders ?? 0)
  const totalTasks = summary?.totalTasks ?? 0
  const completedTasks = summary?.completedTasks ?? 0
  const overallProgress = summary?.overallProgress ?? 0
  const focusTasks = getDashboardFocusTasks(tasks)
  const isFocusLoading = tasksLoading && tasks.length === 0

  return (
    <ScreenLayout
      headerSubtitle="Good morning, Fatima"
      onProfilePress={onSignOut}
      fab={<FloatingActionButton onPress={onCreateTask} aboveNavBar />}
      footer={<BottomNavBar active="dashboard" onNavigateTasks={onViewTasks} onNavigateFocus={onViewFocus} onNavigateReminders={onViewReminders} />}
    >
      {summaryError ? (
        <View className="mb-3 rounded-2xl border px-3 py-2" style={{ borderColor: colors.error, backgroundColor: `${colors.error}14` }}>
          <Text className="text-xs font-bold" style={{ color: colors.error }}>
            {summaryError}
          </Text>
          {onRetrySummary ? (
            <Pressable onPress={onRetrySummary} accessibilityRole="button" className="mt-2 self-start">
              <Text className="text-xs font-bold" style={{ color: colors.accent }}>
                Retry
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <View className="mb-3 flex-row flex-wrap justify-between gap-y-3">
        <StatsCard icon="📅" value={todayTasksValue} title="Today's Tasks" />
        <StatsCard icon="✓" value={completedValue} title="Completed" />
        <StatsCard icon="🚩" value={highPriorityValue} title="High Priority" />
        <StatsCard icon="⏰" value={remindersValue} title="Reminders" />
      </View>

      <SectionCard className="mb-3">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-bold" style={{ color: colors.text }}>Overall Progress</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>You're doing great! Keep it up.</Text>
          </View>

          <View className="h-12 w-12 items-center justify-center rounded-full border-[3px]" style={{ borderColor: colors.accent }}>
            <Text className="text-xs font-black" style={{ color: colors.accent }}>{isLoading ? loadingLabel : `${overallProgress}%`}</Text>
          </View>
        </View>

        <View className="h-2 rounded-full" style={{ backgroundColor: colors.progressTrack }}>
          <View className="h-2 rounded-full" style={{ width: `${overallProgress}%`, backgroundColor: colors.accent }} />
        </View>

        <View className="mt-2 flex-row justify-between">
          <Text className="text-xs" style={{ color: colors.secondaryText }}>{completedTasks} completed</Text>
          <Text className="text-xs" style={{ color: colors.secondaryText }}>{totalTasks} total tasks</Text>
        </View>
      </SectionCard>

      <SectionCard className="mb-3">
        <View className="mb-3 flex-row justify-between">
          <Text className="text-sm font-bold" style={{ color: colors.text }}>Today's Focus</Text>
          <Pressable onPress={onViewTasks} accessibilityRole="button" accessibilityLabel="View all tasks">
            <Text className="text-sm font-bold" style={{ color: colors.accent }}>View All ›</Text>
          </Pressable>
        </View>

        {isFocusLoading ? (
          <Text className="py-6 text-center text-sm" style={{ color: colors.secondaryText }}>Loading focus tasks...</Text>
        ) : focusTasks.length ? (
          focusTasks.map((task) => <FocusTask key={task.id} task={task} />)
        ) : (
          <View className="items-center justify-center py-6">
            <View className="mb-3 h-11 w-11 items-center justify-center rounded-full" style={{ backgroundColor: colors.accentSoft }}>
              <Text className="text-base" style={{ color: colors.accent }}>◎</Text>
            </View>
            <Text className="text-center text-sm font-semibold" style={{ color: colors.text }}>
              No focus tasks for today.
            </Text>
            <Text className="mt-1 max-w-[260px] text-center text-xs" style={{ color: colors.secondaryText }}>
              Tasks due today, focus tasks, or high-priority tasks will appear here.
            </Text>
          </View>
        )}
      </SectionCard>

      <SectionCard>
        <Text className="mb-3 text-sm font-bold" style={{ color: colors.text }}>Quick Actions</Text>

        <View className="gap-2">
          <ActionCard icon="➕" title="New Task" desc="Create a new task" onPress={onCreateTask} />
          <ActionCard icon="🔔" title="New Reminder" desc="Add a reminder" onPress={onViewReminders} />
          <ActionCard icon="📅" title="View Calendar" desc="See your schedule" />
          <ActionCard icon="📂" title="All Tasks" desc="View all tasks" onPress={onViewTasks} />
        </View>
      </SectionCard>
    </ScreenLayout>
  )
}

function FocusTask({ task }: { task: ApiTask }) {
  const { theme } = useTheme()
  const { colors } = theme
  const reason = getPrimaryFocusReason(task)
  const dueLabel = formatFocusDue(task)
  const reasonColor =
    reason === 'Due Today' ? colors.accent : reason === 'Focus' ? colors.primary : colors.warning

  return (
    <View className="mb-3 flex-row items-center gap-3 last:mb-0">
      <View className="h-4 w-4 rounded-full border" style={{ borderColor: colors.border }} />
      <View className="min-w-0 flex-1">
        <Text className="truncate text-sm font-semibold" style={{ color: colors.text }}>
          {task.title}
        </Text>
        <Text className="truncate text-xs" style={{ color: colors.secondaryText }}>
          {task.category || 'General'}
          {dueLabel ? ` • ${dueLabel}` : ''}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: reasonColor }} />
        <Text className="text-[10px] font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
          {reason}
        </Text>
      </View>
    </View>
  )
}

function ActionCard({
  icon,
  title,
  desc,
  onPress,
}: {
  icon: string
  title: string
  desc: string
  onPress?: () => void
}) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="rounded-xl border p-3 active:opacity-80"
      style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}
    >
      <View className="mb-1.5 h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: colors.accentSoft }}>
        <Text className="text-sm">{icon}</Text>
      </View>
      <Text className="text-sm font-bold" style={{ color: colors.text }}>{title}</Text>
      <Text className="text-xs" style={{ color: colors.secondaryText }}>{desc}</Text>
    </Pressable>
  )
}

function getDashboardFocusTasks(tasks: ApiTask[]) {
  const { startOfToday, startOfTomorrow } = getUtcDayBounds()

  return tasks
    .filter((task) => task.status !== 'done' && task.status !== 'missed')
    .map((task) => ({
      task,
      reasons: getTaskFocusReasons(task, startOfToday, startOfTomorrow),
    }))
    .filter(({ reasons }) => reasons.length > 0)
    .sort((left, right) => {
      const leftScore = focusScore(left.reasons)
      const rightScore = focusScore(right.reasons)

      if (leftScore !== rightScore) return rightScore - leftScore

      const leftDue = left.task.dueDate ? new Date(left.task.dueDate).getTime() : Number.POSITIVE_INFINITY
      const rightDue = right.task.dueDate ? new Date(right.task.dueDate).getTime() : Number.POSITIVE_INFINITY
      if (leftDue !== rightDue) return leftDue - rightDue

      return left.task.title.localeCompare(right.task.title)
    })
    .map(({ task }) => task)
}

function getTaskFocusReasons(task: ApiTask, startOfToday: number, startOfTomorrow: number) {
  const reasons: string[] = []
  const dueTime = task.dueDate ? new Date(task.dueDate).getTime() : null

  if (dueTime !== null && dueTime >= startOfToday && dueTime < startOfTomorrow) {
    reasons.push('Due Today')
  }

  if (task.isFocusTask) {
    reasons.push('Focus')
  }

  if (task.priority === 'high') {
    reasons.push('High Priority')
  }

  return reasons
}

function getPrimaryFocusReason(task: ApiTask) {
  const { startOfToday, startOfTomorrow } = getUtcDayBounds()
  const reasons = getTaskFocusReasons(task, startOfToday, startOfTomorrow)
  return reasons[0] ?? 'Focus'
}

function getUtcDayBounds() {
  const now = new Date()
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const startOfTomorrow = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  return { startOfToday, startOfTomorrow }
}

function focusScore(reasons: string[]) {
  return reasons.reduce((score, reason) => {
    if (reason === 'Due Today') return score + 3
    if (reason === 'Focus') return score + 2
    if (reason === 'High Priority') return score + 1
    return score
  }, 0)
}

function formatFocusDue(task: ApiTask) {
  if (!task.dueDate) return task.dueTime ? `at ${formatTime(task.dueTime)}` : ''

  const date = new Date(task.dueDate)
  if (Number.isNaN(date.getTime())) return task.dueTime ? `at ${formatTime(task.dueTime)}` : ''

  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
  return task.dueTime ? `${dateLabel} at ${formatTime(task.dueTime)}` : dateLabel
}

function formatTime(time: string) {
  const [hoursStr, minutesStr] = time.split(':')
  const hours = Number(hoursStr)
  const minutes = Number(minutesStr)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time

  const isPm = hours >= 12
  const displayHours = hours % 12 === 0 ? 12 : hours % 12
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${isPm ? 'PM' : 'AM'}`
}
