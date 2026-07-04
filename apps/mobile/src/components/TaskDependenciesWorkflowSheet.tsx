import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { DangerButton, PrimaryButton, SecondaryButton } from './layout'
import { useTheme } from '../theme/useTheme'

export type DependencyStatus = 'To Do' | 'In Progress' | 'Done' | 'Missed' | 'Blocked'
export type DependencyPriority = 'Low' | 'Medium' | 'High'

export type DependencyTask = {
  id: string
  title: string
  category: string
  status: DependencyStatus
  dueDate: string
  priority: DependencyPriority
}

type DependencySheetMode = 'add' | 'edit' | 'remove'

type TaskDependenciesWorkflowSheetProps = {
  visible: boolean
  mode: DependencySheetMode
  currentTaskId: string
  availableTasks: DependencyTask[]
  dependencies: DependencyTask[]
  dependency?: DependencyTask | null
  onClose: () => void
  onAdd: (tasks: DependencyTask[]) => void
  onSaveReplacement: (oldDependencyId: string, replacement: DependencyTask) => void
  onRemove: (dependencyId: string) => void
}

export function TaskDependenciesWorkflowSheet({
  visible,
  mode,
  currentTaskId,
  availableTasks,
  dependencies,
  dependency,
  onClose,
  onAdd,
  onSaveReplacement,
  onRemove,
}: TaskDependenciesWorkflowSheetProps) {
  const { theme } = useTheme()
  const { colors } = theme
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [replacementId, setReplacementId] = useState('')

  useEffect(() => {
    if (!visible) return

    setSearch('')
    setSelectedIds([])
    setReplacementId('')
  }, [dependency?.id, mode, visible])

  const dependencyIds = useMemo(() => new Set(dependencies.map((item) => item.id)), [dependencies])

  const addOptions = useMemo(() => {
    const query = search.trim().toLowerCase()

    return availableTasks.filter((task) => {
      if (task.id === currentTaskId) return false
      if (dependencyIds.has(task.id)) return false
      if (!query) return true

      return [task.title, task.category, task.status, task.priority].some((value) =>
        value.toLowerCase().includes(query),
      )
    })
  }, [availableTasks, currentTaskId, dependencyIds, search])

  const replacementOptions = useMemo(() => {
    const query = search.trim().toLowerCase()

    return availableTasks.filter((task) => {
      if (task.id === currentTaskId) return false
      if (task.id === dependency?.id) return false
      if (dependencyIds.has(task.id)) return false
      if (!query) return true

      return [task.title, task.category, task.status, task.priority].some((value) =>
        value.toLowerCase().includes(query),
      )
    })
  }, [availableTasks, currentTaskId, dependency?.id, dependencyIds, search])

  const selectedTasks = availableTasks.filter((task) => selectedIds.includes(task.id))
  const replacementTask = replacementOptions.find((task) => task.id === replacementId)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close dependencies sheet"
        />

        <View
          className="rounded-t-[28px] border px-5 pt-3"
          style={{
            maxHeight: '90%',
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

          {mode === 'add' ? (
            <>
              <SheetHeader
                title="Add Dependency"
                subtitle="Select tasks that must be completed before this task can start."
              />
              <SearchBox value={search} onChange={setSearch} />
              <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
                <View className="gap-3 pb-2">
                  {addOptions.length ? (
                    addOptions.map((task) => (
                      <DependencyOption
                        key={task.id}
                        task={task}
                        selected={selectedIds.includes(task.id)}
                        multiple
                        onPress={() =>
                          setSelectedIds((current) =>
                            current.includes(task.id)
                              ? current.filter((id) => id !== task.id)
                              : [...current, task.id],
                          )
                        }
                      />
                    ))
                  ) : (
                    <EmptyState message="No available tasks match your search." />
                  )}
                </View>
              </ScrollView>

              <View className="mt-3 flex-row gap-3">
                <SecondaryButton onPress={onClose} className="flex-1">
                  Cancel
                </SecondaryButton>
                <PrimaryButton
                  disabled={!selectedTasks.length}
                  onPress={() => {
                    onAdd(selectedTasks)
                    onClose()
                  }}
                  className="flex-1"
                >
                  Add Dependency
                </PrimaryButton>
              </View>
            </>
          ) : null}

          {mode === 'edit' && dependency ? (
            <>
              <SheetHeader title="Edit Dependency" subtitle="Review this dependency or replace it with another task." />

              <View className="rounded-3xl border p-4" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
                <View className="flex-row items-start justify-between gap-4">
                  <View className="flex-1">
                    <Text className="font-black" style={{ color: colors.text }}>
                      {dependency.title}
                    </Text>
                    <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
                      {dependency.category}
                    </Text>
                  </View>
                  <StatusBadge status={dependency.status} />
                </View>
                <View className="mt-4 flex-row gap-3">
                  <InfoPill label="Due" value={dependency.dueDate} />
                  <InfoPill label="Priority" value={dependency.priority} />
                </View>
              </View>

              <Text className="mb-3 mt-5 font-black" style={{ color: colors.text }}>
                Replace dependency with another task
              </Text>
              <SearchBox value={search} onChange={setSearch} />

              <ScrollView className="mt-4" showsVerticalScrollIndicator={false}>
                <View className="gap-3 pb-2">
                  {replacementOptions.length ? (
                    replacementOptions.map((task) => (
                      <DependencyOption
                        key={task.id}
                        task={task}
                        selected={replacementId === task.id}
                        onPress={() => setReplacementId(task.id)}
                      />
                    ))
                  ) : (
                    <EmptyState message="No replacement task is available." />
                  )}
                </View>
              </ScrollView>

              <View className="mt-3 flex-row gap-3">
                <SecondaryButton onPress={onClose} className="flex-1">
                  Cancel
                </SecondaryButton>
                <PrimaryButton
                  disabled={!replacementTask}
                  onPress={() => {
                    if (!replacementTask) return
                    onSaveReplacement(dependency.id, replacementTask)
                    onClose()
                  }}
                  className="flex-1"
                >
                  Save Changes
                </PrimaryButton>
              </View>
            </>
          ) : null}

          {mode === 'remove' && dependency ? (
            <>
              <SheetHeader title="Remove Dependency?" subtitle="This task will no longer depend on the selected task." />

              <View className="rounded-3xl border p-4" style={{ backgroundColor: `${colors.error}16`, borderColor: `${colors.error}66` }}>
                <Text className="font-black" style={{ color: colors.text }}>
                  {dependency.title}
                </Text>
                <Text className="mt-2 text-sm leading-6" style={{ color: colors.secondaryText }}>
                  Removing this dependency will keep both tasks, but this task will no longer wait for it.
                </Text>
              </View>

              <View className="mt-5 flex-row gap-3">
                <SecondaryButton onPress={onClose} className="flex-1">
                  Cancel
                </SecondaryButton>
                <DangerButton
                  onPress={() => {
                    onRemove(dependency.id)
                    onClose()
                  }}
                  className="flex-1"
                >
                  Remove Dependency
                </DangerButton>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

function SheetHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <View className="mb-5 items-center">
      <Text className="text-2xl font-black" style={{ color: colors.text }}>
        {title}
      </Text>
      <Text className="mt-2 text-center text-sm leading-5" style={{ color: colors.secondaryText }}>
        {subtitle}
      </Text>
    </View>
  )
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="Search tasks..."
      placeholderTextColor={colors.placeholder}
      className="rounded-2xl border px-4 py-4 font-bold"
      style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
    />
  )
}

function DependencyOption({
  task,
  selected,
  multiple,
  onPress,
}: {
  task: DependencyTask
  selected: boolean
  multiple?: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="rounded-3xl border p-4 active:scale-[0.99] active:opacity-90"
      style={{
        backgroundColor: selected ? colors.accentSoft : colors.background,
        borderColor: selected ? colors.accent : colors.border,
      }}
    >
      <View className="flex-row items-start gap-3">
        <View
          className="mt-1 h-6 w-6 items-center justify-center rounded-lg border"
          style={{
            backgroundColor: selected ? colors.accent : 'transparent',
            borderColor: selected ? colors.accent : colors.border,
          }}
        >
          <Text className="text-[10px] font-black" style={{ color: selected ? colors.accentText : 'transparent' }}>
            {multiple ? 'OK' : ''}
          </Text>
        </View>

        <View className="flex-1">
          <Text className="font-black" style={{ color: colors.text }}>
            {task.title}
          </Text>
          <Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>
            {task.category}
          </Text>
        </View>
      </View>

      <View className="mt-4 flex-row flex-wrap gap-2">
        <StatusBadge status={task.status} />
        <MetaPill label={task.priority} />
        <MetaPill label={task.dueDate} />
      </View>
    </Pressable>
  )
}

function StatusBadge({ status }: { status: DependencyStatus }) {
  const { theme } = useTheme()
  const { colors } = theme
  const color =
    status === 'Done'
      ? colors.success
      : status === 'Missed' || status === 'Blocked'
        ? colors.error
        : status === 'In Progress'
          ? colors.primary
          : colors.secondaryText

  return (
    <View className="rounded-full px-3 py-2" style={{ backgroundColor: `${color}33` }}>
      <Text className="text-xs font-black" style={{ color }}>
        {status}
      </Text>
    </View>
  )
}

function MetaPill({ label }: { label: string }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <View className="rounded-full px-3 py-2" style={{ backgroundColor: colors.card }}>
      <Text className="text-xs font-bold" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
    </View>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <View className="flex-1 rounded-2xl border p-3" style={{ backgroundColor: colors.card, borderColor: colors.border }}>
      <Text className="text-[10px] font-black uppercase" style={{ color: colors.secondaryText }}>
        {label}
      </Text>
      <Text className="mt-1 font-bold" style={{ color: colors.text }}>
        {value}
      </Text>
    </View>
  )
}

function EmptyState({ message }: { message: string }) {
  const { theme } = useTheme()
  const { colors } = theme

  return (
    <View className="rounded-3xl border border-dashed p-6" style={{ backgroundColor: colors.background, borderColor: colors.border }}>
      <Text className="text-center text-sm font-semibold" style={{ color: colors.secondaryText }}>
        {message}
      </Text>
    </View>
  )
}
