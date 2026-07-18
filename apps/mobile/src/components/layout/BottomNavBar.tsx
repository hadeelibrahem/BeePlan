import { Pressable, Text, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/useTheme'
import { pressTab, TAB_ROUTES } from '../../navigation/tabBarContract'
import { MobileIcon, type MobileIconName } from './MobileIcon'

export const TAB_META: Record<typeof TAB_ROUTES[number], { label: string; icon: MobileIconName }> = {
  Dashboard: { label: 'Dashboard', icon: 'dashboard' },
  Tasks: { label: 'Tasks', icon: 'tasks' },
  Focus: { label: 'Focus', icon: 'focus' },
  Reminders: { label: 'Reminders', icon: 'reminders' },
  People: { label: 'People', icon: 'people' },
} as const

export type BottomNavPage = 'dashboard' | 'tasks' | 'focus' | 'reminders' | 'people'
export type BottomNavHandlers = {
  onNavigateDashboard?: () => void
  onNavigateTasks?: () => void
  onNavigateFocus?: () => void
  onNavigateReminders?: () => void
}
type LegacyBottomNavProps = BottomNavHandlers & { active: BottomNavPage }

/** The single visual tab bar for navigator-backed main screens. */
export function NavigationBottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View className="absolute bottom-0 left-0 right-0 flex-row px-5 pt-2" style={{ paddingBottom: insets.bottom + 12, backgroundColor: theme.colors.background }}>
      <View className="flex-1 flex-row rounded-3xl px-2 py-2" style={{ backgroundColor: theme.colors.navigation }}>
        {state.routes.filter((route) => TAB_ROUTES.includes(route.name as typeof TAB_ROUTES[number])).map((route) => {
          const index = state.routes.findIndex((item) => item.key === route.key)
          const meta = TAB_META[route.name as keyof typeof TAB_META]
          if (!meta) return null
          const active = state.index === index
          const options = descriptors[route.key].options
          return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={options.tabBarAccessibilityLabel ?? meta.label} accessibilityState={{ selected: active }} className="flex-1 items-center py-2" onPress={() => pressTab(active, route.name as keyof typeof TAB_META, route.key, () => navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }), (name) => navigation.navigate(name))}>
            <MobileIcon name={meta.icon} color={active ? theme.colors.accent : theme.colors.secondaryText} size={20} />
            <Text className="mt-1 text-xs font-bold" style={{ color: active ? theme.colors.accent : theme.colors.secondaryText }}>{meta.label}</Text>
          </Pressable>
        })}
      </View>
    </View>
  )
}

/** @deprecated Legacy screens keep compiling; migrated tabs render NavigationBottomTabBar instead. */
export function BottomNavBar(_: LegacyBottomNavProps) { return null }
