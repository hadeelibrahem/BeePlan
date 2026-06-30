import type { ReactNode } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type PageHeaderProps = {
  title: string
  subtitle?: string
  onBack?: () => void
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, onBack, actions }: PageHeaderProps) {
  const { theme } = useTheme()

  return (
    <View className="mb-5">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-3">
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="h-11 w-11 items-center justify-center rounded-xl active:opacity-70"
              style={{ backgroundColor: theme.colors.border }}
            >
              <Text className="text-base font-black" style={{ color: theme.colors.text }}>{'←'}</Text>
            </Pressable>
          )}

          <View className="flex-1">
            <Text className="text-2xl font-black" style={{ color: theme.colors.text }} numberOfLines={1}>
              {title}
            </Text>
            {subtitle && (
              <Text className="mt-0.5 text-sm" style={{ color: theme.colors.secondaryText }} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>

        {actions && <View className="flex-row items-center gap-2">{actions}</View>}
      </View>
    </View>
  )
}
