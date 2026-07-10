// Mirrors the backend social DTOs — see apps/api/src/social.

export type FriendSummary = {
  userId: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
};

export type FriendRequest = {
  id: string;
  status: string;
  direction: 'incoming' | 'outgoing';
  user: FriendSummary;
  createdAt: string;
};

export type PermissionStatus = 'pending' | 'active' | 'rejected' | 'revoked' | 'expired';

export type LocationSharingPermission = {
  id: string;
  mode: 'proximity' | 'live_location';
  status: PermissionStatus;
  direction: 'incoming' | 'outgoing';
  expiresAt: string | null;
  respondedAt: string | null;
  friend: FriendSummary | null;
  createdAt: string;
  // Most recent state change, else creation time (backend-computed).
  lastActivityAt: string;
  // Radius of the linked outgoing person reminder, if any.
  radiusMeters: number | null;
};

export type SharingExpiration = '1h' | 'today' | '1w' | 'always';

export type PersonReminderMatchStatus = 'matched' | 'needs_selection' | 'no_match';

export type ParsePersonReminderResult = {
  draft: {
    title: string;
    person: {
      isPersonReminder: boolean;
      personName: string;
      message: string;
      confidence: number;
    };
  };
  triggerType: 'person_nearby';
  isPersonReminder: boolean;
  confidence: number;
  match: {
    status: PersonReminderMatchStatus;
    candidates: FriendSummary[];
    confidence: number;
  };
  // Flat convenience fields for AI-first clients.
  matchedFriendId: string | null;
  matchedFriendName: string | null;
  matchConfidence: number;
  needsSelection: boolean;
};

export type CreatePersonReminderInput = {
  title: string;
  targetUserId: string;
  message?: string;
  expiration: SharingExpiration;
  radiusMeters?: number;
  cooldownMinutes?: number;
};

// Returned by GET /person-reminders/nearby — deliberately no coordinates.
export type NearbyHit = {
  reminderId: string;
  title: string;
  message: string;
  targetName: string;
};
