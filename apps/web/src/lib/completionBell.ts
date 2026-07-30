export function shouldPlayCompletionBell({
  previousRemaining,
  remaining,
  completionKey,
  playedKey,
  enabled,
}: {
  previousRemaining: number | null
  remaining: number
  completionKey: string | null
  playedKey: string | null
  enabled: boolean
}): boolean {
  return Boolean(enabled && completionKey && previousRemaining !== null && previousRemaining > 0 && remaining === 0 && playedKey !== completionKey)
}
