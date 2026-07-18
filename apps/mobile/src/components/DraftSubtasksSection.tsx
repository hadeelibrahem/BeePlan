import { Pressable, Text, TextInput, View } from 'react-native'
import { useTheme } from '../theme/useTheme'
import { addDraftSubtask, deleteDraftSubtask, newDraftSubtask, reorderDraftSubtask, toggleDraftSubtask, updateDraftSubtask, type DraftSubtask } from '../screens/createTaskSubtasks'

export function DraftSubtasksSection({ items, onChange, disabled }: { items: DraftSubtask[]; onChange: (items: DraftSubtask[]) => void; disabled?: boolean }) {
  const { theme } = useTheme(); const { colors } = theme
  return <View className="mb-3 gap-2">
    {items.map((item, index) => <View key={item.id} className="rounded-xl p-3" style={{ backgroundColor: colors.background }}>
      <View className="flex-row items-center gap-2"><Pressable disabled={disabled} onPress={() => onChange(toggleDraftSubtask(items, item.id))} accessibilityRole="checkbox" accessibilityState={{ checked: item.isDone }} accessibilityLabel={item.isDone ? 'Reopen subtask' : 'Complete subtask'} className="h-6 w-6 items-center justify-center rounded-md border" style={{ borderColor: item.isDone ? colors.success : colors.border, backgroundColor: item.isDone ? colors.success : 'transparent' }}><Text style={{ color: colors.accentText }}>{item.isDone ? 'OK' : ''}</Text></Pressable><TextInput editable={!disabled} value={item.title} onChangeText={(title) => onChange(updateDraftSubtask(items, item.id, { title }))} placeholder="Subtask title" placeholderTextColor={colors.placeholder} className="flex-1 rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: colors.border, color: colors.text }} /></View>
      <TextInput editable={!disabled} value={item.description} onChangeText={(description) => onChange(updateDraftSubtask(items, item.id, { description }))} placeholder="Description (optional)" placeholderTextColor={colors.placeholder} className="mt-2 rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: colors.border, color: colors.text }} />
      <View className="mt-2 flex-row gap-2"><Button label="Up" disabled={disabled || index === 0} onPress={() => onChange(reorderDraftSubtask(items, index, index - 1))} /><Button label="Down" disabled={disabled || index === items.length - 1} onPress={() => onChange(reorderDraftSubtask(items, index, index + 1))} /><Button label="Delete" disabled={disabled} onPress={() => onChange(deleteDraftSubtask(items, item.id))} /></View>
    </View>)}
    <Pressable disabled={disabled} onPress={() => onChange(addDraftSubtask(items, newDraftSubtask()))} accessibilityRole="button" accessibilityLabel="Add subtask" className="rounded-xl border border-dashed py-3" style={{ borderColor: colors.border, opacity: disabled ? 0.5 : 1 }}><Text className="text-center text-sm font-bold" style={{ color: colors.accent }}>+ Add Subtask</Text></Pressable>
  </View>
}
function Button({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) { const { theme } = useTheme(); return <Pressable disabled={disabled} onPress={onPress} className="rounded-lg px-2 py-1" style={{ backgroundColor: theme.colors.surfaceElevated, opacity: disabled ? 0.4 : 1 }}><Text className="text-xs font-bold" style={{ color: theme.colors.text }}>{label}</Text></Pressable> }
