import { memo, useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/useTheme'
import type { AppTheme } from '../../theme/colors'

export type BottomNavPage = 'dashboard' | 'tasks' | 'reminders'

export type BottomNavHandlers = {
  onNavigateDashboard?: () => void
  onNavigateTasks?: () => void
  onNavigateReminders?: () => void
}

type BottomNavBarProps = BottomNavHandlers & {
  active: BottomNavPage
}

const TABS: { page: BottomNavPage; icon: string; label: string }[] = [
  { page: 'dashboard', icon: '▦', label: 'Dashboard' },
  { page: 'tasks', icon: '☑', label: 'Tasks' },
  { page: 'reminders', icon: '🔔', label: 'Reminders' },
]

export const BottomNavBar = memo(function BottomNavBar({
  active,
  onNavigateDashboard,
  onNavigateTasks,
  onNavigateReminders,
}: BottomNavBarProps) {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const handlers: Record<BottomNavPage, (() => void) | undefined> = {
    dashboard: onNavigateDashboard,
    tasks: onNavigateTasks,
    reminders: onNavigateReminders,
  }

  return (
    <View
      className="absolute left-5 right-5 flex-row items-stretch rounded-3xl px-2 py-3"
      style={{
        bottom: 16 + insets.bottom,
        backgroundColor: theme.colors.navigation,
        shadowColor: theme.colors.shadow,
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 4,
      }}
    >
      {TABS.map((tab) => (
        <NavItem
          key={tab.page}
          active={active === tab.page}
          icon={tab.icon}
          label={tab.label}
          onPress={handlers[tab.page]}
          theme={theme}
        />
      ))}
    </View>
  )
})

function NavItem({
  icon,
  label,
  active,
  onPress,
  theme,
}: {
  icon: string
  label: string
  active?: boolean
  onPress?: () => void
  theme: AppTheme
}) {
  const progress = useSharedValue(active ? 1 : 0)

  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, { duration: 180 })
  }, [active, progress])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + progress.value * 0.08 }],
  }))

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!active }}
      style={{ flex: 1, minHeight: 56, minWidth: 48 }}
      className="items-center justify-center active:opacity-70"
    >
      <Animated.View style={[{ alignItems: 'center' }, animatedStyle]}>
        <Text className="text-xl">{icon}</Text>
        <Text
          className="mt-0.5 text-xs font-bold"
          style={{ color: active ? theme.colors.accent : theme.colors.secondaryText }}
        >
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  )
}
