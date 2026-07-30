import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text, type StyleProp, type ViewStyle } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type ButtonProps = {
  children: ReactNode
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
  fullWidth?: boolean
  size?: 'sm' | 'md'
  style?: StyleProp<ViewStyle>
  /** Screen-reader label when the visible text alone isn't specific enough
   * (e.g. an "Approve" button among several). Defaults to the button text. */
  accessibilityLabel?: string
}

const SIZE_CLASSES = {
  sm: 'px-3 py-2.5',
  md: 'px-5 py-4',
}
const SIZE_TEXT_CLASSES = {
  sm: 'text-xs',
  md: 'text-sm',
}

export function PrimaryButton({ children, onPress, disabled, loading, className = '', fullWidth, size = 'md', accessibilityLabel }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-xl active:scale-[0.98] active:opacity-90 ${SIZE_CLASSES[size]} ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ backgroundColor: theme.colors.accent, borderColor: '#fff47a', borderWidth: 1, shadowColor: theme.colors.accent, shadowOpacity: 0.28, shadowRadius: 12, elevation: 4 }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.accentText} />
      ) : (
        <Text className={`font-black ${SIZE_TEXT_CLASSES[size]}`} style={{ color: theme.colors.accentText }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}

export function SecondaryButton({ children, onPress, disabled, loading, className = '', fullWidth, size = 'md', accessibilityLabel }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-xl active:scale-[0.98] active:opacity-80 ${SIZE_CLASSES[size]} ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ backgroundColor: theme.colors.border }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text className={`font-bold ${SIZE_TEXT_CLASSES[size]}`} style={{ color: theme.colors.text }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}

export function OutlineButton({ children, onPress, disabled, loading, className = '', fullWidth, size = 'md', style, accessibilityLabel }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-xl border bg-transparent active:scale-[0.98] ${SIZE_CLASSES[size]} ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={[{ borderColor: theme.colors.border }, style]}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text className={`font-bold ${SIZE_TEXT_CLASSES[size]}`} style={{ color: theme.colors.text }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}

export function DangerButton({ children, onPress, disabled, loading, className = '', fullWidth, size = 'md', accessibilityLabel }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className={`items-center justify-center rounded-xl active:scale-[0.98] ${SIZE_CLASSES[size]} ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ backgroundColor: `${theme.colors.error}26` }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.error} />
      ) : (
        <Text className={`font-black ${SIZE_TEXT_CLASSES[size]}`} style={{ color: theme.colors.error }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}
