export function getSharedSessionRemainingMs(input: { expectedEndAt: string | Date; pausedAt?: string | Date | null; now: number }): number {
  const end = new Date(input.expectedEndAt).getTime();
  const reference = input.pausedAt ? new Date(input.pausedAt).getTime() : input.now;
  return Math.max(0, end - reference);
}
