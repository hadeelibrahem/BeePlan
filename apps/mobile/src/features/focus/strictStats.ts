import type { BlockStatistics } from '../../../modules/beeplan-focus-blocker';

/**
 * Interprets the native session end reason for the post-session summary.
 * `endReason` comes from the `onSessionEnded` / `onEmergencyExit` events:
 * 'completed' | 'stopped' | 'emergencyExit:<reason>' | null.
 */
export function summarizeEndReason(endReason: string | null): {
  usedEmergencyExit: boolean;
  completedNormally: boolean;
  endedEarly: boolean;
} {
  return {
    usedEmergencyExit: endReason?.startsWith('emergencyExit') ?? false,
    completedNormally: endReason === 'completed',
    endedEarly: endReason != null && endReason !== 'completed',
  };
}

/** Most recent attempt timestamp for a package, or null when none. */
export function latestTimestampFor(stats: BlockStatistics, packageName: string): number | null {
  const times = stats.events.filter((event) => event.packageName === packageName).map((event) => event.timestampMs);
  return times.length ? Math.max(...times) : null;
}
