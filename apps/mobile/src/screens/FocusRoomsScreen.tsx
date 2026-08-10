import { useEffect, useRef, useState } from "react";
import {
  AppState,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import {
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "../components/layout";
import {
  acceptCommitment,
  joinRoom,
  listRooms,
  listInvitations,
  decideInvitation,
  createInvitation,
  roomInvitations,
  revokeInvitation,
  type ManagedInvitation,
  makeCommitment,
  makeRoom,
  readyCommitment,
  startCommitment,
  roomDetails,
  roomPresence,
  terminateRoom,
  pauseCommitment,
  resumeCommitment,
  extendCommitment,
  type FocusRoom,
  type RoomInvitation,
} from "../lib/focusRoomsApi";
import { useTheme } from "../theme/useTheme";
import { useFocusAudio } from "../lib/useFocusAudio";
import { FOCUS_SOUNDS } from "../lib/focusSounds";
import { getSharedSessionRemainingMs } from "../lib/sharedSessionTiming";
const AGREEMENT =
  "Everyone agrees to stay until the shared session ends. If any participant leaves early, the shared session ends for everyone.";
const commandId = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const n = Math.floor(Math.random() * 16);
    return (ch === "x" ? n : (n & 3) | 8).toString(16);
  });
const TERMINAL_STATUSES = new Set(["completed", "ended_early", "terminated", "cancelled"]);
const isTerminalStatus = (status?: string | null) => Boolean(status && TERMINAL_STATUSES.has(status));
const lifecycleLog = (reason: string, room?: FocusRoom | null, source?: string) => {
  if (__DEV__) console.info('[SharedFocus lifecycle]', { reason, roomId: room?.id, commitmentId: room?.commitment?.id, status: room?.commitment?.status, source });
};
export default function FocusRoomsScreen({
  accessToken,
  initialRoomId,
  onBack,
}: {
  accessToken: string;
  initialRoomId?: string;
  onBack: () => void;
}) {
  const connectionId = useRef(commandId());
  const { theme } = useTheme(),
    c = theme.colors;
  const [rooms, setRooms] = useState<FocusRoom[]>([]),
    [room, setRoom] = useState<FocusRoom | null>(null),
    [title, setTitle] = useState(""),
    [durationMinutes, setDurationMinutes] = useState(25),
    [goalLabel, setGoalLabel] = useState(""),
    [accepted, setAccepted] = useState(false),
    [leaveOpen, setLeaveOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false),
    [inviteEmail, setInviteEmail] = useState(""),
    [inviteType, setInviteType] = useState<"email" | "link">("email"),
    [inviteError, setInviteError] = useState(""),
    [inviteLoading, setInviteLoading] = useState(false),
    [managedInvites, setManagedInvites] = useState<ManagedInvitation[]>([]),
    [notice, setNotice] = useState("");
  const [invitations, setInvitations] = useState<RoomInvitation[]>([]);
  const [controlBusy, setControlBusy] = useState(false), [controlError, setControlError] = useState(""), [pauseOpen, setPauseOpen] = useState(false), [addTimeOpen, setAddTimeOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [soundsOpen, setSoundsOpen] = useState(false);
  const [invitationLoadError, setInvitationLoadError] = useState("");
  const presenceAttempt = useRef<string | null>(null), presenceConnected = useRef(false), terminalSync = useRef(false);
  const focusAudio = useFocusAudio();
  const previousCommitmentStatus = useRef<string | null>(null);
  const refreshSequence = useRef(0);
  const refresh = async () => {
    const sequence = ++refreshSequence.current;
    if (room) {
      const next = await roomDetails(accessToken, room.id);
      if (sequence !== refreshSequence.current) return;
      setRoom(next);
      if (next.canManageInvitations)
        setManagedInvites(await roomInvitations(accessToken, room.id));
    } else {
      const nextRooms = await listRooms(accessToken);
      setRooms(nextRooms);
      try {
        setInvitations(await listInvitations(accessToken));
        setInvitationLoadError("");
      } catch {
        setInvitations([]);
        setInvitationLoadError("Invitations are temporarily unavailable.");
      }
    }
  };
  const sendInvite = async () => {
    const normalized = inviteEmail.trim().toLowerCase();
    setInviteError("");
    if (inviteType === "email" && !/^\S+@\S+\.\S+$/.test(normalized)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    setInviteLoading(true);
    try {
      const created = await createInvitation(
        accessToken,
        room!.id,
        inviteType === "email"
          ? { type: "email", email: normalized, expiresInHours: 24 }
          : { type: "link", expiresInHours: 24 },
      );
      if (inviteType === "link")
        await Share.share({ message: `${room!.title}: ${created.inviteCode}` });
      setNotice(
        inviteType === "email"
          ? created.emailDelivery === "failed"
            ? "Invitation created, but the email could not be sent."
            : `Invitation sent to ${normalized}.`
          : "Invite link created.",
      );
      setInviteOpen(false);
      setInviteEmail("");
      await refresh();
    } catch (cause) {
      setInviteError(
        cause instanceof Error ? cause.message : "Could not create invitation.",
      );
    } finally {
      setInviteLoading(false);
    }
  };
  const sharedControl = async (action: () => Promise<FocusRoom>, allowed = true) => { if (!allowed || isTerminalStatus(room?.commitment?.status)) { await refresh().catch(() => undefined); return; } setControlBusy(true); setControlError(""); try { setRoom(await action()); await refresh(); } catch (cause) { if (cause instanceof Error && cause.message.includes("This shared session has ended")) terminalSync.current = true; setControlError(cause instanceof Error ? cause.message : "Unable to update the shared session."); await refresh().catch(() => undefined); } finally { setControlBusy(false); } };
  useEffect(() => {
    if (room?.commitment?.pausedAt) setNow(new Date(room.commitment.pausedAt).getTime());
    const timer = setInterval(() => { if (!room?.commitment?.pausedAt) setNow(Date.now()); }, 1000);
    return () => clearInterval(timer);
  }, [room?.commitment?.pausedAt]);
  useEffect(() => {
    if (initialRoomId) {
      const sequence = ++refreshSequence.current;
      void roomDetails(accessToken, initialRoomId).then(async (next) => {
        if (sequence !== refreshSequence.current) return;
        setRoom(next);
        if (next.canManageInvitations)
          setManagedInvites(await roomInvitations(accessToken, next.id));
      });
    } else void refresh();
    const poll = setInterval(() => { if (!isTerminalStatus(room?.commitment?.status)) void refresh().catch(() => undefined); }, room ? 1_000 : 30_000);
    return () => clearInterval(poll);
  }, [initialRoomId, accessToken, room?.id, room?.commitment?.status]);
  useEffect(() => {
    if (!room?.id || !room.commitment || isTerminalStatus(room.commitment.status)) return;
    const id = connectionId.current;
    const key = `${room.id}:${room.commitment.id}`;
    if (presenceAttempt.current !== key) terminalSync.current = false;
    if (presenceAttempt.current === key) return;
    presenceAttempt.current = key;
    let disposed = false;
    const setPresence = (connected: boolean) =>
      void roomPresence(accessToken, room.id, id, connected)
        .then(() => { if (connected) { presenceConnected.current = true; return refresh(); } })
        .catch((cause) => { if (cause instanceof Error && cause.message.includes("This shared session has ended")) { terminalSync.current = true; void refresh().catch(() => undefined); } });
    setPresence(true);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setPresence(true);
    });
    return () => {
      subscription.remove();
    };
  }, [room?.id, room?.commitment?.id, room?.commitment?.status, accessToken]);
  useEffect(() => {
    const sessionActive = Boolean(room?.commitment && ["active", "break"].includes(room.commitment.status));
    const sessionTerminal = Boolean(room?.commitment && ["completed", "ended_early", "cancelled", "terminated"].includes(room.commitment.status));
    const status = room?.commitment?.status ?? null;
    const paused = Boolean(room?.commitment?.pausedAt);
    if (previousCommitmentStatus.current === "active" && paused) focusAudio.pause();
    if (previousCommitmentStatus.current === "paused" && !paused && focusAudio.activeSound) void focusAudio.play(focusAudio.activeSound);
    previousCommitmentStatus.current = paused ? "paused" : status;
    if (!sessionActive || sessionTerminal) focusAudio.stop();
    return () => { if (!sessionActive) focusAudio.stop(); };
  }, [room?.commitment?.status, room?.commitment?.pausedAt, focusAudio.stop, focusAudio.pause, focusAudio.play, focusAudio.activeSound]);
  if (!room)
    return (
      <View className="flex-1 p-4" style={{ backgroundColor: c.background }}>
        <PageHeader
          title="Shared Focus Sessions"
          subtitle="Start together, stay synchronized, finish together"
          onBack={onBack}
        />
        <View className="mb-4 gap-3">
          <TextInput
            accessibilityLabel="Room title"
            value={title}
            onChangeText={setTitle}
            placeholder="Room title"
            placeholderTextColor={c.secondaryText}
            className="min-h-12 rounded-xl border px-4"
            style={{ borderColor: c.border, color: c.text }}
          />
          <Text className="font-bold" style={{ color: c.text }}>Session duration</Text>
          <View className="flex-row gap-2">
            {[25, 50, 90].map((minutes) => (
              <Pressable key={minutes} accessibilityRole="button" accessibilityState={{ selected: durationMinutes === minutes }} onPress={() => setDurationMinutes(minutes)} className="min-h-12 flex-1 items-center justify-center rounded-xl border" style={{ borderColor: durationMinutes === minutes ? c.accent : c.border, backgroundColor: durationMinutes === minutes ? c.card : "transparent" }}>
                <Text className="font-bold" style={{ color: c.text }}>{minutes} min</Text>
              </Pressable>
            ))}
          </View>
          <TextInput accessibilityLabel="Custom duration in minutes" keyboardType="number-pad" value={String(durationMinutes)} onChangeText={(value) => setDurationMinutes(Number(value.replace(/\D/g, "")))} placeholder="Custom duration in minutes" placeholderTextColor={c.secondaryText} className="min-h-12 rounded-xl border px-4" style={{ borderColor: c.border, color: c.text }} />
          <TextInput accessibilityLabel="Goal label optional" value={goalLabel} onChangeText={setGoalLabel} maxLength={160} placeholder="Goal label (optional)" placeholderTextColor={c.secondaryText} className="min-h-12 rounded-xl border px-4" style={{ borderColor: c.border, color: c.text }} />
          <PrimaryButton
            disabled={!title.trim() || durationMinutes < 1 || durationMinutes > 480}
            onPress={() =>
              title.trim() &&
              void makeRoom(accessToken, title.trim(), "commitment")
                .then(async (created) => {
                  await makeCommitment(accessToken, created.id, durationMinutes, goalLabel.trim() || undefined);
                  return roomDetails(accessToken, created.id);
                })
                .then(setRoom)
            }
          >
            Create Session
          </PrimaryButton>
        </View>
        {invitationLoadError ? (
          <Text
            accessibilityRole="alert"
            className="mb-3 rounded-xl p-3"
            style={{ color: c.secondaryText, backgroundColor: c.card }}
          >
            {invitationLoadError}
          </Text>
        ) : null}
        {invitations.map(({ invitation, roomTitle }) => (
          <View
            key={invitation.id}
            className="mb-3 rounded-2xl border p-4"
            style={{ borderColor: c.border }}
          >
            <Text className="font-black" style={{ color: c.text }}>
              {roomTitle}
            </Text>
            <Text className="mb-3 mt-1" style={{ color: c.secondaryText }}>
              Shared focus session invitation
            </Text>
            <View className="flex-row gap-2">
              <SecondaryButton
                onPress={() =>
                  void decideInvitation(
                    accessToken,
                    invitation.id,
                    "reject",
                  ).then(refresh)
                }
              >
                Reject
              </SecondaryButton>
              <PrimaryButton
                onPress={() =>
                  void decideInvitation(accessToken, invitation.id, "accept")
                    .then(() => roomDetails(accessToken, invitation.roomId))
                    .then(setRoom)
                }
              >
                Accept
              </PrimaryButton>
            </View>
          </View>
        ))}
        <FlatList
          data={rooms}
          keyExtractor={(x) => x.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => setRoom(item)}
              className="mb-3 min-h-28 rounded-2xl border p-4"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <View className="flex-row justify-between">
                <Text className="font-black" style={{ color: c.text }}>
                  {item.title}
                </Text>
                <Text style={{ color: c.text }}>Shared session</Text>
              </View>
              <Text className="mt-2" style={{ color: c.secondaryText }}>
                Leaving early ends the shared session for everyone.
              </Text>
              <Text className="mt-2" style={{ color: c.text }}>
                {item.members.length} participants
              </Text>
            </Pressable>
          )}
        />
      </View>
    );
  const active =
      !!room.commitment && ["active", "break"].includes(room.commitment.status),
    terminal = !!room.commitment && ["completed", "ended_early", "cancelled", "terminated"].includes(room.commitment.status);
  const readyCount = room.members.filter(member => member.ready).length;
  const allReady = room.members.length > 0 && readyCount === room.members.length;
  if (terminal) lifecycleLog('authoritative_terminal_snapshot', room, 'render terminal summary');
  const activeRemainingMs = room.commitment?.expectedEndAt ? getSharedSessionRemainingMs({ expectedEndAt: room.commitment.expectedEndAt, pausedAt: room.commitment.pausedAt, now }) : 0;
  const activeRemainingSeconds = Math.max(0, Math.ceil(activeRemainingMs / 1000));
  const totalSeconds = Math.max(1, (room.commitment?.durationMinutes ?? 1) * 60);
  const activeProgress = Math.max(0, Math.min(1, 1 - activeRemainingSeconds / totalSeconds));
  return (
    <SafeAreaView edges={["top", "bottom", "left", "right"]} className="flex-1" style={{ backgroundColor: active ? "#0f172a" : c.background }}>
      {!active && <View className="border-b p-4" style={{ borderColor: c.border }}>
        <PageHeader
          title={room.title}
          subtitle={
            room.mode === "commitment"
              ? "🔒 Leaving early ends the session for everyone"
              : "Join or leave at any time"
          }
          onBack={() => (active ? setLeaveOpen(true) : setRoom(null))}
        />
      </View>}
      <ScrollView className="flex-1" contentContainerStyle={{ padding: active ? 0 : 16, paddingBottom: active ? 24 : 80, flexGrow: 1 }}>
        {notice && !active ? (
          <Text
            accessibilityLiveRegion="polite"
            className="mb-3 rounded-xl p-3"
            style={{ color: c.text, backgroundColor: c.card }}
          >
            {notice}
          </Text>
        ) : null}
        {terminal ? (
          <View
            className="rounded-2xl border p-5"
            style={{ borderColor: c.border }}
          >
            <Text
              className="text-center text-xl font-black"
              style={{ color: c.text }}
            >
              {room.commitment?.status === "completed" ? "Shared Focus Session Complete" : "Session ended early"}
            </Text>
            <Text
              className="mt-3 text-center"
              style={{ color: c.secondaryText }}
            >
              {room.commitment?.status === "completed"
                ? "Great work — everyone completed the session."
                : room.commitment?.endReason === "owner_ended_session"
                  ? "The session was ended by the owner."
                  : (() => {
                      const actor = room.members.find((member) => member.userId === room.commitment?.endedByUserId);
                      return actor && !actor.anonymous ? `The session ended because ${actor.displayName} left.` : "The session ended because a participant left.";
                    })()}
            </Text>
            {room.commitment?.goalLabel ? <Text className="mt-4 text-center font-bold" style={{ color: c.text }}>Goal: {room.commitment.goalLabel}</Text> : null}
            <View className="mt-5 gap-2">
              <Text style={{ color: c.text }}>Planned duration: {room.commitment?.durationMinutes} minutes</Text>
              <Text style={{ color: c.text }}>Actual shared focus: {Math.max(0, Math.floor((new Date(room.commitment?.endedAt ?? Date.now()).getTime() - new Date(room.commitment?.startedAt ?? room.commitment?.endedAt ?? Date.now()).getTime()) / 60000))} minutes</Text>
              <Text style={{ color: c.text }}>Participants: {room.members.length}</Text>
              {room.commitment?.startedAt ? <Text style={{ color: c.text }}>Start time: {new Date(room.commitment.startedAt).toLocaleTimeString()}</Text> : null}
              {room.commitment?.endedAt ? <Text style={{ color: c.text }}>End time: {new Date(room.commitment.endedAt).toLocaleTimeString()}</Text> : null}
              {room.commitment?.status !== "completed" ? <Text style={{ color: c.text }}>Remaining at termination: {Math.max(0, room.commitment!.durationMinutes - Math.floor((new Date(room.commitment!.endedAt ?? Date.now()).getTime() - new Date(room.commitment!.startedAt ?? room.commitment!.endedAt ?? Date.now()).getTime()) / 60000))} minutes</Text> : null}
              {room.commitment?.status !== "completed" ? <Text style={{ color: c.text }}>End reason: {(room.commitment!.endReason ?? "cancelled before start").replaceAll("_", " ")}</Text> : null}
            </View>
            <Text className="mt-5 font-black" style={{ color: c.text }}>Participant focus</Text>
            {room.members.map((member) => <Text key={member.userId} className="mt-2" style={{ color: c.text }}>{member.displayName}: {member.focusedDurationMinutes ?? 0} minutes</Text>)}
            <View className="mt-6"><PrimaryButton fullWidth onPress={onBack}>Return to Shared Focus Sessions</PrimaryButton></View>
          </View>
        ) : active ? (
          <View testID="shared-focus-active" className="min-h-full flex-1 items-center justify-center px-5 py-8" style={{ backgroundColor: room.commitment?.pausedAt ? "#0f172a" : "#0f172a" }}>
            <Text className="text-sm font-black tracking-widest" style={{ color: room.commitment?.pausedAt ? "#93c5fd" : "#fde68a" }}>SHARED FOCUS SESSION</Text>
            {room.commitment?.goalLabel ? <Text className="mt-3 text-center text-2xl font-black" style={{ color: c.text }}>{room.commitment.goalLabel}</Text> : null}
            <View className="relative mt-8 size-72 items-center justify-center"><View className="absolute size-56 rounded-full" style={{ backgroundColor: room.commitment?.pausedAt ? "#3b82f6" : "#fbbf24", opacity: 0.13, shadowColor: room.commitment?.pausedAt ? "#60a5fa" : "#fbbf24", shadowOpacity: 0.55, shadowRadius: 32 }} /><Svg width="100%" height="100%" viewBox="0 0 100 100" style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}><Circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2" /><Circle cx="50" cy="50" r="45" fill="none" stroke={room.commitment?.pausedAt ? "#60a5fa" : "#fbbf24"} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${activeProgress * 283} 283`} /></Svg><Text className="text-6xl font-black" style={{ color: "#fff" }}>{`${Math.floor(activeRemainingSeconds / 60).toString().padStart(2, "0")}:${(activeRemainingSeconds % 60).toString().padStart(2, "0")}`}</Text><Text className="mt-2 text-xs font-bold uppercase tracking-widest" style={{ color: room.commitment?.pausedAt ? "#93c5fd" : "#fde68a" }}>{room.commitment?.pausedAt ? "Paused for everyone" : `Focusing together · ${Math.round(activeProgress * 100)}%`}</Text></View>
            <Text className="mt-3" style={{ color: c.secondaryText }}>{room.commitment?.durationMinutes} minutes · {room.members.length} participants</Text>
            <View className="mt-6 w-full gap-2">{room.members.map((member) => <View key={member.userId} className="flex-row items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: c.border }}><Text style={{ color: c.text }}>{member.displayName}</Text><Text style={{ color: c.secondaryText }}>{member.state === "offline" ? "Reconnecting…" : "Focusing"}</Text></View>)}</View>
            <View className="mt-5 w-full rounded-2xl border p-3" style={{ borderColor: c.border }}><SecondaryButton fullWidth onPress={() => setSoundsOpen(true)}>🔊 {focusAudio.activeSound?.name ?? "Focus sounds"}</SecondaryButton></View>
            <Text className="mt-5 text-center" style={{ color: c.secondaryText }}>Leaving, finishing, or cancelling ends this shared session for everyone.</Text>
             <View className="mt-5"><PrimaryButton onPress={() => setLeaveOpen(true)}>Finish for everyone</PrimaryButton></View>
            {controlError ? <Text className="mt-3 text-center" style={{ color: c.error }}>{controlError}</Text> : null}
            <View className="mt-3 flex-row gap-2"><SecondaryButton disabled={controlBusy} onPress={() => room.commitment?.pausedAt ? void sharedControl(() => resumeCommitment(accessToken, room.commitment!.id), room.commitment?.status === "active" && Boolean(room.commitment?.pausedAt)) : setPauseOpen(true)}>{room.commitment?.pausedAt ? "Resume" : "Pause"}</SecondaryButton>{room.ownerUserId === room.currentUserId ? <SecondaryButton disabled={controlBusy || Boolean(room.commitment?.pausedAt)} onPress={() => setAddTimeOpen(true)}>Add time</SecondaryButton> : null}</View>
          </View>
        ) : (
          <>
            <View
              className="items-center rounded-2xl border p-5"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <Text className="text-5xl font-black" style={{ color: c.text }}>
                {active ? "In focus" : "Ready"}
              </Text>
              {room.mode === "commitment" && room.commitment && !active ? (
                <View
                  className="mt-5 w-full rounded-2xl border-2 p-4"
                  style={{ borderColor: c.accent }}
                >
                  <Text className="font-black" style={{ color: c.text }}>
                    Commitment agreement
                  </Text>
                  <Text className="my-3" style={{ color: c.text }}>
                    {AGREEMENT}
                  </Text>
                  <Text style={{ color: c.secondaryText }}>
                    {room.commitment.durationMinutes} minutes ·{" "}
                    {room.commitment.reconnectGraceSeconds}s reconnect grace
                  </Text>
                  <View className="my-3 min-h-12 flex-row items-center justify-between">
                    <Text style={{ color: c.text }}>I explicitly accept</Text>
                    <Switch
                      accessibilityLabel="Accept commitment agreement"
                      value={accepted}
                      onValueChange={setAccepted}
                    />
                  </View>
                  <PrimaryButton
                    disabled={!accepted}
                    fullWidth
                    onPress={() =>
                      void acceptCommitment(accessToken, room.commitment!.id)
                        .then(() =>
                          readyCommitment(accessToken, room.commitment!.id),
                        )
                        .then(setRoom)
                    }
                  >
                    {room.members.find(
                      (member) => member.userId === room.currentUserId,
                    )?.ready
                      ? "Ready ✓"
                      : "I'm Ready"}
                  </PrimaryButton>
                  {room.ownerUserId === room.currentUserId ? <PrimaryButton disabled={!allReady} fullWidth onPress={() => void startCommitment(accessToken, room.commitment!.id).then(setRoom).catch((error: unknown) => setControlError(error instanceof Error ? error.message : "Unable to start session."))}>Start Session</PrimaryButton> : null}
                </View>
              ) : room.mode === "commitment" && !room.commitment ? (
                <View className="mt-4">
                  <PrimaryButton
                    onPress={() =>
                      void makeCommitment(accessToken, room.id).then(refresh)
                    }
                  >
                    Set Up Commitment Session
                  </PrimaryButton>
                </View>
              ) : null}
            </View>
            {room.canManageInvitations ? (
              <View
                className="mt-5 rounded-2xl border p-4"
                style={{ borderColor: c.border, backgroundColor: c.card }}
              >
                <View className="flex-row items-center justify-between">
                  <Text
                    className="text-lg font-black"
                    style={{ color: c.text }}
                  >
                    Pending Invitations
                  </Text>
                  <PrimaryButton
                    size="sm"
                    onPress={() => {
                      setInviteOpen(true);
                      setInviteError("");
                    }}
                  >
                    Create invite
                  </PrimaryButton>
                </View>
                {managedInvites.length ? (
                  managedInvites.map((invite) => (
                    <View
                      key={invite.id}
                      className="mt-3 rounded-xl border p-3"
                      style={{ borderColor: c.border }}
                    >
                      <Text className="font-bold" style={{ color: c.text }}>
                        {invite.label ?? "Invite link"}
                      </Text>
                      <Text style={{ color: c.secondaryText }}>
                        {invite.status} · expires{" "}
                        {new Date(invite.expiresAt).toLocaleString()}
                      </Text>
                      {invite.status === "pending" ? (
                        <SecondaryButton
                          onPress={() =>
                            void revokeInvitation(accessToken, invite.id).then(
                              refresh,
                            )
                          }
                        >
                          Revoke
                        </SecondaryButton>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <Text className="mt-3" style={{ color: c.secondaryText }}>
                    No invitations yet.
                  </Text>
                )}
              </View>
            ) : null}
            <Text
              className="mb-3 mt-6 text-lg font-black"
              style={{ color: c.text }}
            >
              Participants
            </Text>
            {room.members.map((m) => (
              <View
                key={m.userId}
                className="mb-2 min-h-12 flex-row items-center justify-between rounded-xl border px-4"
                style={{ borderColor: c.border }}
              >
                <Text style={{ color: c.text }}>{m.displayName}</Text>
                <Text style={{ color: c.secondaryText }}>
                  {m.ready
                    ? "Ready"
                    : m.state
                        .replaceAll("_", " ")
                        .replace(/^./, (value) => value.toUpperCase())}
                </Text>
              </View>
            ))}
            {!room.isCurrentUserMember ? (
              <View className="mt-4">
                <SecondaryButton
                  fullWidth
                  onPress={() =>
                    void joinRoom(accessToken, room.id).then(setRoom)
                  }
                >
                  Join Session
                </SecondaryButton>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
      <View className="absolute bottom-4 left-4 right-4">
        <PrimaryButton
          fullWidth
          onPress={() => (active ? setLeaveOpen(true) : setRoom(null))}
        >
          Leave session
        </PrimaryButton>
      </View>
      <Modal
        visible={pauseOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPauseOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60"><View className="rounded-t-3xl p-6" style={{ backgroundColor: c.card }}><Text className="text-xl font-black" style={{ color: c.text }}>Pause this shared session for everyone?</Text><View className="mt-5 gap-3"><PrimaryButton disabled={controlBusy} fullWidth onPress={() => { setPauseOpen(false); if (room.commitment) void sharedControl(() => pauseCommitment(accessToken, room.commitment!.id), room.commitment.status === "active" && !room.commitment.pausedAt); }}>Pause for everyone</PrimaryButton><SecondaryButton fullWidth onPress={() => setPauseOpen(false)}>Keep focusing</SecondaryButton></View></View></View>
      </Modal>
      <Modal
        visible={addTimeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddTimeOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60"><View className="rounded-t-3xl p-6" style={{ backgroundColor: c.card }}><Text className="text-xl font-black" style={{ color: c.text }}>Add time to this session for everyone?</Text><View className="mt-5 gap-3">{[5, 10, 15].map((minutes) => <PrimaryButton key={minutes} disabled={controlBusy} fullWidth onPress={() => { setAddTimeOpen(false); if (room.commitment) void sharedControl(() => extendCommitment(accessToken, room.commitment!.id, minutes)); }}>+{minutes} minutes</PrimaryButton>)}<SecondaryButton fullWidth onPress={() => setAddTimeOpen(false)}>Cancel</SecondaryButton></View></View></View>
      </Modal>
      <Modal
        visible={inviteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !inviteLoading && setInviteOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View
            className="rounded-t-3xl p-6"
            style={{ backgroundColor: c.card }}
          >
            <Text
              accessibilityRole="header"
              className="text-2xl font-black"
              style={{ color: c.text }}
            >
              Invite someone to this Shared Focus Session
            </Text>
            <View className="mt-4 flex-row gap-2">
              <SecondaryButton onPress={() => setInviteType("email")}>
                Invite by email
              </SecondaryButton>
              <SecondaryButton onPress={() => setInviteType("link")}>
                Create invite link
              </SecondaryButton>
            </View>
            {inviteType === "email" ? (
              <TextInput
                autoFocus
                accessibilityLabel="Email address"
                keyboardType="email-address"
                autoCapitalize="none"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder="name@example.com"
                placeholderTextColor={c.secondaryText}
                className="mt-4 min-h-12 rounded-xl border px-4"
                style={{ color: c.text, borderColor: c.border }}
              />
            ) : (
              <Text
                className="mt-4 rounded-xl p-3"
                style={{
                  color: c.secondaryText,
                  backgroundColor: c.background,
                }}
              >
                Create a separate secure link. Empty email never creates a link.
              </Text>
            )}
            {inviteError ? (
              <Text
                accessibilityRole="alert"
                className="mt-3"
                style={{ color: c.error }}
              >
                {inviteError}
              </Text>
            ) : null}
            <View className="mt-5 gap-3">
              <PrimaryButton
                disabled={
                  inviteLoading ||
                  (inviteType === "email" && !inviteEmail.trim())
                }
                fullWidth
                onPress={() => void sendInvite()}
              >
                {inviteLoading
                  ? "Sending…"
                  : inviteType === "email"
                    ? "Send Invite"
                    : "Create Invite Link"}
              </PrimaryButton>
              <SecondaryButton fullWidth onPress={() => setInviteOpen(false)}>
                Cancel
              </SecondaryButton>
            </View>
          </View>
        </View>
      </Modal>
      <Modal
        visible={leaveOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLeaveOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60">
          <View
            className="rounded-t-3xl p-6"
            style={{ backgroundColor: c.card }}
          >
            <Text
              accessibilityRole="header"
              className="text-2xl font-black"
              style={{ color: c.text }}
            >
              End the session for everyone?
            </Text>
            <Text className="my-4" style={{ color: c.text }}>
              You agreed to stay until the shared session ends. Leaving now will
              end the Commitment Session for all participants.
            </Text>
            <Text style={{ color: c.secondaryText }}>
              Affected participants: {room.members.length}
            </Text>
            <View className="mt-5 gap-3">
              <SecondaryButton fullWidth onPress={() => setLeaveOpen(false)}>
                Stay in Session
              </SecondaryButton>
              <PrimaryButton
                fullWidth
                onPress={() => {
                  lifecycleLog('explicit_finish', room, 'leave confirmation');
                  void terminateRoom(accessToken, room.id, commandId())
                    .then(() => {
                      setLeaveOpen(false);
                      onBack();
                    })
                    .catch((e) =>
                      setNotice(
                        e instanceof Error
                          ? e.message
                          : "Could not end session.",
                      ),
                    );
                }}
              >
                End for Everyone
              </PrimaryButton>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={soundsOpen} animationType="slide" onRequestClose={() => setSoundsOpen(false)}><View className="flex-1 p-5" style={{ backgroundColor: c.background }}><PageHeader title="FOCUS SOUNDS" subtitle={focusAudio.activeSound?.name ?? "Choose an ambient sound"} onBack={() => setSoundsOpen(false)} /><ScrollView contentContainerStyle={{ paddingBottom: 100 }}>{FOCUS_SOUNDS.map(sound => <Pressable key={sound.id} onPress={() => focusAudio.isPlaying && focusAudio.activeSound?.id === sound.id ? focusAudio.pause() : void focusAudio.play(sound)} className="mt-3 rounded-2xl border p-4" style={{ borderColor: focusAudio.activeSound?.id === sound.id ? c.accent : c.border }}><Text className="font-black" style={{ color: c.text }}>{sound.icon} {sound.name}</Text><Text style={{ color: c.secondaryText }}>{sound.category}</Text></Pressable>)}</ScrollView><View className="absolute bottom-0 left-0 right-0 flex-row gap-2 border-t p-4" style={{ borderColor: c.border, backgroundColor: c.background }}><SecondaryButton onPress={focusAudio.toggleMuted}>{focusAudio.muted ? "Unmute" : "Mute"}</SecondaryButton><SecondaryButton onPress={focusAudio.stop}>Stop</SecondaryButton><PrimaryButton onPress={() => setSoundsOpen(false)}>Close</PrimaryButton></View></View></Modal>
    </SafeAreaView>
  );
}
