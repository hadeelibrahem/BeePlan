export type RoomMode = 'casual' | 'commitment';
export type SharedSessionStatus =
  | 'lobby'
  | 'active'
  | 'break'
  | 'completed'
  | 'ended_early';
export const isSharedSessionLocked = (status: string) => status !== 'lobby';
export const isSharedSessionTerminal = (status: string) =>
  status === 'completed' || status === 'ended_early';
export type ParticipantOutcome =
  | 'completed'
  | 'collective_end_trigger'
  | 'ended_due_to_other_member'
  | 'disconnected_recovered'
  | 'cancelled_before_start';
export function outcomesForCollectiveEnd(
  userIds: string[],
  triggerUserId: string,
): Record<string, ParticipantOutcome> {
  return Object.fromEntries(
    userIds.map((id) => [
      id,
      id === triggerUserId
        ? 'collective_end_trigger'
        : 'ended_due_to_other_member',
    ]),
  );
}
export function shouldCollectivelyEnd(
  mode: RoomMode,
  active: boolean,
  intentional: boolean,
  hasUserConnection: boolean,
  graceExpired: boolean,
) {
  if (mode !== 'commitment' || !active) return false;
  if (intentional) return true;
  return !hasUserConnection && graceExpired;
}
export function actualMinutes(
  startedAt: Date,
  endedAt: Date,
  plannedMinutes: number,
) {
  return Math.max(
    0,
    Math.min(
      plannedMinutes,
      Math.floor((endedAt.getTime() - startedAt.getTime()) / 60_000),
    ),
  );
}
