import { memo } from 'react'
import { Text, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { SectionCard } from './SectionCard'

type StatsCardProps = {
  icon: string
  value: string
  title: string
  width?: 'half' | 'full'
}

export const StatsCard = memo(function StatsCard({ icon, value, title, width = 'half' }: StatsCardProps) {
  const { theme } = useTheme()

  return (
    <SectionCard className={width === 'half' ? 'w-[48%]' : 'w-full'}>
      <View className="mb-2 h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: theme.colors.accentSoft }}>
        <Text className="text-sm">{icon}</Text>
      </View>
      <Text className="text-xl font-black" style={{ color: theme.colors.text }}>{value}</Text>
      <Text className="mt-0.5 text-xs font-semibold" style={{ color: theme.colors.secondaryText }}>{title}</Text>
    </SectionCard>
  )
})
