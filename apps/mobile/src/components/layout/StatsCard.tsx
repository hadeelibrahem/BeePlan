import { memo } from 'react'
import { Text, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { SectionCard } from './SectionCard'
import { MobileIcon, type MobileIconName } from './MobileIcon'

type StatsCardProps = {
  /** Legacy string values remain accepted while callers move to MobileIconName. */
  icon: MobileIconName | string
  value: string
  title: string
  width?: 'half' | 'full'
}

export const StatsCard = memo(function StatsCard({ icon, value, title, width = 'half' }: StatsCardProps) {
  const { theme } = useTheme()
  const resolvedIcon = resolveIcon(icon, title)

  return (
    <SectionCard className={width === 'half' ? 'w-[48%]' : 'w-full'}>
      <View className="mb-2 h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: theme.colors.accentSoft }}>
        <MobileIcon name={resolvedIcon} color={theme.colors.accent} size={18} accessibilityLabel={`${title} icon`} />
      </View>
      <Text className="text-xl font-black" style={{ color: theme.colors.text }}>{value}</Text>
      <Text className="mt-0.5 text-xs font-semibold" style={{ color: theme.colors.secondaryText }}>{title}</Text>
    </SectionCard>
  )
})

function resolveIcon(icon: StatsCardProps['icon'], title: string): MobileIconName {
  const names: MobileIconName[] = ['dashboard', 'tasks', 'focus', 'reminders', 'people', 'notifications', 'calendar', 'check', 'priority', 'add', 'search', 'filter', 'folder']
  if (names.includes(icon as MobileIconName)) return icon as MobileIconName
  if (/complete|done/i.test(title)) return 'check'
  if (/priority/i.test(title)) return 'priority'
  if (/reminder/i.test(title)) return 'reminders'
  if (/today|calendar/i.test(title)) return 'calendar'
  return 'tasks'
}
