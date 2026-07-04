import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/useTheme'

type BottomActionBarProps = {
  children: ReactNode
}

// Extra breathing room on top of the device's safe-area inset so buttons never
// sit flush against the Android gesture/nav bar or the iOS home indicator.
const EXTRA_BOTTOM_SPACING = 20

export function BottomActionBar({ children }: BottomActionBarProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row gap-2 border-t px-4 pt-3"
      style={{
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.navigation,
        paddingBottom: insets.bottom + EXTRA_BOTTOM_SPACING,
      }}
    >
      {children}
    </View>
  )
}
