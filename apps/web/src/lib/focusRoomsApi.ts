const base = (import.meta.env.VITE_API_URL ?? "http://127.0.0.1:3000").replace(
  /\/+$/,
  "",
);
export type RoomMember = {
  userId: string;
  displayName: string;
  role: string;
  state: string;
  anonymous: boolean;
  ready?: boolean;
  acceptedAgreement?: boolean;
  focusedDurationMinutes?: number | null;
};
export type Commitment = {
  id: string;
  status: string;
  durationMinutes: number;
  goalLabel: string | null;
  pausedAt?: string | null;
  accumulatedPausedSeconds?: number;
  breakMinutes: number | null;
  reconnectGraceSeconds: number;
  startedAt: string | null;
  expectedEndAt: string | null;
  endedAt: string | null;
  endReason: string | null;
  endedByUserId: string | null;
};
export type FocusRoom = {
  id: string;
  title: string;
  description: string | null;
  visibility: string;
  mode: "casual" | "commitment";
  ownerUserId: string;
  joinCode: string;
  maxMembers: number | null;
  members: RoomMember[];
  commitment: Commitment | null;
  events: {
    id: string;
    userId: string | null;
    eventType: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }[];
  currentUserId: string;
  isCurrentUserMember: boolean;
  canManageInvitations: boolean;
};
async function request<T>(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(data?.message ?? "Focus Rooms request failed.");
  return data as T;
}
export const listFocusRooms = (t: string) =>
  request<FocusRoom[]>(t, "/focus-rooms");
export const getFocusRoom = (t: string, id: string) =>
  request<FocusRoom>(t, `/focus-rooms/${id}`);
export const createFocusRoom = (
  t: string,
  body: {
    title: string;
    visibility: string;
    mode: string;
    maxMembers?: number;
  },
) => request<FocusRoom>(t, "/focus-rooms", "POST", body);
export const joinFocusRoom = (t: string, id: string, inviteCode?: string) =>
  request<FocusRoom>(
    t,
    `/focus-rooms/${id}/join`,
    "POST",
    inviteCode ? { inviteCode } : {},
  );
export const joinFocusRoomByCode = (t: string, code: string) =>
  request<FocusRoom>(t, "/focus-rooms/join", "POST", { code });
export const leaveFocusRoom = (t: string, id: string, body?: unknown) =>
  request<FocusRoom | { collectiveEnd: false }>(
    t,
    `/focus-rooms/${id}/leave`,
    "POST",
    body ?? {},
  );
export const createCommitment = (
  t: string,
  roomId: string,
  body: {
    durationMinutes: number;
    goalLabel?: string;
    breakMinutes?: number;
    reconnectGraceSeconds: number;
  },
) => request<Commitment>(t, `/focus-rooms/${roomId}/commitments`, "POST", body);
export const acceptCommitment = (t: string, id: string) =>
  request(t, `/focus-rooms/commitments/${id}/accept`, "PATCH", {
    accepted: true,
  });
export const readyCommitment = (t: string, id: string) =>
  request<FocusRoom>(t, `/focus-rooms/commitments/${id}/ready`, "PATCH");
export const startCommitment = (t: string, id: string) =>
  request<FocusRoom>(t, `/focus-rooms/commitments/${id}/start`, "POST");
export const pauseCommitment = (t: string, id: string) => request<FocusRoom>(t, `/focus-rooms/commitments/${id}/pause`, "POST");
export const resumeCommitment = (t: string, id: string) => request<FocusRoom>(t, `/focus-rooms/commitments/${id}/resume`, "POST");
export const extendCommitment = (t: string, id: string, minutes: number) => request<FocusRoom>(t, `/focus-rooms/commitments/${id}/extend`, "POST", { minutes });
export const presence = (
  t: string,
  roomId: string,
  connectionId: string,
  connected: boolean,
) =>
  request<void>(
    t,
    `/focus-rooms/${roomId}/presence/${connected ? "connect" : "disconnect"}`,
    "POST",
    { connectionId },
  );
export async function subscribeRoomEvents(
  token: string,
  roomId: string,
  onEvent: (event: { id?: string; type: string }) => void,
  signal: AbortSignal,
) {
  const response = await fetch(`${base}/focus-rooms/${roomId}/events`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal,
  });
  if (!response.ok || !response.body)
    throw new Error("Realtime connection failed.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const part = await reader.read();
    if (part.done) break;
    buffer += decoder.decode(part.value, { stream: true });
    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? "";
    for (const message of messages) {
      const data = message
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();
      if (data)
        try {
          onEvent(JSON.parse(data));
        } catch {
          /* snapshot resync is authoritative */
        }
    }
  }
}
export type RoomInvitation = {
  invitation: { id: string; roomId: string; expiresAt: string };
  roomTitle: string;
};
export const listRoomInvitations = (t: string) =>
  request<RoomInvitation[]>(t, "/focus-rooms/invitations/mine");
export const decideRoomInvitation = (
  t: string,
  id: string,
  decision: "accept" | "reject",
) =>
  request<FocusRoom | { accepted: false }>(
    t,
    `/focus-rooms/invitations/${id}/decision`,
    "PATCH",
    { decision },
  );
export const createRoomInvitation = (
  t: string,
  roomId: string,
  payload:
    | { type: "email"; email: string; expiresInHours?: number }
    | { type: "link"; expiresInHours?: number },
) =>
  request<{
    inviteCode: string;
    expiresAt: string;
    invitedEmail: string | null;
    emailDelivery?: string;
  }>(t, `/focus-rooms/${roomId}/invitations`, "POST", payload);
export type ManagedRoomInvitation = {
  id: string;
  type: "email" | "link";
  label: string | null;
  inviteCode: string | null;
  status: "pending" | "accepted" | "rejected" | "expired" | "revoked";
  sentAt: string;
  expiresAt: string;
};
export const getRoomInvitations = (t: string, roomId: string) =>
  request<ManagedRoomInvitation[]>(t, `/focus-rooms/${roomId}/invitations`);
export const revokeRoomInvitation = (t: string, id: string) =>
  request<{ revoked: true }>(
    t,
    `/focus-rooms/invitations/${id}/revoke`,
    "POST",
  );
