import type { ReactNode } from 'react'
import { View } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type BottomActionBarProps = {
  children: ReactNode
}

export function BottomActionBar({ children }: BottomActionBarProps) {
  const { theme } = useTheme()

  return (
    <View
      className="absolute bottom-0 left-0 right-0 flex-row gap-3 border-t px-4 py-4"
      style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.navigation }}
    >
      {children}
    </View>
  )
}
