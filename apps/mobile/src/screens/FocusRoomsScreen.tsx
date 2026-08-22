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
import {
  DangerButton,
  OutlineButton,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
} from "../components/layout";
import {
  acceptCommitment,
  joinRoomByCode,
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
import { useLanguage } from "../i18n/LanguageContext";
import { useFocusAudio } from "../lib/useFocusAudio";
import { getSharedSessionRemainingMs } from "../lib/sharedSessionTiming";
import { ActiveTimer, FocusSoundsSheet, UtilityButton } from "./FocusSessionScreen";
const AGREEMENT_KEY = "sharedFocus.acceptAgreement";
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
  const { t, language } = useLanguage();
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
  const [joinOpen, setJoinOpen] = useState(false), [joinCode, setJoinCode] = useState(""), [joinError, setJoinError] = useState(""), [joining, setJoining] = useState(false);
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
        setInvitationLoadError(t("sharedFocus.actionFailed"));
      }
    }
  };
  const sendInvite = async () => {
    const normalized = inviteEmail.trim().toLowerCase();
    setInviteError("");
    if (inviteType === "email" && !/^\S+@\S+\.\S+$/.test(normalized)) {
      setInviteError(t("sharedFocus.invalidEmail"));
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
            ? t("sharedFocus.invitationEmailFailed")
            : t("sharedFocus.invitationSentTo", { email: normalized })
          : t("sharedFocus.inviteLinkCreated"),
      );
      setInviteOpen(false);
      setInviteEmail("");
      await refresh();
    } catch (cause) {
      console.error("[SharedFocus] invitation creation failed", cause);
      setInviteError(t("sharedFocus.invitationFailed"));
    } finally {
      setInviteLoading(false);
    }
  };
  const sharedControl = async (action: () => Promise<FocusRoom>, allowed = true) => { if (!allowed || isTerminalStatus(room?.commitment?.status)) { void refresh().catch(() => undefined); return; } setControlBusy(true); setControlError(""); try { setRoom(await action()); } catch (cause) { if (cause instanceof Error && cause.message.includes("This shared session has ended")) terminalSync.current = true; console.error("[SharedFocus] control failed", cause); setControlError(t("sharedFocus.actionFailed")); void refresh().catch(() => undefined); } finally { setControlBusy(false); } };
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
          title={t("sharedFocus.sessions")}
          subtitle={t("sharedFocus.subtitle")}
          onBack={onBack}
        />
        <View className="mb-4 gap-3">
          <SecondaryButton fullWidth onPress={() => { setJoinOpen(true); setJoinError(""); }}>
            {t("sharedFocus.joinWithCode")}
          </SecondaryButton>
          <TextInput
            accessibilityLabel={t("sharedFocus.roomTitle")}
            value={title}
            onChangeText={setTitle}
            placeholder={t("sharedFocus.roomTitle")}
            placeholderTextColor={c.secondaryText}
            className="min-h-12 rounded-xl border px-4"
            style={{ borderColor: c.border, color: c.text }}
          />
          <Text className="font-bold" style={{ color: c.text }}>{t("sharedFocus.duration")}</Text>
          <View className="flex-row gap-2">
            {[25, 50, 90].map((minutes) => (
              <Pressable key={minutes} accessibilityRole="button" accessibilityState={{ selected: durationMinutes === minutes }} onPress={() => setDurationMinutes(minutes)} className="min-h-12 flex-1 items-center justify-center rounded-xl border" style={{ borderColor: durationMinutes === minutes ? c.accent : c.border, backgroundColor: durationMinutes === minutes ? c.card : "transparent" }}>
                <Text className="font-bold" style={{ color: c.text }}>{t("sharedFocus.minutes", { count: minutes })}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput accessibilityLabel={t("sharedFocus.customDuration")} keyboardType="number-pad" value={String(durationMinutes)} onChangeText={(value) => setDurationMinutes(Number(value.replace(/\D/g, "")))} placeholder={t("sharedFocus.customDuration")} placeholderTextColor={c.secondaryText} className="min-h-12 rounded-xl border px-4" style={{ borderColor: c.border, color: c.text }} />
          <TextInput accessibilityLabel={t("sharedFocus.goalOptional")} value={goalLabel} onChangeText={setGoalLabel} maxLength={160} placeholder={t("sharedFocus.goalOptional")} placeholderTextColor={c.secondaryText} className="min-h-12 rounded-xl border px-4" style={{ borderColor: c.border, color: c.text }} />
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
            {t("sharedFocus.createSession")}
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
                {t("sharedFocus.sessions")}
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
                {t("sharedFocus.reject")}
              </SecondaryButton>
              <PrimaryButton
                onPress={() =>
                  void decideInvitation(accessToken, invitation.id, "accept")
                    .then(() => roomDetails(accessToken, invitation.roomId))
                    .then(setRoom)
                }
              >
                {t("sharedFocus.accept")}
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
                <Text style={{ color: c.text }}>{t("sharedFocus.sharedFocus")}</Text>
              </View>
              <Text className="mt-2" style={{ color: c.secondaryText }}>
                {t("sharedFocus.collectiveEndHelp")}
              </Text>
              <Text className="mt-2" style={{ color: c.text }}>
                {t("sharedFocus.participantsCount", { count: item.members.length })}
              </Text>
            </Pressable>
          )}
        />
        <Modal visible={joinOpen} transparent animationType="slide" onRequestClose={() => setJoinOpen(false)}>
          <View className="flex-1 justify-end bg-black/60">
            <View className="rounded-t-3xl border p-6" style={{ backgroundColor: c.surfaceElevated, borderColor: c.border }}>
              <Text className="text-xl font-black" style={{ color: c.text }}>{t("sharedFocus.joinTitle")}</Text>
              <Text className="mt-2" style={{ color: c.secondaryText }}>{t("sharedFocus.joinDescription")}</Text>
              <TextInput
                accessibilityLabel={t("sharedFocus.sessionCode")}
                autoCapitalize="characters"
                autoCorrect={false}
                value={joinCode}
                onChangeText={(value) => setJoinCode(value.toUpperCase().replace(/\s/g, ""))}
              placeholder="BEE-7K4M"
                placeholderTextColor={c.secondaryText}
                className="mt-4 min-h-12 rounded-xl border px-4 font-mono"
                style={{ borderColor: c.border, color: c.text, writingDirection: "ltr" }}
              />
              {joinError ? <Text accessibilityRole="alert" className="mt-3" style={{ color: c.error }}>{joinError}</Text> : null}
              <View className="mt-5 flex-row gap-3">
                <View className="flex-1"><SecondaryButton fullWidth disabled={joining} onPress={() => setJoinOpen(false)}>{t('common.cancel')}</SecondaryButton></View>
                <View className="flex-1"><PrimaryButton fullWidth disabled={joining || !joinCode.trim()} onPress={() => { setJoining(true); setJoinError(""); void joinRoomByCode(accessToken, joinCode).then((joined) => { setJoinOpen(false); setJoinCode(""); setRoom(joined); }).catch(() => setJoinError(t("sharedFocus.joinFailed"))).finally(() => setJoining(false)); }}>{t("sharedFocus.joinSession")}</PrimaryButton></View>
              </View>
            </View>
          </View>
        </Modal>
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
    <SafeAreaView edges={["top", "bottom", "left", "right"]} className="flex-1" style={{ backgroundColor: c.background }}>
      {!active && <View className="border-b p-4" style={{ borderColor: c.border }}>
        <PageHeader
          title={room.title}
            subtitle={t("sharedFocus.collectiveEndHelp")}
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
              {room.commitment?.status === "completed" ? t("sharedFocus.complete") : t("sharedFocus.sessionUnavailable")}
            </Text>
            <Text
              className="mt-3 text-center"
              style={{ color: c.secondaryText }}
            >
              {room.commitment?.status === "completed" ? t("sharedFocus.complete") : t("sharedFocus.sessionUnavailable")}
            </Text>
            {room.commitment?.goalLabel ? <Text className="mt-4 text-center font-bold" style={{ color: c.text }}>{t("sharedFocus.goal", { goal: room.commitment.goalLabel })}</Text> : null}
            <View className="mt-5 gap-2">
              <Text style={{ color: c.text }}>{t("sharedFocus.plannedDuration")}: {t("sharedFocus.minutes", { count: room.commitment?.durationMinutes ?? 0 })}</Text>
              <Text style={{ color: c.text }}>{t("sharedFocus.actualFocus")}: {t("sharedFocus.minutes", { count: Math.max(0, Math.floor((new Date(room.commitment?.endedAt ?? Date.now()).getTime() - new Date(room.commitment?.startedAt ?? room.commitment?.endedAt ?? Date.now()).getTime()) / 60000)) })}</Text>
              <Text style={{ color: c.text }}>{t("sharedFocus.participants")}: {room.members.length}</Text>
              {room.commitment?.startedAt ? <Text style={{ color: c.text }}>{t("sharedFocus.startTime")}: {new Date(room.commitment.startedAt).toLocaleTimeString()}</Text> : null}
              {room.commitment?.endedAt ? <Text style={{ color: c.text }}>{t("sharedFocus.endTime")}: {new Date(room.commitment.endedAt).toLocaleTimeString()}</Text> : null}
              {room.commitment?.status !== "completed" ? <Text style={{ color: c.text }}>{t("sharedFocus.actualFocus")}: {t("sharedFocus.minutes", { count: Math.max(0, room.commitment!.durationMinutes - Math.floor((new Date(room.commitment!.endedAt ?? Date.now()).getTime() - new Date(room.commitment!.startedAt ?? room.commitment!.endedAt ?? Date.now()).getTime()) / 60000)) })}</Text> : null}
              {room.commitment?.status !== "completed" ? <Text style={{ color: c.text }}>{t("sharedFocus.sessionUnavailable")}</Text> : null}
            </View>
            <Text className="mt-5 font-black" style={{ color: c.text }}>{t("sharedFocus.participants")}</Text>
            {room.members.map((member) => <Text key={member.userId} className="mt-2" style={{ color: c.text }}>{member.displayName}: {t("sharedFocus.minutes", { count: member.focusedDurationMinutes ?? 0 })}</Text>)}
            <View className="mt-6"><PrimaryButton fullWidth onPress={onBack}>{t("sharedFocus.returnToSessions")}</PrimaryButton></View>
          </View>
        ) : active ? (
          <View testID="shared-focus-active" className="min-h-full flex-1 items-center justify-between px-6 pb-8 pt-14" style={{ backgroundColor: c.background }}>
            <View className="w-full items-center">
              <ActiveTimer theme={theme} title={room.commitment?.goalLabel ?? room.title} typeLabel={t("sharedFocus.participantsCount", { count: room.members.length })} subtitle={null} priority={null} category={null} center={`${Math.floor(activeRemainingSeconds / 60).toString().padStart(2, "0")}:${(activeRemainingSeconds % 60).toString().padStart(2, "0")}`} fraction={activeProgress} status={room.commitment?.pausedAt ? t("sharedFocus.pausedForEveryone") : t("focusUi.percentComplete", { percent: Math.round(activeProgress * 100) })} />
              <View className="mt-6 w-full gap-2">
                {room.commitment?.pausedAt ? <PrimaryButton fullWidth disabled={controlBusy} onPress={() => void sharedControl(() => resumeCommitment(accessToken, room.commitment!.id), room.commitment?.status === "active")}>{t("sharedFocus.resume")}</PrimaryButton> : <SecondaryButton fullWidth disabled={controlBusy} onPress={() => setPauseOpen(true)}>{t("sharedFocus.pause")}</SecondaryButton>}
                <View className="flex-row gap-2"><View className="flex-1"><PrimaryButton fullWidth disabled={controlBusy} onPress={() => setLeaveOpen(true)}>{t("sharedFocus.finish")}</PrimaryButton></View><View className="flex-1"><DangerButton fullWidth disabled={controlBusy} onPress={() => setLeaveOpen(true)}>{t("common.cancel")}</DangerButton></View></View>
                {room.ownerUserId === room.currentUserId ? <OutlineButton fullWidth disabled={controlBusy || Boolean(room.commitment?.pausedAt)} onPress={() => setAddTimeOpen(true)}>{t("sharedFocus.addTime")}</OutlineButton> : null}
              </View>
              {controlError ? <Text className="mt-3 text-center" style={{ color: c.error }}>{controlError}</Text> : null}
            </View>
            <View className="flex-row flex-wrap items-center justify-center gap-1"><UtilityButton theme={theme} label={t("sharedFocus.whiteNoise")} onPress={() => setSoundsOpen(true)} /><UtilityButton theme={theme} label={t("sharedFocus.ambient")} onPress={() => setSoundsOpen(true)} />{focusAudio.activeSound && focusAudio.isPlaying ? <Text className="px-2 text-xs font-bold" style={{ color: c.secondaryText }}>{focusAudio.activeSound.name}</Text> : null}<UtilityButton theme={theme} label={t("sharedFocus.exitFocus")} accent onPress={() => setLeaveOpen(true)} /></View>
          </View>
        ) : (
          <>
            <View
              className="items-center rounded-2xl border p-5"
              style={{ borderColor: c.border, backgroundColor: c.card }}
            >
              <Text className="text-5xl font-black" style={{ color: c.text }}>
                {active ? t("sharedFocus.sharedFocus") : t("sharedFocus.ready")}
              </Text>
              {room.mode === "commitment" && room.commitment && !active ? (
                <View
                  className="mt-5 w-full rounded-2xl border-2 p-4"
                  style={{ borderColor: c.accent }}
                >
                  <Text className="font-black" style={{ color: c.text }}>
                    {t("sharedFocus.commitmentAgreement")}
                  </Text>
                  <Text className="my-3" style={{ color: c.text }}>
                    {t(AGREEMENT_KEY)}
                  </Text>
                  <Text style={{ color: c.secondaryText }}>
                    {t("sharedFocus.minutes", { count: room.commitment.durationMinutes })} · {t("sharedFocus.minutes", { count: room.commitment.reconnectGraceSeconds })}
                  </Text>
                  <View className="my-3 min-h-12 flex-row items-center justify-between">
                    <Text style={{ color: c.text }}>{t("sharedFocus.acceptAgreement")}</Text>
                    <Switch
                      accessibilityLabel={t("sharedFocus.acceptAgreement")}
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
                      ? `${t("sharedFocus.ready")} ✓`
                      : t("sharedFocus.imReady")}
                  </PrimaryButton>
                  {room.ownerUserId === room.currentUserId ? <PrimaryButton disabled={!allReady} fullWidth onPress={() => void startCommitment(accessToken, room.commitment!.id).then(setRoom).catch(() => setControlError(t("sharedFocus.actionFailed")))}>{t("sharedFocus.startSession")}</PrimaryButton> : null}
                </View>
              ) : room.mode === "commitment" && !room.commitment ? (
                <View className="mt-4">
                  <PrimaryButton
                    onPress={() =>
                      void makeCommitment(accessToken, room.id).then(refresh)
                    }
                  >
                    {t("sharedFocus.createSession")}
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
                    {t("sharedFocus.pendingInvitations")}
                  </Text>
                  <PrimaryButton
                    size="sm"
                    onPress={() => {
                      setInviteOpen(true);
                      setInviteError("");
                    }}
                  >
                    {t("sharedFocus.createInvite")}
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
                        {invite.label ?? t("sharedFocus.createInvite")}
                      </Text>
                      <Text style={{ color: c.secondaryText }}>
                        {t("sharedFocus.pendingInvitations")}
                        {new Date(invite.expiresAt).toLocaleString(language === "ar" ? "ar" : "en")}
                      </Text>
                      {invite.status === "pending" ? (
                        <SecondaryButton
                          onPress={() =>
                            void revokeInvitation(accessToken, invite.id).then(
                              refresh,
                            )
                          }
                        >
                          {t("sharedFocus.revoke")}
                        </SecondaryButton>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <Text className="mt-3" style={{ color: c.secondaryText }}>
                    {t("sharedFocus.noPendingInvitations")}
                  </Text>
                )}
              </View>
            ) : null}
            <Text
              className="mb-3 mt-6 text-lg font-black"
              style={{ color: c.text }}
            >
              {t("sharedFocus.participants")}
            </Text>
            {room.members.map((m) => (
              <View
                key={m.userId}
                className="mb-2 flex-row items-center justify-between rounded-xl border px-3 py-2"
                style={{ borderColor: c.border, backgroundColor: c.card }}
              >
                <View className="flex-row items-center gap-3"><View className="h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: c.accentSoft }}><Text className="font-black" style={{ color: c.accentInk }}>{m.displayName.trim().slice(0, 1).toUpperCase()}</Text></View><View><Text className="font-bold" style={{ color: c.text }}>{m.displayName}{m.userId === room.currentUserId ? ` · ${t("sharedFocus.you")}` : ""}</Text><Text className="text-xs" style={{ color: c.secondaryText }}>{m.userId === room.ownerUserId ? t("sharedFocus.owner") : t("sharedFocus.participant")}</Text></View></View>
                <Text className="text-xs font-bold" style={{ color: m.ready ? c.success : c.secondaryText }}>{m.ready ? t("sharedFocus.ready") : t("sharedFocus.preparing")}</Text>
              </View>
            ))}
            {!room.isCurrentUserMember ? <Text className="mt-4" style={{ color: c.error }}>{t("sharedFocus.sessionUnavailable")}</Text> : null}
          </>
        )}
      </ScrollView>
      {!terminal && !active ? <View className="absolute bottom-4 left-4 right-4">
        <PrimaryButton
          fullWidth
          onPress={() => (active ? setLeaveOpen(true) : setRoom(null))}
        >
          {t("sharedFocus.leave")}
        </PrimaryButton>
      </View> : null}
      <Modal
        visible={pauseOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPauseOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60"><View className="rounded-t-3xl p-6" style={{ backgroundColor: c.card }}><Text className="text-xl font-black" style={{ color: c.text }}>{t("sharedFocus.pauseEveryoneTitle")}</Text><View className="mt-5 gap-3"><PrimaryButton disabled={controlBusy} fullWidth onPress={() => { setPauseOpen(false); if (room.commitment) void sharedControl(() => pauseCommitment(accessToken, room.commitment!.id), room.commitment.status === "active" && !room.commitment.pausedAt); }}>{t("sharedFocus.pauseEveryone")}</PrimaryButton><SecondaryButton fullWidth onPress={() => setPauseOpen(false)}>{t("sharedFocus.keepFocusing")}</SecondaryButton></View></View></View>
      </Modal>
      <Modal
        visible={addTimeOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAddTimeOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/60"><View className="rounded-t-3xl p-6" style={{ backgroundColor: c.card }}><Text className="text-xl font-black" style={{ color: c.text }}>{t("sharedFocus.addTimeTitle")}</Text><View className="mt-5 gap-3">{[5, 10, 15].map((minutes) => <PrimaryButton key={minutes} disabled={controlBusy} fullWidth onPress={() => { setAddTimeOpen(false); if (room.commitment) void sharedControl(() => extendCommitment(accessToken, room.commitment!.id, minutes)); }}>+{t("sharedFocus.minutes", { count: minutes })}</PrimaryButton>)}<SecondaryButton fullWidth onPress={() => setAddTimeOpen(false)}>{t("common.cancel")}</SecondaryButton></View></View></View>
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
              {t("sharedFocus.sessions")}
            </Text>
            <View className="mt-4 flex-row gap-2">
              <SecondaryButton onPress={() => setInviteType("email")}>
                {t("sharedFocus.joinWithCode")}
              </SecondaryButton>
              <SecondaryButton onPress={() => setInviteType("link")}>
                {t("sharedFocus.createInvite")}
              </SecondaryButton>
            </View>
            {inviteType === "email" ? (
              <TextInput
                autoFocus
                accessibilityLabel={t("auth.emailAddress")}
                keyboardType="email-address"
                autoCapitalize="none"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                placeholder={t("auth.emailPlaceholder")}
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
                {t("sharedFocus.subtitle")}
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
                  ? t("sharedFocus.createInvite")
                  : inviteType === "email"
                    ? t("sharedFocus.createInvite")
                    : t("sharedFocus.createInvite")}
              </PrimaryButton>
              <SecondaryButton fullWidth onPress={() => setInviteOpen(false)}>
                {t('common.cancel')}</SecondaryButton>
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
              {t("sharedFocus.endEveryoneTitle")}
            </Text>
            <Text className="my-4" style={{ color: c.text }}>
              {t("sharedFocus.collectiveEndHelp")}
            </Text>
            <Text style={{ color: c.secondaryText }}>
              {t("sharedFocus.affectedParticipants", { count: room.members.length })}
            </Text>
            <View className="mt-5 gap-3">
              <SecondaryButton fullWidth onPress={() => setLeaveOpen(false)}>
                {t("sharedFocus.stayInSession")}
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
                    .catch((e) => {
                      console.error("[SharedFocus] termination failed", e);
                      setNotice(t("sharedFocus.actionFailed"));
                    });
                }}
              >
                {t("sharedFocus.endForEveryone")}
              </PrimaryButton>
            </View>
          </View>
        </View>
      </Modal>
      <FocusSoundsSheet visible={soundsOpen} theme={theme} activeSound={focusAudio.activeSound} isPlaying={focusAudio.isPlaying} muted={focusAudio.muted} volume={focusAudio.volume} onClose={() => setSoundsOpen(false)} onMuteToggle={focusAudio.toggleMuted} onPause={focusAudio.pause} onPlay={focusAudio.play} onStop={focusAudio.stop} onVolumeChange={focusAudio.setVolume} />
    </SafeAreaView>
  );
}
