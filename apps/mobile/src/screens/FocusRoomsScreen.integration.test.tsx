import { fireEvent, screen, waitFor } from "@testing-library/react-native";
import FocusRoomsScreen from "./FocusRoomsScreen";
import { renderWithProviders } from "../test/renderWithProviders";
import { listInvitations, roomDetails } from "../lib/focusRoomsApi";
jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
  useAudioPlayer: () => ({ replace: jest.fn(), play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(), volume: 1, muted: false, loop: false }),
}));
jest.mock("../lib/focusRoomsApi", () => ({
  listRooms: jest
    .fn()
    .mockResolvedValue([
      {
        id: "room-1",
        title: "Quiet Bees",
        mode: "commitment",
        visibility: "public",
        ownerUserId: "u1",
        members: [],
        commitment: null,
      },
    ]),
  listInvitations: jest.fn().mockResolvedValue([]),
  roomDetails: jest.fn(),
  roomPresence: jest.fn().mockResolvedValue(undefined),
  joinRoom: jest.fn(),
  makeRoom: jest.fn(),
  makeCommitment: jest.fn(),
  acceptCommitment: jest.fn(),
  readyCommitment: jest.fn(),
  terminateRoom: jest.fn(),
  decideInvitation: jest.fn(),
}));
describe("mobile Focus Rooms", () => {
  beforeEach(() => {
    jest.mocked(listInvitations).mockResolvedValue([]);
  });

  it("renders discovery with touch-accessible room semantics", async () => {
    await renderWithProviders(<FocusRoomsScreen accessToken="token" onBack={() => undefined} />);
    await waitFor(() => expect(screen.getByText("Quiet Bees")).toBeTruthy());
    expect(
      screen.getByText("Leaving early ends the shared session for everyone."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Room title")).toBeTruthy();
  });

  it("keeps discovery and room creation available when invitations fail", async () => {
    jest
      .mocked(listInvitations)
      .mockRejectedValueOnce(new Error("Request failed with status 503."));

    await renderWithProviders(
      <FocusRoomsScreen accessToken="token" onBack={() => undefined} />,
    );

    await waitFor(() => expect(screen.getByText("Quiet Bees")).toBeTruthy());
    expect(
      screen.getByText("Invitations are temporarily unavailable."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Room title")).toBeTruthy();
    expect(screen.getByText("Create Session")).toBeTruthy();
  });

  it("shows the synchronized summary and returns on the primary action", async () => {
    const onBack = jest.fn();
    jest.mocked(roomDetails).mockResolvedValue({
      id: "room-1",
      title: "Quiet Bees",
      mode: "commitment",
      visibility: "public",
      ownerUserId: "u1",
      members: [],
      commitment: {
        id: "session-1",
        status: "completed",
        durationMinutes: 25,
        goalLabel: "Finish Chapter 3",
        reconnectGraceSeconds: 60,
        startedAt: "2026-08-06T10:00:00Z",
        expectedEndAt: "2026-08-06T10:25:00Z",
        endedAt: "2026-08-06T10:25:00Z",
        endReason: "completed_normally",
        endedByUserId: null,
      },
      currentUserId: "u1",
      isCurrentUserMember: true,
      canManageInvitations: false,
    });

    await renderWithProviders(
      <FocusRoomsScreen
        accessToken="token"
        initialRoomId="room-1"
        onBack={onBack}
      />,
    );

    await waitFor(() => expect(screen.getByText("Shared Focus Session Complete")).toBeTruthy());
    expect(screen.getByText("Goal: Finish Chapter 3")).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("Return to Shared Focus Sessions"));
    expect(onBack).toHaveBeenCalled();
  });

  it("renders an active shared session as a safe full-screen Focus hierarchy", async () => {
    jest.mocked(roomDetails).mockResolvedValue({
      id: "room-1", title: "Quiet Bees", mode: "commitment", visibility: "public", ownerUserId: "u1",
      members: [{ userId: "u1", displayName: "Saleh", anonymous: false, state: "focusing", ready: true }],
      commitment: { id: "session-1", status: "active", durationMinutes: 25, goalLabel: "Study together", pausedAt: null, accumulatedPausedSeconds: 0, reconnectGraceSeconds: 60, startedAt: new Date().toISOString(), expectedEndAt: new Date(Date.now() + 24 * 60_000).toISOString(), endedAt: null, endReason: null, endedByUserId: null },
      currentUserId: "u1", isCurrentUserMember: true, canManageInvitations: false,
    });
    await renderWithProviders(<FocusRoomsScreen accessToken="token" initialRoomId="room-1" onBack={() => undefined} />);
    await waitFor(() => expect(screen.getByTestId("shared-focus-active")).toBeTruthy());
    expect(screen.getByText("SHARED FOCUS SESSION")).toBeTruthy();
    expect(screen.getByText(/Focusing together/)).toBeTruthy();
    expect(screen.getByText(/Focus sounds/i)).toBeTruthy();
    expect(screen.getByText("Pause")).toBeTruthy();
  });
});
