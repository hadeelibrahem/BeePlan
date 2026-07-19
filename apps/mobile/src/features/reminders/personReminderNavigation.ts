export function createPersonReminderParams(initialFriendId?: string) {
  return {
    initialType: 'person' as const,
    ...(initialFriendId ? { initialFriendId } : {}),
  }
}
