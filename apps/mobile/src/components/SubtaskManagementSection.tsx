import { useEffect, useState } from 'react'
import { Alert, Pressable, Text, TextInput, View } from 'react-native'
import { addSubtask, deleteSubtask, reorderSubtasks, updateSubtask, type ApiSubtask, type ApiTask } from '../lib/tasksApi'
import { useTheme } from '../theme/useTheme'

type Draft = { id?: string; title: string; description: string }

type Props = {
  task: ApiTask
  accessToken: string
  canEdit: boolean
  onTaskUpdated: (task: ApiTask) => void
  onItemsChange?: (items: ApiSubtask[]) => void
  onError?: (message: string) => void
}

/** Shared subtask CRUD UI used by both task details and task edit screens. */
export function SubtaskManagementSection({ task, accessToken, canEdit, onTaskUpdated, onItemsChange, onError }: Props) {
  const { theme } = useTheme()
  const { colors } = theme
  const [items, setItems] = useState<ApiSubtask[]>(task.subtasks)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setItems(task.subtasks) }, [task.subtasks])

  const replaceItems = (next: ApiSubtask[]) => { setItems(next); onItemsChange?.(next) }
  const applyServer = (updated: ApiTask) => { replaceItems(updated.subtasks); onTaskUpdated(updated) }
  const fail = (error: unknown, fallback: string, previous: ApiSubtask[]) => {
    replaceItems(previous)
    onError?.(error instanceof Error ? error.message : fallback)
  }

  async function toggle(item: ApiSubtask) {
    if (!canEdit || saving) return
    const previous = items
    const next = items.map((current) => current.id === item.id ? { ...current, isDone: !current.isDone } : current)
    replaceItems(next)
    try { applyServer(await updateSubtask(accessToken, task.id, item.id, { isDone: !item.isDone })) }
    catch (error) { fail(error, 'Unable to update subtask.', previous) }
  }

  async function saveDraft() {
    if (!draft?.title.trim() || saving) return
    const previous = items
    setSaving(true)
    const payload = { title: draft.title.trim(), description: draft.description.trim() }
    try {
      if (draft.id) {
        replaceItems(items.map((item) => item.id === draft.id ? { ...item, ...payload } : item))
        applyServer(await updateSubtask(accessToken, task.id, draft.id, payload))
      } else {
        const temp: ApiSubtask = { id: `pending-${Date.now()}`, taskId: task.id, ...payload, isDone: false, orderIndex: items.length, priority: 'medium', status: 'todo', estimatedDurationSource: 'user', reminderEnabled: false, reminderStatus: 'none', tags: [], dependencyIds: [] }
        replaceItems([...items, temp])
        applyServer(await addSubtask(accessToken, task.id, payload))
      }
      setDraft(null)
    } catch (error) { fail(error, 'Unable to save subtask.', previous) }
    finally { setSaving(false) }
  }

  function remove(item: ApiSubtask) {
    Alert.alert('Delete subtask?', `Remove "${item.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void (async () => {
        const previous = items
        replaceItems(items.filter((current) => current.id !== item.id))
        try { applyServer(await deleteSubtask(accessToken, task.id, item.id)) }
        catch (error) { fail(error, 'Unable to delete subtask.', previous) }
      })() },
    ])
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (!canEdit || target < 0 || target >= items.length || saving) return
    const previous = items
    const next = [...items]
    ;[next[index], next[target]] = [next[target], next[index]]
    replaceItems(next.map((item, orderIndex) => ({ ...item, orderIndex })))
    try { applyServer(await reorderSubtasks(accessToken, task.id, next.map((item) => item.id))) }
    catch (error) { fail(error, 'Unable to reorder subtasks.', previous) }
  }

  return <View className="gap-2">
    {items.map((item, index) => <View key={item.id} className="flex-row items-center gap-2 rounded-xl p-2" style={{ backgroundColor: colors.background }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.isDone }} accessibilityLabel={item.isDone ? 'Reopen subtask' : 'Complete subtask'} disabled={!canEdit} onPress={() => void toggle(item)} className="h-6 w-6 items-center justify-center rounded-md border" style={{ borderColor: item.isDone ? colors.success : colors.border, backgroundColor: item.isDone ? colors.success : 'transparent' }}><Text style={{ color: colors.accentText }}>{item.isDone ? '✓' : ''}</Text></Pressable>
      <Pressable className="min-w-0 flex-1" onPress={() => canEdit && setDraft({ id: item.id, title: item.title, description: item.description ?? '' })}><Text className={`text-sm font-bold ${item.isDone ? 'line-through' : ''}`} style={{ color: colors.text }}>{item.title}</Text>{item.description ? <Text className="text-xs" style={{ color: colors.secondaryText }} numberOfLines={1}>{item.description}</Text> : null}</Pressable>
      {canEdit ? <View className="flex-row gap-1"><TinyButton label="↑" disabled={index === 0} onPress={() => void move(index, -1)} /><TinyButton label="↓" disabled={index === items.length - 1} onPress={() => void move(index, 1)} /><TinyButton label="Delete" onPress={() => remove(item)} /></View> : null}
    </View>)}
    {canEdit ? <Pressable onPress={() => setDraft({ title: '', description: '' })} className="rounded-xl border border-dashed py-3" style={{ borderColor: colors.border }}><Text className="text-center text-sm font-bold" style={{ color: colors.accent }}>+ Add Subtask</Text></Pressable> : null}
    {draft ? <View className="rounded-xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}><Text className="mb-2 text-sm font-bold" style={{ color: colors.text }}>{draft.id ? 'Edit Subtask' : 'New Subtask'}</Text><TextInput value={draft.title} onChangeText={(title) => setDraft((current) => current ? { ...current, title } : current)} placeholder="Subtask title" placeholderTextColor={colors.placeholder} className="mb-2 rounded-lg border px-3 py-2" style={{ borderColor: colors.border, color: colors.text }} /><TextInput value={draft.description} onChangeText={(description) => setDraft((current) => current ? { ...current, description } : current)} multiline placeholder="Description (optional)" placeholderTextColor={colors.placeholder} className="mb-2 rounded-lg border px-3 py-2" style={{ borderColor: colors.border, color: colors.text }} /><View className="flex-row gap-2"><TinyButton label="Cancel" onPress={() => setDraft(null)} /><TinyButton label={saving ? 'Saving...' : 'Save'} onPress={() => void saveDraft()} /></View></View> : null}
  </View>
}

function TinyButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  return <Pressable disabled={disabled} onPress={onPress} className="rounded-lg px-2 py-1 active:opacity-70" style={{ backgroundColor: theme.colors.surfaceElevated, opacity: disabled ? 0.4 : 1 }}><Text className="text-xs font-bold" style={{ color: theme.colors.text }}>{label}</Text></Pressable>
}
