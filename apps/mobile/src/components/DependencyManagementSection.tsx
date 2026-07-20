import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { addDependencies, removeDependency, replaceDependency, toUiPriority, toUiStatus, type ApiDependency, type ApiTask } from '../lib/tasksApi'
import { TaskDependenciesWorkflowSheet, type DependencyTask } from './TaskDependenciesWorkflowSheet'
import { useTheme } from '../theme/useTheme'
import { createsDependencyCycle } from '../features/tasks/dependencyGraph'

type SheetState = { mode: 'add' } | { mode: 'edit' | 'remove'; dependency: DependencyTask } | null
type Props = { task: ApiTask; tasks: ApiTask[]; accessToken: string; canEdit: boolean; onTaskUpdated: (task: ApiTask) => void; onDependenciesChange?: (items: DependencyTask[]) => void; onError?: (message: string) => void }

function toDependencyTask(task: ApiTask | ApiDependency): DependencyTask {
  return { id: task.id, title: task.title, category: task.category || 'General', status: toUiStatus(task.status) as DependencyTask['status'], dueDate: task.dueDate ? new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(task.dueDate)) : 'No due date', priority: (toUiPriority(task.priority) === 'High' ? 'High' : toUiPriority(task.priority) === 'Low' ? 'Low' : 'Medium') }
}

export function DependencyManagementSection({ task, tasks, accessToken, canEdit, onTaskUpdated, onDependenciesChange, onError }: Props) {
  const { theme } = useTheme(); const { colors } = theme
  const [dependencies, setDependencies] = useState<DependencyTask[]>(task.dependencies.map(toDependencyTask))
  const [sheet, setSheet] = useState<SheetState>(null)
  useEffect(() => { setDependencies(task.dependencies.map(toDependencyTask)) }, [task.dependencies])
  const availableTasks = useMemo(() => tasks.filter((candidate) => !createsDependencyCycle(task.id, candidate.id, tasks)).map(toDependencyTask), [task.id, tasks])
  const setLocal = (next: DependencyTask[]) => { setDependencies(next); onDependenciesChange?.(next) }
  const commit = (updated: ApiTask) => { const next = updated.dependencies.map(toDependencyTask); setLocal(next); onTaskUpdated(updated) }
  const fail = (error: unknown, previous: DependencyTask[]) => { setLocal(previous); onError?.(error instanceof Error ? error.message : 'Unable to update dependencies.') }
  const validate = (selected: DependencyTask[]) => {
    const existing = new Set(dependencies.map((item) => item.id))
    const invalid = selected.some((item) => existing.has(item.id) || createsDependencyCycle(task.id, item.id, tasks))
    if (invalid) { onError?.('That dependency is already selected or would create a cycle.'); return false }
    return true
  }
  const add = async (selected: DependencyTask[]) => {
    if (!validate(selected)) return
    const previous = dependencies; setLocal([...dependencies, ...selected])
    try { commit(await addDependencies(accessToken, task.id, selected.map((item) => item.id))) } catch (error) { fail(error, previous) }
  }
  const replace = async (oldId: string, replacement: DependencyTask) => {
    if (createsDependencyCycle(task.id, replacement.id, tasks) || dependencies.some((item) => item.id === replacement.id)) { onError?.('That replacement would duplicate a dependency or create a cycle.'); return }
    const previous = dependencies; setLocal(dependencies.map((item) => item.id === oldId ? replacement : item))
    try { commit(await replaceDependency(accessToken, task.id, oldId, replacement.id)) } catch (error) { fail(error, previous) }
  }
  const remove = async (id: string) => {
    const previous = dependencies; setLocal(dependencies.filter((item) => item.id !== id))
    try { commit(await removeDependency(accessToken, task.id, id)) } catch (error) { fail(error, previous) }
  }
  return <View className="gap-2">
    {dependencies.map((dependency) => <Pressable key={dependency.id} disabled={!canEdit} onPress={() => setSheet({ mode: 'edit', dependency })} className="rounded-xl p-3" style={{ backgroundColor: colors.background }}><Text className="font-bold" style={{ color: colors.text }}>{dependency.title}</Text><Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>{dependency.category} · {dependency.status}</Text></Pressable>)}
    {!dependencies.length ? <Text className="text-sm" style={{ color: colors.secondaryText }}>No dependencies selected.</Text> : null}
    {canEdit ? <Pressable onPress={() => setSheet({ mode: 'add' })} className="rounded-xl border border-dashed py-3" style={{ borderColor: colors.border }}><Text className="text-center text-sm font-bold" style={{ color: colors.accent }}>+ Add Dependency</Text></Pressable> : null}
    <TaskDependenciesWorkflowSheet visible={sheet !== null} mode={sheet?.mode ?? 'add'} currentTaskId={task.id} availableTasks={availableTasks} dependencies={dependencies} dependency={sheet && sheet.mode !== 'add' ? sheet.dependency : null} onClose={() => setSheet(null)} onAdd={(selected) => void add(selected)} onSaveReplacement={(oldId, replacement) => void replace(oldId, replacement)} onRemove={(id) => void remove(id)} />
    {sheet?.mode === 'edit' ? <Pressable onPress={() => setSheet({ mode: 'remove', dependency: sheet.dependency })} className="self-start rounded-lg px-3 py-2"><Text className="text-xs font-bold" style={{ color: colors.error }}>Remove {sheet.dependency.title}</Text></Pressable> : null}
  </View>
}
