import type { ApiTask } from '../../lib/tasksApi'

/** Whether making `candidateId` a prerequisite of `currentTaskId` creates a cycle. */
export function createsDependencyCycle(currentTaskId: string, candidateId: string, tasks: ApiTask[]) {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const visit = (id: string, seen = new Set<string>()): boolean => {
    if (id === currentTaskId) return true
    if (seen.has(id)) return false
    seen.add(id)
    return (byId.get(id)?.dependencies ?? []).some((dependency) => visit(dependency.id, seen))
  }
  return candidateId === currentTaskId || visit(candidateId)
}
