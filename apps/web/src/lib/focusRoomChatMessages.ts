export type IdentifiedChatMessage = { id: string; createdAt: string };

/**
 * Reconciliation is additive: a delayed history response must never discard a
 * message that arrived through the room event stream after the request began.
 */
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
