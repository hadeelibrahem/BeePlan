import { memo } from 'react'
import { Pressable, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/useTheme'

type FloatingActionButtonProps = {
  onPress?: () => void
  label?: string
  bottom?: number
  /** When the screen also renders a BottomNavBar, the FAB needs extra clearance above it. */
  aboveNavBar?: boolean
}

export const FloatingActionButton = memo(function FloatingActionButton({
  onPress,
  label = '+',
  bottom,
  aboveNavBar = false,
}: FloatingActionButtonProps) {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const resolvedBottom = bottom ?? insets.bottom + (aboveNavBar ? 88 : 16)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Primary action"
      className="absolute right-6 h-16 w-16 items-center justify-center rounded-3xl shadow-2xl active:scale-95"
      style={{
        bottom: resolvedBottom,
        backgroundColor: theme.colors.accent,
        shadowColor: theme.colors.accent,
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 6,
      }}
    >
      <Text className="text-3xl font-black" style={{ color: theme.colors.accentText }}>{label}</Text>
    </Pressable>
  )
})
