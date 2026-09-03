export type IdentifiedChatMessage = { id: string; createdAt: string };

/** Keep realtime messages when a slower history request resolves afterwards. */
export function mergeFocusRoomChatMessages<T extends IdentifiedChatMessage>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  const byId = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
  );
}
