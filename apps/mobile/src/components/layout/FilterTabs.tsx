import { Pressable, ScrollView, Text } from 'react-native'
import { useTheme } from '../../theme/useTheme'

type FilterTabsProps<T extends string> = {
  tabs: { value: T; label: string }[]
  active: T
  onChange: (value: T) => void
}

export function FilterTabs<T extends string>({ tabs, active, onChange }: FilterTabsProps<T>) {
  const { theme } = useTheme()

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1 mb-3">
      {tabs.map((tab) => {
        const isActive = active === tab.value
        return (
          <Pressable
            key={tab.value}
            onPress={() => onChange(tab.value)}
            className="mx-1 rounded-full px-3 py-1.5 active:opacity-80"
            style={{ backgroundColor: isActive ? theme.colors.accent : theme.colors.surfaceElevated }}
          >
            <Text
              className="text-xs font-bold"
              style={{ color: isActive ? theme.colors.accentText : theme.colors.secondaryText }}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}
