import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  acceptCommitment,
  createCommitment,
  createFocusRoom,
  createRoomInvitation,
  decideRoomInvitation,
  getFocusRoom,
  getRoomInvitations,
  joinFocusRoom,
  leaveFocusRoom,
  listFocusRooms,
  listRoomInvitations,
  presence,
  readyCommitment,
  revokeRoomInvitation,
  startCommitment,
  pauseCommitment,
  resumeCommitment,
  extendCommitment,
  subscribeRoomEvents,
  type FocusRoom,
  type ManagedRoomInvitation,
  type RoomInvitation,
} from "../lib/focusRoomsApi";
import { getSharedSessionRemainingMs } from "../lib/sharedSessionTiming";
import { SharedFocusExperienceAdapter } from "../components/focus/SharedFocusExperienceAdapter";
import { useFocusAmbientAudio } from "../lib/useFocusAmbientAudio";
import { FocusSoundsPanel } from "../components/focus/FocusSoundsPanel";

const AGREEMENT =
  "Everyone agrees to stay until the shared session ends. If any participant leaves early, the shared session ends for everyone.";
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
const label = (value: string) =>
  value
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
const TERMINAL_STATUSES = new Set(["completed", "ended_early", "terminated", "cancelled"]);
const isTerminalStatus = (status?: string | null) => Boolean(status && TERMINAL_STATUSES.has(status));
const eventMessage = (event: FocusRoom["events"][number], room: FocusRoom) => {
  const actor =
    room.members.find((member) => member.userId === event.userId)
      ?.displayName ?? "A participant";
  return (
    {
      member_joined: `${actor} joined the room`,
      member_left: `${actor} left the room`,
      member_ready: `${actor} is ready`,
      commitment_started: "The commitment session started",
      member_started_focus: "A participant started focusing",
      member_started_break: "A participant began a break",
      commitment_ended_early: "The shared session ended early",
      commitment_completed: "The commitment session completed",
      member_reconnecting: "A participant is reconnecting",
    }[event.eventType] ?? "Room activity updated"
  );
};

function Dialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
      if (event.key === "Tab" && panel.current) {
        const items = [
          ...panel.current.querySelectorAll<HTMLElement>(
            'button,input,select,[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((item) => !item.hasAttribute("disabled"));
        if (!items.length) return;
        const first = items[0],
          last = items.at(-1)!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    requestAnimationFrame(() =>
      panel.current
        ?.querySelector<HTMLElement>("[autofocus],input,button")
        ?.focus(),
    );
    return () => {
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/65 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby={description ? "dialog-description" : undefined}
        className="w-full max-w-lg rounded-3xl border bg-white p-6 text-slate-950 shadow-2xl dark:bg-slate-900 dark:text-white"
      >
        <h2 id="dialog-title" className="text-2xl font-black">
          {title}
        </h2>
        {description && (
          <p id="dialog-description" className="mt-2 text-sm opacity-75">
            {description}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

export default function FocusRoomsScreen({
  accessToken,
  roomId,
  inviteCode,
  onBack,
  onOpenRoom,
}: {
  accessToken: string;
  roomId?: string;
  inviteCode?: string;
  onBack: () => void;
  onOpenRoom: (id: string) => void;
}) {
  const [rooms, setRooms] = useState<FocusRoom[]>([]),
    [room, setRoom] = useState<FocusRoom | null>(null),
    [incoming, setIncoming] = useState<RoomInvitation[]>([]),
    [managedInvites, setManagedInvites] = useState<ManagedRoomInvitation[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [now, setNow] = useState(Date.now());
  const [createOpen, setCreateOpen] = useState(false),
    [roomTitle, setRoomTitle] = useState(""),
    [durationMinutes, setDurationMinutes] = useState(25),
    [goalLabel, setGoalLabel] = useState(""),
    [inviteOpen, setInviteOpen] = useState(false),
    [inviteType, setInviteType] = useState<"email" | "link">("email"),
    [email, setEmail] = useState(""),
    [expires, setExpires] = useState(24),
    [inviteError, setInviteError] = useState(""),
    [sending, setSending] = useState(false),
    [inviteLink, setInviteLink] = useState(""),
    [leaveOpen, setLeaveOpen] = useState(false),
    [accepted, setAccepted] = useState(false);
  const [controlBusy, setControlBusy] = useState(false), [controlError, setControlError] = useState(""), [pauseConfirm, setPauseConfirm] = useState(false), [addTimeOpen, setAddTimeOpen] = useState(false);
  const [isFocusSoundsOpen, setIsFocusSoundsOpen] = useState(false);
  const ambientAudio = useFocusAmbientAudio();
  const openFocusSounds = useCallback(() => setIsFocusSoundsOpen(true), []);
  const closeFocusSounds = useCallback(() => setIsFocusSoundsOpen(false), []);
  const connectionId = useRef(crypto.randomUUID()),
    seenEvents = useRef(new Set<string>());
  const presenceAttempt = useRef<string | null>(null), connected = useRef(false), terminalSync = useRef(false);
  const terminalRef = useRef(false);
  const previousPausedRef = useRef<boolean | null>(null);
  terminalRef.current = isTerminalStatus(room?.commitment?.status);
  const inviteJoined = useRef(false);
  const refresh = useCallback(async () => {
    try {
      if (roomId) {
        if (inviteCode && !inviteJoined.current) {
          await joinFocusRoom(accessToken, roomId, inviteCode);
          inviteJoined.current = true;
        }
        const next = await getFocusRoom(accessToken, roomId);
        setRoom(next);
        if (next.canManageInvitations)
          setManagedInvites(await getRoomInvitations(accessToken, roomId));
      } else {
        const [nextRooms, nextIncoming] = await Promise.all([
          listFocusRooms(accessToken),
          listRoomInvitations(accessToken),
        ]);
        setRooms(nextRooms);
        setIncoming(nextIncoming);
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to load shared focus sessions.",
      );
    }
  }, [accessToken, roomId, inviteCode, onBack]);
  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => { if (!isTerminalStatus(room?.commitment?.status)) void refresh(); }, 30_000);
    return () => clearInterval(poll);
  }, [refresh, room?.commitment?.status]);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    const status = room?.commitment?.status;
    if (!roomId || !room?.commitment || isTerminalStatus(status)) return;
    const id = connectionId.current,
      controller = new AbortController();
    const key = `${roomId}:${room.commitment.id}`;
    if (presenceAttempt.current !== key) terminalSync.current = false;
    if (presenceAttempt.current === key) return;
    presenceAttempt.current = key;
    let disposed = false;
    const connect = () => {
      if (disposed || connected.current || terminalSync.current) return;
      void presence(accessToken, roomId, id, true).then(() => { if (!disposed) { connected.current = true; void refresh(); } }).catch(async (cause) => {
        if (cause instanceof Error && cause.message.includes("This shared session has ended")) { terminalSync.current = true; await refresh(); }
      });
    };
    // Visibility changes and effect cleanup are transient transport changes,
    // never an intentional leave. Keep the presence lease; reconnect is
    // idempotent when the document becomes visible/online again.
    const visibility = () => { if (!document.hidden) connect(); };
    connect();
    void subscribeRoomEvents(
      accessToken,
      roomId,
      (event) => {
        if (event.id && seenEvents.current.has(event.id)) return;
        if (event.id) seenEvents.current.add(event.id);
        void refresh();
      },
      controller.signal,
    ).catch(() => undefined);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("online", connect);
    return () => {
      disposed = true;
      controller.abort();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("online", connect);
    };
  }, [accessToken, roomId, room?.commitment?.id, room?.commitment?.status, refresh]);
  const remaining = useMemo(
    () =>
      room?.commitment?.expectedEndAt
        ? Math.max(
            0,
            Math.ceil(
              getSharedSessionRemainingMs({ expectedEndAt: room.commitment.expectedEndAt, pausedAt: room.commitment.pausedAt, now }) / 1000,
            ),
          )
        : null,
    [now, room],
  );
  useEffect(() => {
    const paused = Boolean(room?.commitment?.pausedAt);
    const terminal = isTerminalStatus(room?.commitment?.status);
    if (terminal || !room?.commitment) {
      ambientAudio.stop();
      closeFocusSounds();
      previousPausedRef.current = null;
      return;
    }
    if (paused && previousPausedRef.current === false) ambientAudio.pause();
    if (!paused && previousPausedRef.current === true && ambientAudio.activeSound)
      void ambientAudio.play(ambientAudio.activeSound);
    previousPausedRef.current = paused;
  }, [room?.commitment?.id, room?.commitment?.pausedAt, room?.commitment?.status, ambientAudio.activeSound, ambientAudio.pause, ambientAudio.play, ambientAudio.stop, closeFocusSounds]);

  const sendInvite = async () => {
    setInviteError("");
    const normalized = email.trim().toLowerCase();
    if (inviteType === "email" && !/^\S+@\S+\.\S+$/.test(normalized)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const invite = await createRoomInvitation(
        accessToken,
        room!.id,
        inviteType === "email"
          ? { type: "email", email: normalized, expiresInHours: expires }
          : { type: "link", expiresInHours: expires },
      );
      if (inviteType === "link")
        setInviteLink(
          `${window.location.origin}/focus/rooms/${room!.id}?invite=${encodeURIComponent(invite.inviteCode)}`,
        );
      else {
        setInviteOpen(false);
        setNotice(
          invite.emailDelivery === "failed"
            ? "Invitation created, but the email could not be sent."
            : `Invitation sent to ${normalized}.`,
        );
        setEmail("");
      }
      await refresh();
    } catch (cause) {
      setInviteError(
        cause instanceof Error
          ? cause.message
          : "Could not create the invitation.",
      );
    } finally {
      setSending(false);
    }
  };
  const sharedControl = async (action: () => Promise<FocusRoom>, allowed = true) => { if (!allowed || isTerminalStatus(room?.commitment?.status)) { await refresh(); return; } setControlBusy(true); setControlError(""); try { setRoom(await action()); await refresh(); } catch (cause) { if (cause instanceof Error && cause.message.includes("This shared session has ended")) terminalSync.current = true; setControlError(cause instanceof Error ? cause.message : "Unable to update the shared session."); await refresh(); } finally { setControlBusy(false); } };

  if (!roomId)
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={onBack}
            className="mb-6 min-h-11 rounded-xl border px-4"
          >
            ← Focus
          </button>
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">Shared Focus Sessions</h1>
              <p className="mt-1 opacity-70">
                Start together, stay synchronized, and finish together.
              </p>
            </div>
            <button
              className="min-h-11 rounded-xl bg-amber-400 px-5 font-bold text-slate-950"
              onClick={() => setCreateOpen(true)}
            >
              Create session
            </button>
          </header>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-red-500/10 p-3 text-red-600"
            >
              {error}
            </p>
          )}
          {incoming.length > 0 && (
            <section className="mb-6 rounded-2xl border p-5">
              <h2 className="text-lg font-black">Session invitations</h2>
              {incoming.map(({ invitation, roomTitle: title }) => (
                <div
                  key={invitation.id}
                  className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/5 p-3"
                >
                  <div>
                    <strong>{title}</strong>
                    <p className="text-sm opacity-70">
                      Expires {new Date(invitation.expiresAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="min-h-11 rounded-xl border px-4"
                      onClick={() =>
                        void decideRoomInvitation(
                          accessToken,
                          invitation.id,
                          "reject",
                        ).then(refresh)
                      }
                    >
                      Reject
                    </button>
                    <button
                      className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950"
                      onClick={() =>
                        void decideRoomInvitation(
                          accessToken,
                          invitation.id,
                          "accept",
                        ).then(() => onOpenRoom(invitation.roomId))
                      }
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {rooms.map((item) => (
              <button
                key={item.id}
                onClick={() => onOpenRoom(item.id)}
                className="rounded-2xl border p-5 text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <strong className="text-lg">{item.title}</strong>
                  <span className="rounded-full border px-2.5 py-1 text-xs font-bold">
                    Shared session
                  </span>
                </div>
                <p className="mt-3 text-sm opacity-70">
                  Leaving early ends the shared session for everyone.
                </p>
                <p className="mt-5 font-semibold">
                  {item.members.length} participants
                </p>
              </button>
            ))}
          </div>
          {createOpen && (
            <Dialog
              title="Create a Shared Focus Session"
              onClose={() => setCreateOpen(false)}
            >
              <label
                className="mt-5 block text-sm font-bold"
                htmlFor="room-title"
              >
                Room title
              </label>
              <input
                autoFocus
                id="room-title"
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4"
              />
              <label className="mt-4 block text-sm font-bold" htmlFor="session-duration">Session duration</label>
              <input id="session-duration" type="number" list="session-duration-options" min={1} max={480} required value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4" />
              <datalist id="session-duration-options"><option value="25" /><option value="50" /><option value="90" /></datalist>
              <label className="mt-4 block text-sm font-bold" htmlFor="session-goal">Goal label <span className="font-normal opacity-65">(optional)</span></label>
              <input id="session-goal" maxLength={160} value={goalLabel} onChange={(event) => setGoalLabel(event.target.value)} placeholder="Study for the exam" className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4" />
              <p className="mt-4 rounded-xl bg-amber-400/15 p-3 text-sm">
                Once focus starts, this session locks. Nobody else can join and
                leaving ends it for everyone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  className="min-h-11 rounded-xl border px-4"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </button>
                <button
                  disabled={!roomTitle.trim() || durationMinutes < 1 || durationMinutes > 480}
                  className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950 disabled:opacity-50"
                  onClick={() =>
                    void createFocusRoom(accessToken, {
                      title: roomTitle.trim(),
                      visibility: "public",
                      mode: "commitment",
                    }).then(async (created) => {
                      await createCommitment(accessToken, created.id, {
                        durationMinutes,
                        goalLabel: goalLabel.trim() || undefined,
                        reconnectGraceSeconds: 60,
                      });
                      onOpenRoom(created.id);
                    })
                  }
                >
                  Create Session
                </button>
              </div>
            </Dialog>
          )}
        </div>
      </main>
    );

  if (!room) return <main className="p-8">Loading room…</main>;
  const active =
      !!room.commitment && ["active", "break"].includes(room.commitment.status),
    terminal = !!room.commitment && ["completed", "ended_early", "cancelled"].includes(room.commitment.status),
    readyCount = room.members.filter((member) => member.ready).length,
    currentMember = room.members.find(
      (member) => member.userId === room.currentUserId,
    );
  return (
    <main className={active ? "min-h-screen w-screen overflow-x-hidden bg-slate-950" : "min-h-screen p-4 md:p-7"}>
      <div className={active ? "min-h-screen w-screen" : "mx-auto max-w-6xl"}>
        {!active && <header className="mb-5 rounded-2xl border bg-white p-4 shadow-sm dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              className="min-h-11 rounded-xl border px-4"
              onClick={onBack}
            >
              ← Back to Sessions
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black">{room.title}</h1>
                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold">
                  Shared session
                </span>
                <span className="rounded-full border px-3 py-1 text-xs font-bold">
                  {label(room.visibility)}
                </span>
              </div>
              <p className="mt-1 text-sm opacity-70">
                {room.members.length} participants
              </p>
            </div>
            <button
              className="min-h-11 rounded-xl border border-red-500/40 px-4 text-red-600"
              onClick={() =>
                active
                  ? setLeaveOpen(true)
                  : void leaveFocusRoom(accessToken, room.id).then(onBack)
              }
            >
              Leave
            </button>
          </div>
          {room.mode === "commitment" && (
            <p className="mt-4 rounded-xl bg-amber-400/15 p-3 text-sm font-semibold">
              Leaving early ends the shared session for everyone.
            </p>
          )}
        </header>}
        {!active && notice && (
          <p
            role="status"
            className="mb-5 rounded-xl bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300"
          >
            {notice}
          </p>
        )}
        {!active && error && (
          <p
            role="alert"
            className="mb-5 rounded-xl bg-red-500/10 p-3 text-red-600"
          >
            {error}
          </p>
        )}
        {terminal ? (
          <section className="rounded-3xl border p-7 text-center">
            <h2 className="text-2xl font-black">
              {room.commitment?.status === "completed" ? "Shared Focus Session Complete" : "Session ended early"}
            </h2>
            <p className="mt-2 opacity-75">
              {room.commitment?.status === "completed"
                ? "Great work — everyone completed the session."
                : room.commitment?.endReason === "owner_ended_session"
                  ? "The session was ended by the owner."
                  : (() => {
                      const actor = room.members.find((member) => member.userId === room.commitment?.endedByUserId);
                      return actor && !actor.anonymous ? `The session ended because ${actor.displayName} left.` : "The session ended because a participant left.";
                    })()}
            </p>
            {room.commitment?.goalLabel && <p className="mt-5"><strong>Goal:</strong> {room.commitment.goalLabel}</p>}
            <dl className="mx-auto mt-5 grid max-w-xl gap-3 text-start sm:grid-cols-2">
              <div><dt className="text-sm opacity-65">Planned duration</dt><dd className="font-bold">{room.commitment?.durationMinutes} minutes</dd></div>
              <div><dt className="text-sm opacity-65">Actual shared focus</dt><dd className="font-bold">{Math.max(0, Math.floor((new Date(room.commitment?.endedAt ?? Date.now()).getTime() - new Date(room.commitment?.startedAt ?? room.commitment?.endedAt ?? Date.now()).getTime()) / 60000))} minutes</dd></div>
              <div><dt className="text-sm opacity-65">Participants</dt><dd className="font-bold">{room.members.length}</dd></div>
              {room.commitment?.startedAt && <div><dt className="text-sm opacity-65">Start time</dt><dd className="font-bold">{new Date(room.commitment.startedAt).toLocaleTimeString()}</dd></div>}
              {room.commitment?.endedAt && <div><dt className="text-sm opacity-65">End time</dt><dd className="font-bold">{new Date(room.commitment.endedAt).toLocaleTimeString()}</dd></div>}
              {room.commitment?.status !== "completed" && <div><dt className="text-sm opacity-65">Remaining at termination</dt><dd className="font-bold">{Math.max(0, room.commitment!.durationMinutes - Math.floor((new Date(room.commitment!.endedAt ?? Date.now()).getTime() - new Date(room.commitment!.startedAt ?? room.commitment!.endedAt ?? Date.now()).getTime()) / 60000))} minutes</dd></div>}
              {room.commitment?.status !== "completed" && <div><dt className="text-sm opacity-65">End reason</dt><dd className="font-bold">{label(room.commitment!.endReason ?? "cancelled before start")}</dd></div>}
            </dl>
            <div className="mx-auto mt-6 max-w-xl text-start"><h3 className="font-black">Participant focus</h3>{room.members.map((member) => <p key={member.userId} className="mt-2 flex justify-between"><span>{member.displayName}</span><strong>{member.focusedDurationMinutes ?? 0} minutes</strong></p>)}</div>
            <button onClick={onBack} className="mt-7 min-h-11 rounded-xl bg-amber-400 px-5 font-bold text-slate-950">Return to Shared Focus Sessions</button>
          </section>
        ) : active ? (
          <>
          <SharedFocusExperienceAdapter room={room} remainingSeconds={remaining ?? 0} progress={room.commitment?.durationMinutes ? Math.max(0, Math.min(1, 1 - (remaining ?? 0) / (room.commitment.durationMinutes * 60))) : 0} busy={controlBusy} error={controlError} onPause={() => setPauseConfirm(true)} onResume={() => void sharedControl(() => resumeCommitment(accessToken, room.commitment!.id), Boolean(room.commitment?.pausedAt))} onAddTime={() => setAddTimeOpen(true)} onFinish={() => setLeaveOpen(true)} onCancel={() => setLeaveOpen(true)} soundControl={<button className="rounded-xl border px-4 py-2 text-sm font-bold text-white" onClick={openFocusSounds}>Focus Sounds</button>} soundPanel={isFocusSoundsOpen ? <FocusSoundsPanel activeSound={ambientAudio.activeSound} isPlaying={ambientAudio.isPlaying} muted={ambientAudio.muted} volume={ambientAudio.volume} error={ambientAudio.error} onClose={closeFocusSounds} onMuteToggle={ambientAudio.toggleMuted} onPause={ambientAudio.pause} onPlay={ambientAudio.play} onStop={ambientAudio.stop} onVolumeChange={ambientAudio.setVolume} /> : null} participants={<div className="mt-6 space-y-2">{room.members.map(member => <div key={member.userId} className="flex items-center justify-between rounded-xl border border-white/10 px-4 py-2 text-sm text-white"><span>{member.displayName}</span><span className="text-slate-300">{member.state === 'offline' ? 'Reconnecting…' : 'Focusing'}</span></div>)}</div>} />
          <section className={`hidden relative mx-auto min-h-[72vh] max-w-4xl overflow-hidden rounded-[2rem] border p-8 text-center shadow-2xl ${room.commitment?.pausedAt ? "border-blue-400/40 bg-[radial-gradient(circle_at_center,_rgba(59,130,246,.28),_rgba(15,23,42,.98)_62%)]" : "border-amber-300/40 bg-[radial-gradient(circle_at_center,_rgba(251,191,36,.3),_rgba(15,23,42,.98)_62%)]"}`}>
            <div className="relative z-10 flex min-h-[62vh] flex-col items-center justify-center">
            <p className="text-xs font-black uppercase tracking-[0.3em] text-white/60">Shared Focus · {room.members.length} participants</p>
            {room.commitment?.goalLabel && <h2 className="mt-3 text-2xl font-black">{room.commitment.goalLabel}</h2>}
            <div className="relative mt-8 grid size-72 place-items-center sm:size-96"><svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2"/><circle cx="50" cy="50" r="45" fill="none" stroke={room.commitment?.pausedAt ? "#60a5fa" : "#fbbf24"} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(283, ((room.commitment?.durationMinutes ?? 1) * 60 - (remaining ?? 0)) / ((room.commitment?.durationMinutes ?? 1) * 60) * 283))} 283`} className="transition-all duration-700"/></svg><p className="relative text-7xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_0_24px_rgba(251,191,36,.5)] sm:text-8xl">{remaining == null ? "00:00" : clock(remaining)}</p></div>
            <p className="mt-3 font-semibold">{room.commitment?.durationMinutes} minutes · {room.members.length} participants</p>
            <div className="mx-auto mt-7 grid max-w-xl gap-2 text-start sm:grid-cols-2">
              {room.members.map((member) => <div key={member.userId} className="flex items-center justify-between rounded-xl border px-4 py-3"><span>{member.displayName}</span><span className="text-sm font-bold opacity-70">{member.state === "offline" ? "Reconnecting…" : "Focusing"}</span></div>)}
            </div>
            <p className="mt-6 text-sm opacity-70">Leaving, finishing, or cancelling ends this shared session for everyone.</p>
            <button className="mt-5 min-h-11 rounded-xl border border-red-300/40 bg-black/20 px-5 font-bold text-red-200" onClick={() => setLeaveOpen(true)}>Finish for everyone</button>
            {controlError && <p role="alert" className="mt-4 text-sm text-red-600">{controlError}</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {room.commitment?.pausedAt ? <button disabled={controlBusy} className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950 disabled:opacity-50" onClick={() => void sharedControl(() => resumeCommitment(accessToken, room.commitment!.id), room.commitment?.status === "active" && Boolean(room.commitment?.pausedAt))}>Resume</button> : <button disabled={controlBusy} className="min-h-11 rounded-xl border px-4 font-bold disabled:opacity-50" onClick={() => setPauseConfirm(true)}>Pause</button>}
              {room.ownerUserId === room.currentUserId && <button disabled={controlBusy || Boolean(room.commitment?.pausedAt)} className="min-h-11 rounded-xl border px-4 font-bold disabled:opacity-50" onClick={() => setAddTimeOpen(true)}>Add time</button>}
            </div>
            {pauseConfirm && <div className="mx-auto mt-4 max-w-md rounded-xl border p-4"><p className="font-bold">Pause this shared session for everyone?</p><div className="mt-3 flex justify-center gap-2"><button className="min-h-10 rounded-lg border px-3" onClick={() => setPauseConfirm(false)}>Keep focusing</button><button disabled={controlBusy} className="min-h-10 rounded-lg bg-amber-400 px-3 font-bold" onClick={() => { setPauseConfirm(false); void sharedControl(() => pauseCommitment(accessToken, room.commitment!.id), room.commitment?.status === "active" && !room.commitment?.pausedAt); }}>Pause for everyone</button></div></div>}
            {addTimeOpen && <div className="mx-auto mt-4 max-w-md rounded-xl border p-4"><p className="font-bold">Add time to this session for everyone?</p><div className="mt-3 flex justify-center gap-2">{[5, 10, 15].map((minutes) => <button key={minutes} disabled={controlBusy} className="min-h-10 rounded-lg border px-3 font-bold" onClick={() => { setAddTimeOpen(false); void sharedControl(() => extendCommitment(accessToken, room.commitment!.id, minutes), room.commitment?.status === "active"); }}>+{minutes} min</button>)}<button className="min-h-10 rounded-lg border px-3" onClick={() => setAddTimeOpen(false)}>Cancel</button></div></div>}
            </div></section></>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.35fr_.85fr]">
            <div className="space-y-5">
              <section className="rounded-3xl border bg-gradient-to-br from-amber-400/15 to-transparent p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider opacity-65">
                      Shared Focus Session
                    </p>
                    <p className="mt-2 text-5xl font-black tabular-nums">
                      {remaining == null
                        ? `${room.commitment?.durationMinutes ?? 25} minutes`
                        : clock(remaining)}
                    </p>
                    <p className="mt-3 font-semibold">
                      {room.commitment
                        ? `${readyCount} of ${room.members.length} participants ready`
                        : `${room.members.length} participants in the room`}
                    </p>
                    {room.commitment?.goalLabel && <p className="mt-2"><strong>Goal:</strong> {room.commitment.goalLabel}</p>}
                  </div>
                  <span className="rounded-full border px-3 py-2 text-sm font-bold">
                    {label(room.commitment?.status ?? "open")}
                  </span>
                </div>
                {room.mode === "commitment" && room.commitment && !active && (
                  <div className="mt-5 rounded-2xl border-2 border-amber-400 p-5">
                    <h2 className="font-black">Shared commitment agreement</h2>
                    <p className="my-3">{AGREEMENT}</p>
                    <div className="grid gap-2 text-sm sm:grid-cols-2">
                      <p>Duration: {room.commitment.durationMinutes} minutes</p>
                      <p>
                        Break:{" "}
                        {room.commitment.breakMinutes
                          ? `${room.commitment.breakMinutes} minutes`
                          : "None"}
                      </p>
                      <p>
                        Reconnect grace: {room.commitment.reconnectGraceSeconds}{" "}
                        seconds
                      </p>
                      <p>
                        {room.members.filter((member) => !member.ready).length}{" "}
                        preparing
                      </p>
                    </div>
                    <p className="mt-3 text-sm font-semibold">
                      Session starts when everyone is ready.
                    </p>
                    <label className="mt-4 flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={accepted || currentMember?.acceptedAgreement}
                        onChange={(event) => setAccepted(event.target.checked)}
                        disabled={currentMember?.acceptedAgreement}
                      />{" "}
                      I accept the collective-end rule.
                    </label>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        disabled={
                          Boolean(currentMember?.ready) ||
                          (!accepted && !currentMember?.acceptedAgreement)
                        }
                        className="min-h-11 rounded-xl bg-amber-400 px-5 font-bold text-slate-950 disabled:opacity-55"
                        onClick={() =>
                          void acceptCommitment(
                            accessToken,
                            room.commitment!.id,
                          )
                            .then(() =>
                              readyCommitment(accessToken, room.commitment!.id),
                            )
                            .then(setRoom)
                        }
                      >
                        {currentMember?.ready ? "Ready ✓" : "I'm Ready"}
                      </button>
                      {room.ownerUserId === room.currentUserId && (
                        <button
                          disabled={readyCount !== room.members.length || !room.members.length}
                          className="min-h-11 rounded-xl border px-5 font-bold disabled:opacity-50"
                          onClick={() =>
                            void startCommitment(
                              accessToken,
                              room.commitment!.id,
                            )
                              .then(setRoom)
                              .catch((cause) => setError(cause.message))
                          }
                        >
                          Start Session
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {room.mode === "commitment" &&
                  !room.commitment &&
                  room.canManageInvitations && (
                    <button
                      className="mt-5 min-h-11 rounded-xl bg-amber-400 px-5 font-bold text-slate-950"
                      onClick={() =>
                        void createCommitment(accessToken, room.id, {
                          durationMinutes: 25,
                          reconnectGraceSeconds: 60,
                        }).then(refresh)
                      }
                    >
                      Set Up Commitment Session
                    </button>
                  )}
              </section>
              <section className="rounded-2xl border p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-black">Participants</h2>
                  <span className="text-sm opacity-65">
                    {room.members.length} total
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {room.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex min-h-20 items-center gap-3 rounded-2xl bg-black/5 p-3 dark:bg-white/5"
                    >
                      <div
                        aria-hidden="true"
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-amber-400 font-black text-slate-950"
                      >
                        {member.displayName
                          .split(" ")
                          .map((part) => part[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">
                          {member.displayName}
                        </p>
                        <p className="text-sm opacity-70">
                          {member.ready ? "Ready" : label(member.state)}
                        </p>
                      </div>
                      {member.state === "focusing" && remaining != null && (
                        <span className="font-mono text-sm">
                          {clock(
                            (room.commitment?.durationMinutes ?? 0) * 60 -
                              remaining,
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {!room.isCurrentUserMember && (
                  <button
                    className="mt-4 min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950"
                    onClick={() =>
                      void joinFocusRoom(accessToken, room.id).then(setRoom)
                    }
                  >
                    Join Room
                  </button>
                )}
              </section>
            </div>
            <aside className="space-y-5">
              <section className="rounded-2xl border p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black">Pending Invitations</h2>
                  {room.canManageInvitations && (
                    <button
                      className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950"
                      onClick={() => {
                        setInviteOpen(true);
                        setInviteLink("");
                        setInviteError("");
                      }}
                    >
                      Create invite
                    </button>
                  )}
                </div>
                {managedInvites.length === 0 ? (
                  <p className="mt-4 text-sm opacity-60">No invitations yet.</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {managedInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="rounded-xl bg-black/5 p-3 dark:bg-white/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="truncate">
                            {invite.label ?? "Invite link"}
                          </strong>
                          <span className="rounded-full border px-2 py-1 text-xs">
                            {label(invite.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs opacity-65">
                          Sent {new Date(invite.sentAt).toLocaleString()}
                          <br />
                          Expires {new Date(invite.expiresAt).toLocaleString()}
                        </p>
                        {invite.status === "pending" && (
                          <button
                            className="mt-2 min-h-11 text-sm font-bold text-red-600"
                            onClick={() =>
                              void revokeRoomInvitation(
                                accessToken,
                                invite.id,
                              ).then(refresh)
                            }
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="rounded-2xl border p-5">
                <h2 className="text-lg font-black">System activity</h2>
                <div className="mt-4 space-y-3">
                  {room.events.length === 0 ? (
                    <p className="text-sm opacity-60">No activity yet.</p>
                  ) : (
                    room.events.map((event) => (
                      <div key={event.id} className="flex gap-3 text-sm">
                        <span aria-hidden="true">●</span>
                        <div>
                          <p>{eventMessage(event, room)}</p>
                          <time className="text-xs opacity-60">
                            {new Date(event.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </aside>
          </div>
        )}
        {inviteOpen && (
          <Dialog
            title="Invite someone to this Shared Focus Session"
            description="Choose an email invitation or create a separate shareable link."
            onClose={() => !sending && setInviteOpen(false)}
          >
            <div
              className="mt-5 grid grid-cols-2 gap-2"
              role="tablist"
              aria-label="Invitation type"
            >
              <button
                role="tab"
                aria-selected={inviteType === "email"}
                className={`min-h-11 rounded-xl border px-3 ${inviteType === "email" ? "border-amber-400 bg-amber-400/15" : ""}`}
                onClick={() => {
                  setInviteType("email");
                  setInviteLink("");
                  setInviteError("");
                }}
              >
                Invite by email
              </button>
              <button
                role="tab"
                aria-selected={inviteType === "link"}
                className={`min-h-11 rounded-xl border px-3 ${inviteType === "link" ? "border-amber-400 bg-amber-400/15" : ""}`}
                onClick={() => {
                  setInviteType("link");
                  setInviteLink("");
                  setInviteError("");
                }}
              >
                Create invite link
              </button>
            </div>
            {inviteType === "email" ? (
              <>
                <label
                  htmlFor="invite-email"
                  className="mt-5 block text-sm font-bold"
                >
                  Email address
                </label>
                <input
                  autoFocus
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(inviteError)}
                  aria-describedby={inviteError ? "invite-error" : undefined}
                  placeholder="name@example.com"
                  className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4"
                />
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-black/5 p-4 text-sm dark:bg-white/5">
                Create a secure, revocable link. An empty email will never
                create a link automatically.
              </p>
            )}
            <label
              htmlFor="invite-expiry"
              className="mt-4 block text-sm font-bold"
            >
              Expires after
            </label>
            <select
              id="invite-expiry"
              value={expires}
              onChange={(event) => setExpires(Number(event.target.value))}
              className="mt-2 min-h-12 w-full rounded-xl border bg-white px-4 dark:bg-slate-900"
            >
              <option value={1}>1 hour</option>
              <option value={24}>24 hours</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>
            {inviteError && (
              <p
                id="invite-error"
                role="alert"
                className="mt-3 text-sm font-semibold text-red-600"
              >
                {inviteError}
              </p>
            )}
            {inviteLink && (
              <div className="mt-4 rounded-xl border p-3">
                <label htmlFor="invite-link" className="text-sm font-bold">
                  Invite link
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="invite-link"
                    readOnly
                    value={inviteLink}
                    className="min-h-11 min-w-0 flex-1 rounded-lg border bg-transparent px-3"
                  />
                  <button
                    className="min-h-11 rounded-lg border px-3"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(inviteLink)
                        .then(() => setNotice("Invite link copied."))
                    }
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                disabled={sending}
                className="min-h-11 rounded-xl border px-4"
                onClick={() => setInviteOpen(false)}
              >
                Cancel
              </button>
              <button
                disabled={sending || (inviteType === "email" && !email.trim())}
                className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950 disabled:opacity-50"
                onClick={() => void sendInvite()}
              >
                {sending
                  ? "Sending…"
                  : inviteType === "email"
                    ? "Send Invite"
                    : "Create Link"}
              </button>
            </div>
          </Dialog>
        )}
        {leaveOpen && (
          <Dialog
            title="End the session for everyone?"
            description="You agreed to stay until the shared session ends. Leaving now will end the Commitment Session for all participants."
            onClose={() => setLeaveOpen(false)}
          >
            <p className="mt-4 text-sm">
              Remaining: {clock(remaining ?? 0)} · Affected participants:{" "}
              {room.members.length}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                autoFocus
                className="min-h-11 rounded-xl border px-4"
                onClick={() => setLeaveOpen(false)}
              >
                Stay in Session
              </button>
              <button
                className="min-h-11 rounded-xl bg-red-600 px-4 font-bold text-white"
                onClick={() =>
                  void leaveFocusRoom(accessToken, room.id, {
                    commandId: crypto.randomUUID(),
                    reason: "participant_left_early",
                  }).then(() => {
                    setLeaveOpen(false);
                    return refresh();
                  })
                }
              >
                End for Everyone
              </button>
            </div>
          </Dialog>
        )}
      </div>
    </main>
  );
}
