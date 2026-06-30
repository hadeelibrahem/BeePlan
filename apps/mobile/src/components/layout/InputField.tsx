import { useState } from 'react'
import { Text, TextInput, View, type KeyboardTypeOptions } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type InputFieldProps = {
  label?: string
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
  error?: string
  secureTextEntry?: boolean
  multiline?: boolean
  keyboardType?: KeyboardTypeOptions
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters'
}

export function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry,
  multiline,
  keyboardType,
  autoCapitalize = 'sentences',
}: InputFieldProps) {
  const [focused, setFocused] = useState(false)
  const { theme } = useTheme()
  const borderColor = error ? theme.colors.error : focused ? theme.colors.accent : theme.colors.border

  return (
    <View className="mb-4">
      {label && (
        <Text className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: theme.colors.secondaryText }}>
          {label}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.placeholder}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`rounded-2xl border px-4 py-4 text-sm ${multiline ? 'min-h-24' : ''}`}
        style={[
          { backgroundColor: theme.colors.input, color: theme.colors.text, borderColor },
          multiline ? { textAlignVertical: 'top' } : undefined,
        ]}
      />
      {error && (
        <Text className="mt-1.5 text-xs font-semibold" style={{ color: theme.colors.error }}>
          {error}
        </Text>
      )}
    </View>
  )
}
