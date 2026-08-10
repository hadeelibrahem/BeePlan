import { apiFetch, readJsonOrThrow } from "./apiClient";
export type FocusRoom = {
  id: string;
  title: string;
  mode: "casual" | "commitment";
  visibility: string;
  ownerUserId: string;
  members: {
    userId: string;
    displayName: string;
    anonymous: boolean;
    state: string;
    ready?: boolean;
    focusedDurationMinutes?: number | null;
  }[];
  commitment: null | {
    id: string;
    status: string;
    durationMinutes: number;
    goalLabel: string | null;
    pausedAt?: string | null;
    accumulatedPausedSeconds?: number;
    reconnectGraceSeconds: number;
    startedAt: string | null;
    expectedEndAt: string | null;
    endedAt: string | null;
    endReason: string | null;
    endedByUserId: string | null;
  };
  currentUserId: string;
  isCurrentUserMember: boolean;
  canManageInvitations: boolean;
  events?: { id: string; eventType: string; userId: string | null; createdAt: string; metadata?: Record<string, unknown> }[];
};
async function req<T>(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
) {
  return readJsonOrThrow<T>(
    await apiFetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    path,
  );
}
async function quietReq<T>(token: string, path: string): Promise<T> {
  const response = await apiFetch(path, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = Array.isArray(data?.message)
      ? data.message.join(", ")
      : data?.message;
    throw new Error(message ?? "Invitations are temporarily unavailable.");
  }
  return data as T;
}
export const listRooms = (t: string) => req<FocusRoom[]>(t, "/focus-rooms");
export const roomDetails = (t: string, id: string) =>
  req<FocusRoom>(t, `/focus-rooms/${id}`);
export const joinRoom = (t: string, id: string) =>
  req<FocusRoom>(t, `/focus-rooms/${id}/join`, "POST", {});
export const makeRoom = (t: string, title: string, mode: string) =>
  req<FocusRoom>(t, "/focus-rooms", "POST", {
    title,
    mode,
    visibility: "public",
  });
export const makeCommitment = (t: string, id: string, durationMinutes = 25, goalLabel?: string) =>
  req(t, `/focus-rooms/${id}/commitments`, "POST", {
    durationMinutes,
    goalLabel,
    reconnectGraceSeconds: 60,
  });
export const acceptCommitment = (t: string, id: string) =>
  req(t, `/focus-rooms/commitments/${id}/accept`, "PATCH", { accepted: true });
export const readyCommitment = (t: string, id: string) =>
  req<FocusRoom>(t, `/focus-rooms/commitments/${id}/ready`, "PATCH");
export const startCommitment = (t: string, id: string) =>
  req<FocusRoom>(t, `/focus-rooms/commitments/${id}/start`, "POST");
export const pauseCommitment = (t: string, id: string) => req<FocusRoom>(t, `/focus-rooms/commitments/${id}/pause`, "POST");
export const resumeCommitment = (t: string, id: string) => req<FocusRoom>(t, `/focus-rooms/commitments/${id}/resume`, "POST");
export const extendCommitment = (t: string, id: string, minutes: number) => req<FocusRoom>(t, `/focus-rooms/commitments/${id}/extend`, "POST", { minutes });
export const terminateRoom = (t: string, roomId: string, commandId: string) =>
  req(t, `/focus-rooms/${roomId}/leave`, "POST", {
    commandId,
    reason: "participant_left_early",
  });
export const roomPresence = (
  t: string,
  roomId: string,
  connectionId: string,
  connected: boolean,
) =>
  req<void>(
    t,
    `/focus-rooms/${roomId}/presence/${connected ? "connect" : "disconnect"}`,
    "POST",
    { connectionId },
  );
export type RoomInvitation = {
  invitation: { id: string; roomId: string };
  roomTitle: string;
};
export const listInvitations = (t: string) =>
  quietReq<RoomInvitation[]>(t, "/focus-rooms/invitations/mine");
export const decideInvitation = (
  t: string,
  id: string,
  decision: "accept" | "reject",
) =>
  req<FocusRoom | { accepted: false }>(
    t,
    `/focus-rooms/invitations/${id}/decision`,
    "PATCH",
    { decision },
  );
export type ManagedInvitation = {
  id: string;
  type: "email" | "link";
  label: string | null;
  inviteCode: string | null;
  status: string;
  sentAt: string;
  expiresAt: string;
};
export const createInvitation = (
  t: string,
  roomId: string,
  payload:
    | { type: "email"; email: string; expiresInHours: number }
    | { type: "link"; expiresInHours: number },
) =>
  req<{ inviteCode: string; expiresAt: string; emailDelivery?: string }>(
    t,
    `/focus-rooms/${roomId}/invitations`,
    "POST",
    payload,
  );
export const roomInvitations = (t: string, roomId: string) =>
  req<ManagedInvitation[]>(t, `/focus-rooms/${roomId}/invitations`);
export const revokeInvitation = (t: string, id: string) =>
  req(t, `/focus-rooms/invitations/${id}/revoke`, "POST");
