import type { SubtaskPayload } from '../lib/tasksApi'

export type DraftSubtask = {
  id: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  status: 'todo' | 'in_progress' | 'done' | 'blocked' | 'missed'
  isDone: boolean
  orderIndex: number
}

let sequence = 0
export function newDraftSubtask(): DraftSubtask {
  sequence += 1
  return { id: `draft-${Date.now()}-${sequence}`, title: '', description: '', priority: 'medium', status: 'todo', isDone: false, orderIndex: 0 }
}

function ordered(items: DraftSubtask[]) { return items.map((item, orderIndex) => ({ ...item, orderIndex })) }
export function addDraftSubtask(items: DraftSubtask[], item = newDraftSubtask()) { return ordered([...items, item]) }
export function updateDraftSubtask(items: DraftSubtask[], id: string, patch: Partial<DraftSubtask>) { return ordered(items.map((item) => item.id === id ? { ...item, ...patch } : item)) }
export function deleteDraftSubtask(items: DraftSubtask[], id: string) { return ordered(items.filter((item) => item.id !== id)) }
export function reorderDraftSubtask(items: DraftSubtask[], from: number, to: number) { if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items; const next = [...items]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return ordered(next) }
export function toggleDraftSubtask(items: DraftSubtask[], id: string) { return updateDraftSubtask(items, id, { isDone: !items.find((item) => item.id === id)?.isDone, status: !items.find((item) => item.id === id)?.isDone ? 'done' : 'todo' }) }
export function validateDraftSubtasks(items: DraftSubtask[]) { return items.find((item) => !item.title.trim()) ? 'Every subtask needs a title.' : '' }
export function draftSubtaskPayload(item: DraftSubtask): SubtaskPayload & { title: string } { return { title: item.title.trim(), description: item.description.trim() || undefined, priority: item.priority, status: item.status, isDone: item.isDone, estimatedDurationSource: 'user', reminderEnabled: false, tags: [] } }

export async function persistDraftSubtasks(items: DraftSubtask[], persistedIds: ReadonlySet<string>, create: (payload: SubtaskPayload & { title: string }) => Promise<unknown>, onPersisted?: (ids: Set<string>) => void) {
  const nextPersisted = new Set(persistedIds)
  for (const item of items) {
    if (nextPersisted.has(item.id)) continue
    await create(draftSubtaskPayload(item))
    nextPersisted.add(item.id)
    onPersisted?.(new Set(nextPersisted))
  }
  return nextPersisted
}
