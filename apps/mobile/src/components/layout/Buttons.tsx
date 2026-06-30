import type { ReactNode } from 'react'
import { ActivityIndicator, Pressable, Text } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type ButtonProps = {
  children: ReactNode
  onPress?: () => void
  disabled?: boolean
  loading?: boolean
  className?: string
  fullWidth?: boolean
}

export function PrimaryButton({ children, onPress, disabled, loading, className = '', fullWidth }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      className={`items-center justify-center rounded-2xl px-5 py-4 active:scale-[0.98] active:opacity-90 ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ backgroundColor: theme.colors.accent }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.accentText} />
      ) : (
        <Text className="text-sm font-black" style={{ color: theme.colors.accentText }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}

export function SecondaryButton({ children, onPress, disabled, loading, className = '', fullWidth }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      className={`items-center justify-center rounded-2xl px-5 py-4 active:scale-[0.98] active:opacity-80 ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ backgroundColor: theme.colors.border }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text className="text-sm font-bold" style={{ color: theme.colors.text }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}

export function OutlineButton({ children, onPress, disabled, loading, className = '', fullWidth }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      className={`items-center justify-center rounded-2xl border bg-transparent px-5 py-4 active:scale-[0.98] ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ borderColor: theme.colors.border }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text className="text-sm font-bold" style={{ color: theme.colors.text }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}

export function DangerButton({ children, onPress, disabled, loading, className = '', fullWidth }: ButtonProps) {
  const { theme } = useTheme()
  const isDisabled = disabled || loading

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      className={`items-center justify-center rounded-2xl px-5 py-4 active:scale-[0.98] ${
        isDisabled ? 'opacity-50' : ''
      } ${fullWidth ? 'w-full' : ''} ${className}`}
      style={{ backgroundColor: `${theme.colors.error}26` }}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.error} />
      ) : (
        <Text className="text-sm font-black" style={{ color: theme.colors.error }}>
          {children}
        </Text>
      )}
    </Pressable>
  )
}
