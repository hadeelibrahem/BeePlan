import { apiFetch, apiFetchStream, readJsonOrThrow } from "./apiClient";
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
  aiFocusCoachEnabled?: boolean;
  events?: { id: string; eventType: string; userId: string | null; createdAt: string; metadata?: Record<string, unknown> }[];
};
export type FocusRoomChatMessage = { id: string; roomId: string; senderUserId: string | null; senderType: "user" | "ai" | "system"; senderName: string; content: string; metadata: Record<string, unknown>; createdAt: string };
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
export const joinRoomByCode = (t: string, code: string) =>
  req<FocusRoom>(t, "/focus-rooms/join", "POST", { code: code.trim() });
export const makeRoom = (t: string, title: string, mode: string) =>
  req<FocusRoom>(t, "/focus-rooms", "POST", {
    title,
    mode,
    visibility: "private",
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
export const roomMessages = (t: string, roomId: string) => req<{ messages: FocusRoomChatMessage[] }>(t, `/focus-rooms/${roomId}/chat/messages`);
export const sendRoomMessage = (t: string, roomId: string, content: string) => req<FocusRoomChatMessage>(t, `/focus-rooms/${roomId}/chat/messages`, "POST", { content });
export async function subscribeRoomEvents(token: string, roomId: string, onEvent: (event: { id?: string; type: string; payload?: { message?: FocusRoomChatMessage } }) => void, signal: AbortSignal) {
  const response = await apiFetchStream(`/focus-rooms/${roomId}/events`, { headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" }, signal });
  if (!response.ok || !response.body) throw new Error("Realtime connection failed.");
  const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
  while (!signal.aborted) { const part = await reader.read(); if (part.done) break; buffer += decoder.decode(part.value, { stream: true }); const entries = buffer.split("\n\n"); buffer = entries.pop() ?? ""; for (const entry of entries) { const data = entry.split("\n").find(line => line.startsWith("data:"))?.slice(5).trim(); if (data) try { onEvent(JSON.parse(data)); } catch { /* ignore malformed SSE event */ } } }
}
