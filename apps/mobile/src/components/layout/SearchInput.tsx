import { Pressable, TextInput, View } from 'react-native'
import { useTheme } from '../../theme/useTheme'
import { MobileIcon } from './MobileIcon'

type SearchInputProps = {
  value: string
  onChangeText: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChangeText, placeholder = 'Search...' }: SearchInputProps) {
  const { theme } = useTheme()
  return (
    <View className="mb-3 flex-row items-center rounded-xl px-3 py-2.5" style={{ backgroundColor: theme.colors.input }}>
      <View className="mr-2"><MobileIcon name="search" color={theme.colors.secondaryText} size={18} /></View>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={theme.colors.placeholder} className="flex-1 text-sm" style={{ color: theme.colors.text }} />
      {value.length > 0 ? <Pressable onPress={() => onChangeText('')} accessibilityRole="button" accessibilityLabel="Clear search" className="p-1"><MobileIcon name="add" color={theme.colors.secondaryText} size={18} /></Pressable> : null}
    </View>
  )
}
