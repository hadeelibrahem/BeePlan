export function normalizeDraftDependencyIds(ids: string[], parentTaskId?: string) {
  const seen = new Set<string>()
  return ids.filter((id) => Boolean(id) && id !== parentTaskId && !seen.has(id) && (seen.add(id), true))
}
