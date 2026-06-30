import { Text, TextInput, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type SearchInputProps = {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChangeText, placeholder = 'Search...' }: SearchInputProps) {
  const { theme } = useTheme()

  return (
    <View className="mb-5 flex-row items-center rounded-2xl px-4 py-3.5" style={{ backgroundColor: theme.colors.input }}>
      <Text className="mr-2 text-sm" style={{ color: theme.colors.secondaryText }}>{'🔍'}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.placeholder}
        className="flex-1 text-sm"
        style={{ color: theme.colors.text }}
      />
      {value.length > 0 && (
        <Text
          onPress={() => onChangeText('')}
          className="px-1 text-sm font-black"
          style={{ color: theme.colors.secondaryText }}
        >
          {'×'}
        </Text>
      )}
    </View>
  )
}
