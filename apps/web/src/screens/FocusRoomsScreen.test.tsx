import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FocusRoomsScreen from "./FocusRoomsScreen";
import { createRoomInvitation, getFocusRoom, listFocusRooms } from "../lib/focusRoomsApi";
import { LanguageProvider } from "../i18n/LanguageContext";

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
  joinFocusRoomByCode: vi.fn(),
  leaveFocusRoom: vi.fn(),
  createCommitment: vi.fn(),
  acceptCommitment: vi.fn(),
  readyCommitment: vi.fn(),
  startCommitment: vi.fn(),
  pauseCommitment: vi.fn(),
  resumeCommitment: vi.fn(),
  extendCommitment: vi.fn(),
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
    window.localStorage.removeItem("beeplan.language-preference");
    vi.mocked(getFocusRoom).mockResolvedValue(room);
    vi.mocked(createRoomInvitation).mockResolvedValue({
      inviteCode: "secure-code",
      expiresAt: "2026-08-07T10:00:00Z",
      invitedEmail: "hadeel@example.com",
    });
  });
  it("shows only relevant sessions with private create and join actions", async () => {
    render(
      <FocusRoomsScreen
        accessToken="token"
        onBack={() => undefined}
        onOpenRoom={() => undefined}
      />,
    );
    expect(await screen.findByText("Quiet Bees")).toBeInTheDocument();
    expect(screen.getByText("Your sessions")).toBeInTheDocument();
    expect(screen.queryByText("Leaving early ends the shared session for everyone.")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create session" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join with code" })).toBeInTheDocument();
  });
  it("opens the join-with-code dialog and displays invalid code errors", async () => {
    const user = userEvent.setup();
    const { joinFocusRoomByCode } = await import("../lib/focusRoomsApi");
    vi.mocked(joinFocusRoomByCode).mockRejectedValueOnce(new Error("Invalid session code."));
    render(<FocusRoomsScreen accessToken="token" onBack={() => undefined} onOpenRoom={() => undefined} />);
    await user.click(await screen.findByRole("button", { name: "Join with code" }));
    expect(screen.getByRole("dialog", { name: "Join session" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Session code"), "bee-b234");
    await user.click(screen.getByRole("button", { name: "Join session" }));
    expect(await screen.findByText("Could not join the session. Check the code and try again.")).toBeInTheDocument();
  });
  it("shows a friendly list failure and retries without exposing the API error", async () => {
    const user = userEvent.setup();
    vi.mocked(listFocusRooms).mockRejectedValueOnce(new Error("Internal server error"));
    render(<FocusRoomsScreen accessToken="token" onBack={() => undefined} onOpenRoom={() => undefined} />);
    expect(await screen.findByText("Couldn't load your shared sessions. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText("Internal server error")).not.toBeInTheDocument();
    const callsBeforeRetry = vi.mocked(listFocusRooms).mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(listFocusRooms).toHaveBeenCalledTimes(callsBeforeRetry + 1));
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
        name: "Invite someone to this Shared Focus session",
      }),
    ).toBeInTheDocument();
    const input = screen.getByLabelText("Email address");
    await user.type(input, "HADEEL@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));
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
  it("renders Create, Join, and Invite UI in Arabic while codes and links remain LTR", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("beeplan.language-preference", "ar");
    const listView = render(
      <LanguageProvider>
        <FocusRoomsScreen accessToken="token" onBack={() => undefined} onOpenRoom={() => undefined} />
      </LanguageProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "إنشاء جلسة" }));
    expect(screen.getByLabelText("عنوان الجلسة")).toBeInTheDocument();
    expect(screen.getByLabelText("مدة الجلسة")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "إلغاء" }));
    await user.click(screen.getByRole("button", { name: "انضمام برمز" }));
    expect(screen.getByLabelText("رمز الجلسة")).toHaveAttribute("dir", "ltr");
    listView.unmount();

    render(
      <LanguageProvider>
        <FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} />
      </LanguageProvider>,
    );
    await user.click(await screen.findByRole("button", { name: "إنشاء دعوة" }));
    expect(screen.getByRole("dialog", { name: "ادعُ شخصًا إلى جلسة التركيز المشترك" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "إنشاء رابط دعوة" }));
    await user.click(screen.getByRole("button", { name: "إنشاء رابط" }));
    expect(await screen.findByRole("button", { name: "نسخ" })).toBeInTheDocument();
    expect(screen.getByLabelText("رابط الدعوة")).toHaveAttribute("dir", "ltr");
    window.localStorage.removeItem("beeplan.language-preference");
  });
  it("renders compact participant role, current-user, and readiness information", async () => {
    render(<FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "participants" })).toBeInTheDocument();
    expect(screen.getByText("Saleh Emad")).toBeInTheDocument();
    expect(screen.getByText("Owner · You")).toBeInTheDocument();
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders lobby readiness and participant chrome in Arabic while the invite code stays LTR", async () => {
    window.localStorage.setItem("beeplan.language-preference", "ar");
    vi.mocked(getFocusRoom).mockResolvedValue({
      ...room,
      joinCode: "BEE-7K4M",
      commitment: {
        id: "session-lobby", status: "lobby", durationMinutes: 25, goalLabel: "Finish planning", breakMinutes: null, reconnectGraceSeconds: 60,
        startedAt: null, expectedEndAt: null, pausedAt: null, accumulatedPausedSeconds: 0, endedAt: null, endReason: null, endedByUserId: null,
      },
      members: [{ ...room.members[0], ready: false, state: "preparing" }],
    });
    render(<LanguageProvider><FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} /></LanguageProvider>);
    expect((await screen.findAllByText("الردهة")).length).toBeGreaterThan(0);
    expect(screen.getByText("0 من 1 مستعدون")).toBeInTheDocument();
    expect(screen.getByText("أوافق على قاعدة الإنهاء الجماعي.")).toBeInTheDocument();
    expect(screen.getByText("جارٍ الاستعداد")).toBeInTheDocument();
    expect(screen.getByText(/المالك.*أنت/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بدء الجلسة" })).toBeInTheDocument();
    expect(screen.getByText("BEE-7K4M")).toHaveAttribute("dir", "ltr");
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
    await user.click(await screen.findByRole("button", { name: "Ambient Sounds" }));
    expect(screen.getByTestId("focus-experience")).toHaveClass("fixed", "inset-0", "bg-[var(--bp-bg)]");
    expect(screen.getByTestId("focus-experience")).toHaveClass("text-[var(--bp-text)]");
    expect(screen.getByTestId("focus-experience")).not.toHaveClass("w-screen");
    expect(screen.getByRole("button", { name: "White Noise" })).toHaveClass("text-[var(--bp-muted)]");
    expect(screen.getByRole("button", { name: "Exit Focus" })).toHaveClass("text-[var(--bp-accent-ink)]");
    expect(screen.getAllByText("Saleh Emad")[0].parentElement).toHaveClass("border-[var(--bp-border)]", "text-[var(--bp-text)]");
    expect(screen.queryByRole("button", { name: /Back to Sessions/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/Focus sounds/i)).toHaveLength(1);
    expect(screen.getByText("Nature")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Nature")).not.toBeInTheDocument();
  });

  it("wires pause and add-time confirmations to authoritative shared actions", async () => {
    const user = userEvent.setup();
    const activeRoom = { ...room, commitment: { id: "session-1", status: "active", durationMinutes: 25, goalLabel: "Study together", breakMinutes: null, reconnectGraceSeconds: 60, startedAt: new Date().toISOString(), expectedEndAt: new Date(Date.now() + 25 * 60_000).toISOString(), pausedAt: null, accumulatedPausedSeconds: 0, endedAt: null, endReason: null, endedByUserId: null } };
    vi.mocked(getFocusRoom).mockResolvedValue(activeRoom);
    const api = await import("../lib/focusRoomsApi");
    // Owner-only invitation refresh may be slow; it must not keep session
    // controls disabled after the authoritative mutation response arrives.
    vi.mocked(api.getRoomInvitations).mockImplementation(() => new Promise(() => undefined));
    vi.mocked(api.pauseCommitment).mockResolvedValue({ ...activeRoom, commitment: { ...activeRoom.commitment, pausedAt: new Date().toISOString() } });
    vi.mocked(api.extendCommitment).mockResolvedValue(activeRoom);
    render(<FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} />);
    await user.click((await screen.findAllByRole("button", { name: "Pause" }))[0]);
    await user.click(screen.getAllByRole("button", { name: "Pause for everyone" })[0]);
    expect(api.pauseCommitment).toHaveBeenCalledWith("token", "session-1");
    expect((await screen.findAllByRole("button", { name: "Resume" }))[0]).not.toBeDisabled();
    await user.click(await screen.findByRole("button", { name: "Add Time" }));
    await user.click(screen.getAllByRole("button", { name: "+10 min" })[0]);
    expect(api.extendCommitment).toHaveBeenCalledWith("token", "session-1", 10);
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
    expect(await screen.findByText("Shared Focus session complete")).toBeInTheDocument();
    expect(screen.getByText("Finish Chapter 3")).toBeInTheDocument();
    expect(screen.getByText("Focused together")).toBeInTheDocument();
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Leave" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Return to Shared Focus sessions" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("renders the completion summary in Arabic", async () => {
    window.localStorage.setItem("beeplan.language-preference", "ar");
    vi.mocked(getFocusRoom).mockResolvedValue({
      ...room,
      commitment: {
        id: "session-ar-complete", status: "completed", durationMinutes: 25,
        goalLabel: "Finish Chapter 3", breakMinutes: null, reconnectGraceSeconds: 60,
        startedAt: "2026-08-06T10:00:00Z", expectedEndAt: "2026-08-06T10:25:00Z",
        endedAt: "2026-08-06T10:25:00Z", endReason: "completed_normally", endedByUserId: null,
      },
    });
    render(<LanguageProvider><FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} /></LanguageProvider>);
    expect(await screen.findByText("اكتملت جلسة التركيز المشترك")).toBeInTheDocument();
    expect(screen.getByText("تم التركيز معًا")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "العودة إلى جلسات التركيز المشترك" })).toBeInTheDocument();
    window.localStorage.removeItem("beeplan.language-preference");
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
    expect(screen.getByText("Focused together")).toBeInTheDocument();
    expect(screen.getByText("12 min focused")).toBeInTheDocument();
  });
  it("does not connect presence for a terminal session", async () => {
    const { presence } = await import("../lib/focusRoomsApi");
    vi.clearAllMocks();
    vi.mocked(getFocusRoom).mockResolvedValue({ ...room, commitment: { id: "ended", status: "completed", durationMinutes: 25, goalLabel: null, breakMinutes: null, reconnectGraceSeconds: 60, startedAt: "2026-08-06T10:00:00Z", expectedEndAt: "2026-08-06T10:25:00Z", endedAt: "2026-08-06T10:25:00Z", endReason: "completed_normally", endedByUserId: null } });
    render(<FocusRoomsScreen accessToken="token" roomId="room-1" onBack={() => undefined} onOpenRoom={() => undefined} />);
    await screen.findByText("Shared Focus session complete");
    expect(presence).not.toHaveBeenCalled();
  });
});
