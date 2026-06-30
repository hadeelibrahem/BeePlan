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
      <View className="mb-3 h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: theme.colors.accentSoft }}>
        <Text className="text-base">{icon}</Text>
      </View>
      <Text className="text-2xl font-black" style={{ color: theme.colors.text }}>{value}</Text>
      <Text className="mt-1 text-sm font-semibold" style={{ color: theme.colors.secondaryText }}>{title}</Text>
    </SectionCard>
  )
})
