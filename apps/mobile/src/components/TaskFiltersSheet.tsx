import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { PrimaryButton, SecondaryButton } from './layout'
import type { TaskDueFilter, TaskFilterSummary } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'

export type TaskFiltersSheetProps = {
  visible: boolean
  onClose: () => void
  summary?: TaskFilterSummary
  dueFilter: TaskDueFilter | null
  focusActive: boolean
  completedActive: boolean
  highPriorityActive: boolean
  categoryFilter: string | null
  onToggleDue: (value: TaskDueFilter) => void
  onToggleFocus: () => void
  onToggleCompleted: () => void
  onToggleHighPriority: () => void
  onSelectCategory: (name: string | null) => void
  onClear: () => void
}

export function TaskFiltersSheet({
  visible,
  onClose,
  summary,
  dueFilter,
  focusActive,
  completedActive,
  highPriorityActive,
  categoryFilter,
  onToggleDue,
  onToggleFocus,
  onToggleCompleted,
  onToggleHighPriority,
  onSelectCategory,
  onClear,
}: TaskFiltersSheetProps) {
  const { theme } = useTheme()
  const { colors } = theme
  const insets = useSafeAreaInsets()
  const counts = summary?.counts
  const categories = summary?.categories ?? []

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityRole="button" accessibilityLabel="Close filters sheet" />

        <View
          className="rounded-t-[28px] border px-5 pt-3"
          style={{
            maxHeight: '85%',
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
            shadowColor: theme.cardShadow.color,
            shadowOpacity: theme.cardShadow.opacity,
            shadowRadius: theme.cardShadow.radius,
            elevation: theme.cardShadow.elevation,
          }}
        >
          <View className="mx-auto mb-5 h-1.5 w-14 rounded-full" style={{ backgroundColor: colors.border }} />

          <View className="mb-5 items-center">
            <Text className="text-2xl font-black" style={{ color: colors.text }}>
              Filters
            </Text>
            <Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
              Narrow down your task list
            </Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
            <Text className="mb-2 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>
              Quick Filters
            </Text>
            <View className="mb-5 gap-2">
              <FilterRow
                label="Overdue"
                count={counts?.overdue ?? 0}
                active={dueFilter === 'overdue'}
                onPress={() => onToggleDue('overdue')}
              />
              <FilterRow
                label="Due Today"
                count={counts?.today ?? 0}
                active={dueFilter === 'today'}
                onPress={() => onToggleDue('today')}
              />
              <FilterRow
                label="Upcoming"
                count={counts?.upcoming ?? 0}
                active={dueFilter === 'upcoming'}
                onPress={() => onToggleDue('upcoming')}
              />
              <FilterRow label="Focus Tasks" count={counts?.focus ?? 0} active={focusActive} onPress={onToggleFocus} />
              <FilterRow label="Completed" count={counts?.completed ?? 0} active={completedActive} onPress={onToggleCompleted} />
              <FilterRow
                label="High Priority"
                count={counts?.highPriority ?? 0}
                active={highPriorityActive}
                onPress={onToggleHighPriority}
              />
            </View>

            <Text className="mb-2 text-xs font-black uppercase" style={{ color: colors.secondaryText }}>
              Categories
            </Text>
            <View className="mb-2 gap-2">
              {categories.length === 0 ? (
                <Text className="text-sm" style={{ color: colors.secondaryText }}>
                  No categories yet.
                </Text>
              ) : (
                categories.map((category) => (
                  <FilterRow
                    key={category.name}
                    label={category.name}
                    count={category.count}
                    active={categoryFilter === category.name}
                    onPress={() => onSelectCategory(categoryFilter === category.name ? null : category.name)}
                  />
                ))
              )}
            </View>
          </ScrollView>

          <View className="mt-4 flex-row gap-3">
            <SecondaryButton onPress={onClear} fullWidth>
              Clear
            </SecondaryButton>
            <PrimaryButton onPress={onClose} fullWidth>
              Apply
            </PrimaryButton>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function FilterRow({
  label,
  count,
  active,
  onPress,
}: {
  label: string
  count: number
  active: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className="flex-row items-center justify-between rounded-2xl border px-4 py-3 active:opacity-80"
      style={{
        backgroundColor: active ? colors.accentSoft : colors.background,
        borderColor: active ? colors.accent : colors.border,
      }}
    >
      <Text className="font-bold" style={{ color: colors.text }}>
        {label}
      </Text>
      <View
        className="rounded-full px-2.5 py-0.5"
        style={{ backgroundColor: active ? colors.accent : colors.card }}
      >
        <Text className="text-xs font-black" style={{ color: active ? colors.accentText : colors.secondaryText }}>
          {count}
        </Text>
      </View>
    </Pressable>
  )
}
