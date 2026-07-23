// Public response shapes for the Personal Context feature (saved places +
// recurring commitments). Shared conceptually with the web/mobile typed clients.

export type SavedPlace = {
  id: string;
  name: string;
  icon: string | null;
  address: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  aliases: string[];
  createdAt: string;
  updatedAt: string;
};

export type RecurringCommitment = {
  id: string;
  title: string;
  daysOfWeek: number[]; // 0 = Sunday .. 6 = Saturday
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  savedLocationId: string | null;
  savedLocationName: string | null;
  repeatWeekly: boolean;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A commitment reduced to a hard busy interval for a specific plan date. Fed to
 * the planner's Rule Engine, which turns each one into a FixedBlock the
 * scheduler must never overlap.
 */
export type CommitmentBusyWindow = {
  commitmentId: string;
  title: string;
  start: string; // HH:mm
  end: string; // HH:mm
  placeName: string | null;
};

/** Resolution of a natural-language place mention to a canonical saved place. */
export type ResolvedPlace = {
  id: string;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  address: string | null;
  /** The alias/word in the source text that matched. */
  matchedAlias: string;
};
