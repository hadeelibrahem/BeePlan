import { memo, type ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type SectionCardProps = {
  children: ReactNode
  className?: string
  style?: ViewStyle
}

export const SectionCard = memo(function SectionCard({ children, className = '', style }: SectionCardProps) {
  const { theme } = useTheme()

  return (
    <View
      className={`rounded-3xl border p-4 ${className}`}
      style={[
        {
          borderColor: theme.colors.cardBorder,
          backgroundColor: theme.colors.card,
          shadowColor: theme.cardShadow.color,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: theme.cardShadow.opacity,
          shadowRadius: theme.cardShadow.radius,
          elevation: theme.cardShadow.elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
})
