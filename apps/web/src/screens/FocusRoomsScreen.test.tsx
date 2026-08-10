import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FocusRoomsScreen from "./FocusRoomsScreen";
import { createRoomInvitation, getFocusRoom } from "../lib/focusRoomsApi";

vi.mock("../lib/focusRoomsApi", () => ({
  listFocusRooms: vi.fn().mockResolvedValue([
    {
      id: "room-1",
      title: "Quiet Bees",
      mode: "commitment",
      visibility: "public",
      ownerUserId: "u1",
      maxMembers: null,
      members: [],
      commitment: null,
      events: [],
    },
  ]),
  listRoomInvitations: vi.fn().mockResolvedValue([]),
  getFocusRoom: vi.fn(),
  getRoomInvitations: vi.fn().mockResolvedValue([]),
  createFocusRoom: vi.fn(),
  joinFocusRoom: vi.fn(),
  leaveFocusRoom: vi.fn(),
  createCommitment: vi.fn(),
  acceptCommitment: vi.fn(),
  readyCommitment: vi.fn(),
  startCommitment: vi.fn(),
  presence: vi.fn().mockResolvedValue(undefined),
  subscribeRoomEvents: vi.fn().mockResolvedValue(undefined),
  decideRoomInvitation: vi.fn(),
  createRoomInvitation: vi.fn(),
  revokeRoomInvitation: vi.fn(),
}));
const room = {
  id: "room-1",
  title: "Quiet Bees",
  mode: "commitment" as const,
  visibility: "private",
  ownerUserId: "u1",
  maxMembers: null,
  currentUserId: "u1",
  isCurrentUserMember: true,
  canManageInvitations: true,
  members: [
    {
      userId: "u1",
      displayName: "Saleh Emad",
      role: "owner",
      state: "ready",
      anonymous: false,
      ready: true,
    },
  ],
  commitment: null,
  events: [
    {
      id: "e1",
      userId: "u1",
      eventType: "member_joined",
      createdAt: "2026-08-06T10:00:00Z",
      metadata: {},
    },
  ],
};
describe("Focus Rooms UI", () => {
  beforeEach(() => {
    vi.mocked(getFocusRoom).mockResolvedValue(room);
    vi.mocked(createRoomInvitation).mockResolvedValue({
      inviteCode: "secure-code",
      expiresAt: "2026-08-07T10:00:00Z",
      invitedEmail: "hadeel@example.com",
    });
  });
  it("shows discovery using an in-app create action", async () => {
    render(
      <FocusRoomsScreen
        accessToken="token"
        onBack={() => undefined}
        onOpenRoom={() => undefined}
      />,
    );
    expect(await screen.findByText("Quiet Bees")).toBeInTheDocument();
    expect(
      screen.getByText("Leaving early ends the shared session for everyone."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create session" }),
    ).toBeInTheDocument();
  });
  it("opens an accessible email modal, validates, and sends normalized email", async () => {
    const user = userEvent.setup();
    render(
      <FocusRoomsScreen
        accessToken="token"
        roomId="room-1"
        onBack={() => undefined}
        onOpenRoom={() => undefined}
      />,
    );
    await user.click(
      await screen.findByRole("button", { name: "Create invite" }),
    );
    expect(
      screen.getByRole("dialog", {
        name: "Invite someone to this Shared Focus Session",
      }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Email address");
    await user.type(input, "HADEEL@example.com");
    await user.click(screen.getByRole("button", { name: "Send Invite" }));
    await waitFor(() =>
      expect(createRoomInvitation).toHaveBeenCalledWith("token", "room-1", {
        type: "email",
        email: "hadeel@example.com",
        expiresInHours: 24,
      }),
    );
    expect(
      await screen.findByText("Invitation sent to hadeel@example.com."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Join Room" }),
    ).not.toBeInTheDocument();
  });
  it("humanizes activity keys", async () => {
    render(
      <FocusRoomsScreen
        accessToken="token"
        roomId="room-1"
        onBack={() => undefined}
        onOpenRoom={() => undefined}
      />,
    );
    expect(
      await screen.findByText("Saleh Emad joined the room"),
    ).toBeInTheDocument();
    expect(screen.queryByText("member_joined")).not.toBeInTheDocument();
  });

  it("opens and closes one shared Focus Sounds panel from the active adapter", async () => {
    const user = userEvent.setup();
    vi.mocked(getFocusRoom).mockResolvedValue({
      ...room,
      commitment: {
        id: "session-1",
        status: "active",
        durationMinutes: 25,
        goalLabel: "Study together",
        breakMinutes: null,
        reconnectGraceSeconds: 60,
        startedAt: new Date().toISOString(),
        expectedEndAt: new Date(Date.now() + 25 * 60_000).toISOString(),
        pausedAt: null,
        accumulatedPausedSeconds: 0,
        endedAt: null,
        endReason: null,
        endedByUserId: null,
      },
    });
    render(<FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: "Focus Sounds" }));
    expect(screen.getByTestId("focus-experience")).toHaveClass("min-h-screen", "w-screen");
    expect(screen.queryByRole("button", { name: /Back to Sessions/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Focus sounds/i)).toHaveLength(2);
    expect(screen.getByText("Nature")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Nature")).not.toBeInTheDocument();
  });

  it("shows the synchronized completion summary before returning to sessions", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    vi.mocked(getFocusRoom).mockResolvedValue({
      ...room,
      commitment: {
        id: "session-1",
        status: "completed",
        durationMinutes: 25,
        goalLabel: "Finish Chapter 3",
        breakMinutes: null,
        reconnectGraceSeconds: 60,
        startedAt: "2026-08-06T10:00:00Z",
        expectedEndAt: "2026-08-06T10:25:00Z",
        endedAt: "2026-08-06T10:25:00Z",
        endReason: "completed_normally",
        endedByUserId: null,
      },
    });
    render(
      <FocusRoomsScreen
        accessToken="token"
        roomId="room-1"
        onBack={onBack}
        onOpenRoom={() => undefined}
      />,
    );
    expect(await screen.findByText("Shared Focus Session Complete")).toBeInTheDocument();
    expect(screen.getByText("Finish Chapter 3")).toBeInTheDocument();
    expect(screen.getByText("Actual shared focus")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Return to Shared Focus Sessions" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("uses neutral privacy wording for an anonymous reconnect timeout", async () => {
    vi.mocked(getFocusRoom).mockResolvedValue({
      ...room,
      members: [{ ...room.members[0], displayName: "Anonymous Bee", anonymous: true, focusedDurationMinutes: 12 }],
      commitment: {
        id: "session-2",
        status: "ended_early",
        durationMinutes: 50,
        goalLabel: null,
        breakMinutes: null,
        reconnectGraceSeconds: 60,
        startedAt: "2026-08-06T10:00:00Z",
        expectedEndAt: "2026-08-06T10:50:00Z",
        endedAt: "2026-08-06T10:12:00Z",
        endReason: "participant_disconnect_timeout",
        endedByUserId: "u1",
      },
    });
    render(<FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} />);
    expect(await screen.findByText("The session ended because a participant left.")).toBeInTheDocument();
    expect(screen.getByText("Remaining at termination")).toBeInTheDocument();
    expect(screen.getByText("Participant Disconnect Timeout")).toBeInTheDocument();
  });
  it("does not connect presence for a terminal session", async () => {
    const { presence } = await import("../lib/focusRoomsApi");
    vi.clearAllMocks();
    vi.mocked(getFocusRoom).mockResolvedValue({ ...room, commitment: { id: "ended", status: "completed", durationMinutes: 25, goalLabel: null, breakMinutes: null, reconnectGraceSeconds: 60, startedAt: "2026-08-06T10:00:00Z", expectedEndAt: "2026-08-06T10:25:00Z", endedAt: "2026-08-06T10:25:00Z", endReason: "completed_normally", endedByUserId: null } });
    render(<FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} />);
    await screen.findByText("Shared Focus Session Complete");
    expect(presence).not.toHaveBeenCalled();
  });
});
