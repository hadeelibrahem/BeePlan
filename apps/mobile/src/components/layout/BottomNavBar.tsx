import { Modal, Pressable, Text, View } from 'react-native'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/useTheme'
import { useLanguage } from '../../i18n/LanguageContext'
import { pressTab, TAB_ROUTES } from '../../navigation/tabBarContract'
import type { MainTabParamList, RootStackParamList } from '../../navigation/types'
import { MobileIcon, type MobileIconName } from './MobileIcon'

export const TAB_META: Record<typeof TAB_ROUTES[number], { label: string; icon: MobileIconName }> = {
  Dashboard: { label: 'navigation.dashboard', icon: 'dashboard' },
  Tasks: { label: 'navigation.tasks', icon: 'tasks' },
  Focus: { label: 'navigation.focus', icon: 'focus' },
} as const

export type BottomNavPage = 'dashboard' | 'tasks' | 'focus' | 'reminders' | 'people'
export type BottomNavHandlers = {
  onNavigateDashboard?: () => void
  onNavigateTasks?: () => void
  onNavigateFocus?: () => void
  onNavigateReminders?: () => void
}
type LegacyBottomNavProps = BottomNavHandlers & { active: BottomNavPage }

type MoreTabRoute = 'Reminders' | 'People'
type MoreStackRoute = 'Calendar' | 'AiDailyPlanner' | 'Notes' | 'Analytics' | 'Notifications' | 'Whiteboards' | 'AchievementMuseum' | 'TimeCapsules' | 'Feedback' | 'Challenges'

const MORE_DESTINATIONS: Array<{ label: string; labelKey?: string; route: MoreTabRoute | MoreStackRoute; icon: MobileIconName }> = [
  { label: 'navigation.reminders', route: 'Reminders', icon: 'reminders' },
  { label: 'navigation.people', route: 'People', icon: 'people' },
  { label: 'navigation.calendar', route: 'Calendar', icon: 'calendar' },
  { label: 'navigation.dailyPlanner', route: 'AiDailyPlanner', icon: 'planner' },
  { label: 'navigation.notes', route: 'Notes', icon: 'notes' },
  { label: 'navigation.analytics', route: 'Analytics', icon: 'analytics' },
  { label: 'navigation.achievementMuseum', route: 'AchievementMuseum', icon: 'trophy' },
  { label: 'navigation.timeCapsule', route: 'TimeCapsules', icon: 'planner' },
  { label: 'navigation.notifications', route: 'Notifications', icon: 'notifications' },
  { label: 'navigation.whiteboards', route: 'Whiteboards', icon: 'whiteboard' },
  { label: 'feedback.title', route: 'Feedback', icon: 'lightbulb' },
  { label: 'navigation.challenges', route: 'Challenges', icon: 'trophy' },
]

/** The single visual tab bar for navigator-backed main screens. */
export function NavigationBottomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme } = useTheme()
  const { t } = useLanguage()
  const insets = useSafeAreaInsets()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = ['Reminders', 'People'].includes(state.routes[state.index]?.name)
  const openDestination = (route: typeof MORE_DESTINATIONS[number]['route']) => {
    setMoreOpen(false)
    if (route === 'Reminders' || route === 'People') {
      navigation.navigate(route as keyof MainTabParamList)
      return
    }
    const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()
    if (parent) parent.navigate(route)
  }
  return (
    <>
      <View className="absolute bottom-0 left-0 right-0 flex-row px-5 pt-2" style={{ paddingBottom: insets.bottom + 12, backgroundColor: theme.colors.background }}>
        <View className="flex-1 flex-row rounded-3xl px-2 py-2" style={{ backgroundColor: theme.colors.navigation }}>
        {state.routes.filter((route) => TAB_ROUTES.includes(route.name as typeof TAB_ROUTES[number])).map((route) => {
          const index = state.routes.findIndex((item) => item.key === route.key)
          const meta = TAB_META[route.name as keyof typeof TAB_META]
          if (!meta) return null
          const active = state.index === index
          const options = descriptors[route.key].options
          return <Pressable key={route.key} accessibilityRole="tab" accessibilityLabel={options.tabBarAccessibilityLabel ?? t(meta.label)} accessibilityState={{ selected: active }} className="flex-1 items-center py-2" onPress={() => pressTab(active, route.name as keyof typeof TAB_META, route.key, () => navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true }), (name) => navigation.navigate(name))}>
            <MobileIcon name={meta.icon} color={active ? theme.colors.accent : theme.colors.secondaryText} size={20} />
            <Text className="mt-1 text-xs font-bold" style={{ color: active ? theme.colors.accent : theme.colors.secondaryText }}>{t(meta.label)}</Text>
          </Pressable>
        })}
          <Pressable accessibilityRole="button" accessibilityLabel={t('navigation.moreDestinations')} accessibilityState={{ selected: moreActive }} className="flex-1 items-center py-2" onPress={() => setMoreOpen(true)}>
            <MobileIcon name="more" color={moreActive ? theme.colors.accent : theme.colors.secondaryText} size={20} />
            <Text className="mt-1 text-xs font-bold" style={{ color: moreActive ? theme.colors.accent : theme.colors.secondaryText }}>{t('navigation.more')}</Text>
          </Pressable>
        </View>
      </View>
      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0, 0, 0, 0.32)' }}>
          <Pressable className="flex-1" accessibilityRole="button" accessibilityLabel={t('navigation.closeMore')} onPress={() => setMoreOpen(false)} />
          <View className="rounded-t-3xl px-5 pt-3" style={{ backgroundColor: theme.colors.surfaceElevated, paddingBottom: insets.bottom + 20 }}>
            <View className="mb-4 h-1 self-center rounded-full" style={{ backgroundColor: theme.colors.border, width: 36 }} />
            <Text className="mb-3 text-lg font-bold" style={{ color: theme.colors.text }}>{t('navigation.more')}</Text>
            <View className="flex-row flex-wrap">
              {MORE_DESTINATIONS.map((destination) => (
                <Pressable key={destination.route} accessibilityRole="button" accessibilityLabel={t(destination.labelKey ?? destination.label)} className="mb-3 w-1/3 items-center rounded-2xl py-3" onPress={() => openDestination(destination.route)}>
                  <View className="items-center justify-center rounded-2xl" style={{ backgroundColor: theme.colors.navigation, height: 46, width: 46 }}>
                    <MobileIcon name={destination.icon} color={theme.colors.icon} size={21} />
                  </View>
                  <Text className="mt-2 text-center text-xs font-bold" style={{ color: theme.colors.text }}>{t(destination.labelKey ?? destination.label)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

/** @deprecated Legacy screens keep compiling; migrated tabs render NavigationBottomTabBar instead. */
export function BottomNavBar(_: LegacyBottomNavProps) { return null }
