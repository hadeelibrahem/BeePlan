import { Text, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { PrimaryButton } from './Buttons'

type EmptyStateProps = {
  icon: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  const { theme } = useTheme()

  return (
    <View
      className="items-center gap-3 rounded-2xl border px-4 py-10"
      style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.card }}
    >
      <View className="h-12 w-12 items-center justify-center rounded-xl" style={{ backgroundColor: theme.colors.accentSoft }}>
        <Text className="text-xl">{icon}</Text>
      </View>
      <View className="items-center">
        <Text className="mb-1 text-center text-sm font-bold" style={{ color: theme.colors.text }}>
          {title}
        </Text>
        <Text className="text-center text-xs" style={{ color: theme.colors.secondaryText }}>
          {description}
        </Text>
      </View>
      {actionLabel && onAction && (
        <PrimaryButton onPress={onAction} className="mt-1">
          {actionLabel}
        </PrimaryButton>
      )}
    </View>
  )
}
