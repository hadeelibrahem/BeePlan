import { Pressable, Text, View } from 'react-native'
import {
  BottomNavBar,
  FloatingActionButton,
  ScreenLayout,
  SectionCard,
  StatsCard,
} from '../components/layout'
import { useTheme } from '../theme/useTheme'

type Props = {
  onSignOut: () => void
  onViewTasks: () => void
  onViewFocus?: () => void
  onViewReminders: () => void
  onCreateTask: () => void
}

export default function TasksDashboardScreen({
  onSignOut,
  onViewTasks,
  onViewFocus,
  onViewReminders,
  onCreateTask,
}: Props) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <ScreenLayout
      headerSubtitle="Good morning, Fatima 👋"
      onProfilePress={onSignOut}
      fab={<FloatingActionButton onPress={onCreateTask} aboveNavBar />}
      footer={<BottomNavBar active="dashboard" onNavigateTasks={onViewTasks} onNavigateFocus={onViewFocus} onNavigateReminders={onViewReminders} />}
    >
      <View className="mb-3 flex-row flex-wrap justify-between gap-y-3">
        <StatsCard icon="📅" value="8" title="Today's Tasks" />
        <StatsCard icon="✅" value="24" title="Completed" />
        <StatsCard icon="🚩" value="3" title="High Priority" />
        <StatsCard icon="⏰" value="2" title="Overdue" />
      </View>

      <SectionCard className="mb-3">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-bold" style={{ color: colors.text }}>Overall Progress</Text>
            <Text className="text-xs" style={{ color: colors.secondaryText }}>You're doing great! Keep it up.</Text>
          </View>

          <View className="h-12 w-12 items-center justify-center rounded-full border-[3px]" style={{ borderColor: colors.accent }}>
            <Text className="text-xs font-black" style={{ color: colors.accent }}>64%</Text>
          </View>
        </View>

        <View className="h-2 rounded-full" style={{ backgroundColor: colors.progressTrack }}>
          <View className="h-2 w-[64%] rounded-full" style={{ backgroundColor: colors.accent }} />
        </View>

        <View className="mt-2 flex-row justify-between">
          <Text className="text-xs" style={{ color: colors.secondaryText }}>24 completed</Text>
          <Text className="text-xs" style={{ color: colors.secondaryText }}>32 total tasks</Text>
        </View>
      </SectionCard>

      <SectionCard className="mb-3">
        <View className="mb-3 flex-row justify-between">
          <Text className="text-sm font-bold" style={{ color: colors.text }}>Today's Focus</Text>
          <Pressable onPress={onViewTasks} accessibilityRole="button" accessibilityLabel="View all tasks">
            <Text className="text-sm font-bold" style={{ color: colors.accent }}>View All ›</Text>
          </Pressable>
        </View>

        <FocusTask title="Finalize Q3 marketing strategy" time="10:00 AM" color={colors.error} />
        <FocusTask title="Review design mockups for mobile app" time="1:30 PM" color={colors.warning} />
        <FocusTask title="Team sync — weekly standup" time="9:00 AM" color={colors.accent} done />
        <FocusTask title="Update project documentation" time="4:00 PM" color={colors.secondaryText} />
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

function FocusTask({
  title,
  time,
  color,
  done,
}: {
  title: string
  time: string
  color: string
  done?: boolean
}) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <View className="mb-3 flex-row items-center gap-3">
      <View
        className="h-4 w-4 rounded-full border"
        style={{ borderColor: done ? colors.accent : colors.border, backgroundColor: done ? colors.accent : 'transparent' }}
      />
      <View className="flex-1">
        <Text
          className={`text-sm font-semibold ${done ? 'line-through' : ''}`}
          style={{ color: done ? colors.secondaryText : colors.text }}
        >
          {title}
        </Text>
        <Text className="text-xs" style={{ color: colors.secondaryText }}>{time}</Text>
      </View>
      <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
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
