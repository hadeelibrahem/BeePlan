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
  getFocusRoomMessages,
  getRoomInvitations,
  joinFocusRoom,
  joinFocusRoomByCode,
  leaveFocusRoom,
  listFocusRooms,
  listRoomInvitations,
  presence,
  readyCommitment,
  revokeRoomInvitation,
  startCommitment,
  pauseCommitment,
  resumeCommitment,
  sendFocusRoomMessage,
  setFocusRoomCoach,
  extendCommitment,
  subscribeRoomEvents,
  type FocusRoom,
  type FocusRoomChatMessage,
  type ManagedRoomInvitation,
  type RoomInvitation,
} from "../lib/focusRoomsApi";
import { getSharedSessionRemainingMs } from "../lib/sharedSessionTiming";
import { SharedFocusExperienceAdapter } from "../components/focus/SharedFocusExperienceAdapter";
import { useFocusAmbientAudio } from "../lib/useFocusAmbientAudio";
import { FocusSoundsPanel } from "../components/focus/FocusSoundsPanel";
import { useLanguage } from "../i18n/LanguageContext";
import { OutlineButton, PrimaryButton } from "../components/layout/Buttons";
import { mergeFocusRoomChatMessages } from "../lib/focusRoomChatMessages";

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
const TERMINAL_STATUSES = new Set(["completed", "ended_early", "terminated", "cancelled"]);
const isTerminalStatus = (status?: string | null) => Boolean(status && TERMINAL_STATUSES.has(status));
export function LegacyFocusRoomChatPanel({ open, onClose, room, accessToken, language }: { open: boolean; onClose: () => void; room: FocusRoom; accessToken: string; language: 'en' | 'ar' }) {
  const [messages, setMessages] = useState<FocusRoomChatMessage[]>([]), [draft, setDraft] = useState(''), [loading, setLoading] = useState(true), [sending, setSending] = useState(false), [error, setError] = useState(''), [coachEnabled, setCoachEnabled] = useState(room.aiFocusCoachEnabled !== false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }; document.addEventListener('keydown', close); return () => document.removeEventListener('keydown', close); }, [open, onClose]);
  useEffect(() => { let active = true; setLoading(true); void getFocusRoomMessages(accessToken, room.id).then(result => { if (active) setMessages(result.messages) }).catch(() => active && setError('Unable to load chat.')).finally(() => active && setLoading(false)); return () => { active = false } }, [accessToken, room.id, room.events]);
  useEffect(() => { const node = scroller.current; if (node && node.scrollHeight - node.scrollTop - node.clientHeight < 120) node.scrollTop = node.scrollHeight }, [messages]);
  const send = async () => { const content = draft.trim(); if (!content || sending) return; setSending(true); setError(''); try { const message = await sendFocusRoomMessage(accessToken, room.id, content); setMessages(current => current.some(item => item.id === message.id) ? current : [...current, message]); setDraft('') } catch { setError('Message could not be sent.') } finally { setSending(false) } };
  const toggleCoach = async () => { try { const result = await setFocusRoomCoach(accessToken, room.id, !coachEnabled); setCoachEnabled(result.aiFocusCoachEnabled) } catch { setError('Only the session owner can change the Focus Coach setting.') } };
  const owner = room.ownerUserId === room.currentUserId;
  if (!open) return null;
  return <section className="mt-6 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black">Session chat</h2><p className="mt-1 text-xs text-[var(--bp-muted)]">{coachEnabled ? '🐝 Bee Focus Coach is enabled and may help keep this session on track.' : 'Focus Coach is disabled.'}</p></div>{owner && <label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={coachEnabled} onChange={() => void toggleCoach()} /> AI Focus Coach</label>}</div><div ref={scroller} className="mt-4 max-h-80 space-y-3 overflow-y-auto pe-1">{loading ? <p className="text-sm text-[var(--bp-muted)]">Loading chat…</p> : messages.length ? messages.map(message => <article key={message.id} className={`rounded-xl px-3 py-2 text-sm ${message.senderType === 'ai' ? 'border border-amber-400/30 bg-amber-400/10' : 'bg-[var(--bp-bg)]'}`}><div className="flex items-center justify-between gap-3"><strong>{message.senderType === 'ai' ? '🐝 Bee Focus Coach' : message.senderName}</strong><time className="text-[10px] text-[var(--bp-muted)]">{new Date(message.createdAt).toLocaleTimeString(language === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}</time></div><p className="mt-1 whitespace-pre-wrap">{message.content}</p></article>) : <p className="text-sm text-[var(--bp-muted)]">No messages yet. Share a quick update or ask Bee Focus Coach for help.</p>}</div><div className="mt-4 flex gap-2"><input value={draft} maxLength={2000} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} placeholder="Message the session…" className="min-w-0 flex-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm" /><PrimaryButton size="sm" loading={sending} disabled={!draft.trim()} onClick={() => void send()}>Send</PrimaryButton></div>{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}</section>;
}
function FocusRoomChatPanel({ open, onClose, room, accessToken, language, messages, mergeMessages }: { open: boolean; onClose: () => void; room: FocusRoom; accessToken: string; language: 'en' | 'ar'; messages: FocusRoomChatMessage[]; mergeMessages: (incoming: FocusRoomChatMessage[], source: 'history' | 'send') => void }) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scroller = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const requestGeneration = useRef(0);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    if (import.meta.env.DEV) console.info(`[FocusChat:Web] panel mount roomId=${room.id}`);
    return () => { if (import.meta.env.DEV) console.info(`[FocusChat:Web] panel unmount roomId=${room.id}`); };
  }, [open, room.id]);
  useEffect(() => {
    if (!open) return;
    const request = ++requestGeneration.current;
    let active = true;
    setLoading(current => current || messages.length === 0);
    setError('');
    if (import.meta.env.DEV) console.info(`[FocusChat] history fetch start roomId=${room.id}`);
    void getFocusRoomMessages(accessToken, room.id)
      .then(result => {
        if (!active || request !== requestGeneration.current) return;
        mergeMessages(result.messages, 'history');
        if (import.meta.env.DEV) console.info(`[FocusChat] history fetch success count=${result.messages.length}`);
      })
      .catch(() => active && request === requestGeneration.current && setError(t('sharedFocusChat.loadFailed')))
      .finally(() => { if (active && request === requestGeneration.current) setLoading(false); });
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', escape);
    return () => { active = false; document.removeEventListener('keydown', escape); };
    // A chat lifecycle is keyed only by visibility, credentials, and room id.
    // Parent timer renders and callback identity changes must not refetch history.
  }, [accessToken, mergeMessages, open, room.id]);
  useEffect(() => { if (open && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [messages, open]);
  const send = async () => { const content = draft.trim(); if (!content || sending) return; setSending(true); setError(''); try { const message = await sendFocusRoomMessage(accessToken, room.id, content); mergeMessages([message], 'send'); setDraft(''); } catch { setError(t('sharedFocusChat.sendFailed')); } finally { setSending(false); } };
  if (!open) return null;
  return <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/45 sm:items-stretch sm:justify-end" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={t('sharedFocusChat.title')} className="flex h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-[var(--bp-surface)] p-4 shadow-2xl sm:h-full sm:rounded-none"><header className="flex items-start justify-between gap-3"><div><h2 className="font-black">{t('sharedFocusChat.title')}</h2><p className="mt-1 text-xs text-[var(--bp-muted)]">{room.aiFocusCoachEnabled === false ? t('sharedFocusChat.coachOff') : t('sharedFocusChat.coachOn')}</p></div><button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-bold" aria-label={t('sharedFocusChat.close')}>{t('sharedFocusChat.close')}</button></header><div ref={scroller} className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto">{loading && messages.length === 0 ? <p className="text-sm text-[var(--bp-muted)]">{t('sharedFocusChat.loading')}</p> : messages.length ? messages.map(message => <article key={message.id} className={`rounded-xl px-3 py-2 text-sm ${message.senderType === 'ai' ? 'border border-amber-400/30 bg-amber-400/10' : 'bg-[var(--bp-bg)]'}`}><div className="flex justify-between gap-3"><strong>{message.senderType === 'ai' ? t('sharedFocusChat.coach') : message.senderName}</strong><time className="text-[10px] text-[var(--bp-muted)]">{new Date(message.createdAt).toLocaleTimeString(language === 'ar' ? 'ar' : 'en', { hour: '2-digit', minute: '2-digit' })}</time></div><p className="mt-1 whitespace-pre-wrap">{message.content}</p></article>) : <p className="text-sm text-[var(--bp-muted)]">{t('sharedFocusChat.empty')}</p>}</div><div className="mt-4 flex gap-2"><input autoFocus value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void send(); } }} placeholder={t('sharedFocusChat.placeholder')} className="min-w-0 flex-1 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm" /><PrimaryButton size="sm" loading={sending} disabled={!draft.trim()} onClick={() => void send()}>{t('sharedFocusChat.send')}</PrimaryButton></div>{error ? <p role="alert" className="mt-2 text-xs text-red-600">{error}</p> : null}</section></div>;
}
const eventMessage = (event: FocusRoom["events"][number], room: FocusRoom, t: (key: string, params?: Record<string, string | number>) => string) => {
  const actor =
    room.members.find((member) => member.userId === event.userId)
      ?.displayName ?? t("sharedFocusActivity.participant");
  return (
    {
      member_joined: t("sharedFocusActivity.memberJoined", { actor }),
      member_left: t("sharedFocusActivity.memberLeft", { actor }),
      member_ready: t("sharedFocusActivity.memberReady", { actor }),
      commitment_started: t("sharedFocusActivity.started"),
      member_started_focus: t("sharedFocusActivity.startedFocus"),
      member_started_break: t("sharedFocusActivity.startedBreak"),
      commitment_ended_early: t("sharedFocusActivity.endedEarly"),
      commitment_completed: t("sharedFocusActivity.completed"),
      member_reconnecting: t("sharedFocusActivity.reconnecting"),
    }[event.eventType] ?? t("sharedFocusActivity.updated")
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
  const { t, language } = useLanguage();
  const [rooms, setRooms] = useState<FocusRoom[]>([]),
    [room, setRoom] = useState<FocusRoom | null>(null),
    [incoming, setIncoming] = useState<RoomInvitation[]>([]),
    [managedInvites, setManagedInvites] = useState<ManagedRoomInvitation[]>([]),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [now, setNow] = useState(Date.now());
  const [createOpen, setCreateOpen] = useState(false),
    [joinOpen, setJoinOpen] = useState(false),
    [joinCode, setJoinCode] = useState(""),
    [joinError, setJoinError] = useState(""),
    [listLoadFailed, setListLoadFailed] = useState(false),
    [joining, setJoining] = useState(false),
    [creating, setCreating] = useState(false),
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
    [leaving, setLeaving] = useState(false),
    [leaveError, setLeaveError] = useState(""),
    [accepted, setAccepted] = useState(false);
  const [controlBusy, setControlBusy] = useState(false), [controlError, setControlError] = useState(""), [pauseConfirm, setPauseConfirm] = useState(false), [addTimeOpen, setAddTimeOpen] = useState(false);
  const [isFocusSoundsOpen, setIsFocusSoundsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false), [chatUnreadCount, setChatUnreadCount] = useState(0);
  const [chatMessages, setChatMessages] = useState<FocusRoomChatMessage[]>([]);
  const chatOpenRef = useRef(false), currentUserIdRef = useRef<string | null>(null);
  chatOpenRef.current = chatOpen;
  currentUserIdRef.current = room?.currentUserId ?? null;
  const mergeChatMessages = useCallback((incoming: FocusRoomChatMessage[], source: 'history' | 'realtime' | 'send') => {
    setChatMessages(previous => {
      const next = mergeFocusRoomChatMessages(previous, incoming);
      if (import.meta.env.DEV) console.info(`[FocusChat:Web] ${source} merge before=${previous.length} after=${next.length}`);
      return next;
    });
  }, []);
  useEffect(() => { setChatMessages([]); }, [roomId]);
  const ambientAudio = useFocusAmbientAudio();
  const openFocusSounds = useCallback(() => setIsFocusSoundsOpen(true), []);
  const closeFocusSounds = useCallback(() => setIsFocusSoundsOpen(false), []);
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenEnabled) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);
  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
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
        setListLoadFailed(false);
      }
    } catch (cause) {
      if (!roomId) {
        setListLoadFailed(true);
        return;
      }
      console.error("Could not load shared focus rooms", cause);
      setError("room-load-failed");
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
    const stream = () => void subscribeRoomEvents(
      accessToken,
      roomId,
      (event) => {
        if (import.meta.env.DEV) console.info(`[FocusChat:Web] raw event type=${event.type}`);
        if (event.id && seenEvents.current.has(event.id)) return;
        if (event.id) seenEvents.current.add(event.id);
        if (event.type === "chat_message" && event.payload?.message) {
          if (import.meta.env.DEV) console.info(`[FocusChat:Web] chat_message received id=${event.payload.message.id}`);
          mergeChatMessages([event.payload.message], 'realtime');
          if (!chatOpenRef.current && event.payload.message.senderUserId !== currentUserIdRef.current) setChatUnreadCount(count => count + 1);
        }
        if (event.type !== "chat_message") void refresh();
      },
      controller.signal,
    ).then(() => {
      if (!disposed) { if (import.meta.env.DEV) console.info(`[FocusChat:Web] stream reconnecting roomId=${roomId}`); window.setTimeout(stream, 1000); }
    }).catch((cause) => {
      if (!disposed) { if (import.meta.env.DEV) console.info(`[FocusChat:Web] stream disconnected reason=${cause instanceof Error ? cause.name : "unknown"}`); window.setTimeout(stream, 1000); }
    });
    stream();
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
      setInviteError(t("sharedFocusRooms.invalidEmail"));
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
            ? t("sharedFocusRooms.invitationEmailFailed")
            : t("sharedFocusRooms.invitationSentTo", { email: normalized }),
        );
        setEmail("");
      }
      await refresh();
    } catch (cause) {
      console.error("Could not create room invitation", cause);
      setInviteError(t("sharedFocusRooms.invitationFailed"));
    } finally {
      setSending(false);
    }
  };
  // The mutation response is authoritative. Do not hold every control hostage
  // while optional room/invitation reconciliation is still in flight.
  const sharedControl = async (action: () => Promise<FocusRoom>, allowed = true) => { if (!allowed || isTerminalStatus(room?.commitment?.status)) { void refresh(); return; } setControlBusy(true); setControlError(""); try { setRoom(await action()); } catch (cause) { if (cause instanceof Error && cause.message.includes("This shared session has ended")) terminalSync.current = true; console.error("Could not update shared focus session", cause); setControlError(t("common.somethingWentWrong")); void refresh(); } finally { setControlBusy(false); } };

  if (!roomId)
    return (
      <main className="min-h-screen p-4 md:p-8">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={onBack}
            className="mb-6 min-h-11 rounded-xl border px-4"
          >
            ← {t("sharedFocus.title")}
          </button>
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black">{t("sharedFocus.title")}</h1>
              <p className="mt-1 opacity-70">
                {t("sharedFocus.subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2"><OutlineButton onClick={() => { setJoinCode(""); setJoinError(""); setJoinOpen(true); }}>{t("sharedFocus.joinWithCode")}</OutlineButton><PrimaryButton onClick={() => setCreateOpen(true)}>{t("sharedFocus.createSession")}</PrimaryButton></div>
          </header>
          {listLoadFailed && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-red-500/10 p-3 text-red-600"
            >
              {t("sharedFocus.loadError")} <button className="ms-2 font-bold underline" onClick={() => void refresh()}>{t("sharedFocus.retry")}</button>
            </p>
          )}
          {incoming.length > 0 && (
            <section className="mb-6 rounded-2xl border p-5">
              <h2 className="text-lg font-black">{t("sharedFocusRooms.sessionInvitations")}</h2>
              {incoming.map(({ invitation, roomTitle: title }) => (
                <div
                  key={invitation.id}
                  className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/5 p-3"
                >
                  <div>
                    <strong>{title}</strong>
                    <p className="text-sm opacity-70">
                      {t("sharedFocusRooms.expiresAt", { date: new Date(invitation.expiresAt).toLocaleString(language === "ar" ? "ar" : "en") })}
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
                      {t("sharedFocusRooms.reject")}
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
                      {t("sharedFocusRooms.accept")}
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}
          <section><h2 className="text-xl font-black">{t("sharedFocus.yourSessions")}</h2><p className="mt-1 text-sm opacity-70">{t("sharedFocus.yourSessionsDescription")}</p>
          {rooms.length === 0 ? <div className="mt-5 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 text-center"><p className="text-lg font-black">{t("sharedFocus.emptyTitle")}</p><p className="mx-auto mt-2 max-w-lg text-sm text-[var(--bp-muted)]">{t("sharedFocus.emptyDescription")}</p><div className="mt-5 flex flex-wrap justify-center gap-2"><PrimaryButton size="sm" onClick={() => setCreateOpen(true)}>{t("sharedFocus.createSession")}</PrimaryButton><OutlineButton size="sm" onClick={() => setJoinOpen(true)}>{t("sharedFocus.joinWithCode")}</OutlineButton></div></div> : <div className="mt-5 grid max-w-5xl gap-4 md:grid-cols-2 xl:grid-cols-3">
            {rooms.map((item) => {
              const status = item.commitment?.status === "completed" ? t("sharedFocus.completed") : ["active", "break"].includes(item.commitment?.status ?? "") ? t("sharedFocus.inProgress") : t("sharedFocus.waiting");
              return (
              <button
                key={item.id}
                onClick={() => onOpenRoom(item.id)}
                className="rounded-2xl border p-5 text-start shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <strong className="text-lg">{item.title}</strong>
                  <span className="rounded-full border px-2.5 py-1 text-xs font-bold">
                    {status}
                  </span>
                </div>
                <p className="mt-5 font-semibold">
                  👥 {item.members.length} {t("sharedFocus.participants")}
                </p>
                {item.ownerUserId === item.currentUserId && <span className="mt-3 inline-block rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-bold">{t("sharedFocus.owner")}</span>}
              </button>
              );
            })}
          </div>}</section>
          {joinOpen && <Dialog title={t("sharedFocus.joinSession")} description={t("sharedFocus.joinDescription")} onClose={() => !joining && setJoinOpen(false)}><label className="mt-5 block text-sm font-bold" htmlFor="join-code">{t("sharedFocus.sessionCode")}</label><input autoFocus dir="ltr" id="join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} placeholder="BEE-____" className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4 font-mono uppercase" />{joinError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{joinError}</p>}<div className="mt-6 flex justify-end gap-3"><OutlineButton disabled={joining} onClick={() => setJoinOpen(false)}>{t("common.cancel")}</OutlineButton><PrimaryButton loading={joining} disabled={!joinCode.trim()} onClick={() => { setJoining(true); setJoinError(""); void joinFocusRoomByCode(accessToken, joinCode).then((joined) => { setJoinOpen(false); onOpenRoom(joined.id); }).catch((cause) => { console.error("Could not join focus room", cause); setJoinError(t("sharedFocusRooms.joinFailed")); }).finally(() => setJoining(false)); }}>{t("sharedFocus.joinSession")}</PrimaryButton></div></Dialog>}
          {createOpen && (
            <Dialog
              title={t("sharedFocus.createSession")}
              onClose={() => setCreateOpen(false)}
            >
              <label
                className="mt-5 block text-sm font-bold"
                htmlFor="room-title"
              >
                {t("sharedFocusRooms.sessionTitle")}
              </label>
              <input
                autoFocus
                id="room-title"
                value={roomTitle}
                onChange={(event) => setRoomTitle(event.target.value)}
                placeholder={t("sharedFocusRooms.enterSessionTitle")}
                className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4"
              />
              <label className="mt-4 block text-sm font-bold" htmlFor="session-duration">{t("sharedFocusRooms.sessionDuration")}</label>
              <input id="session-duration" type="number" list="session-duration-options" min={1} max={480} required value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4" />
              <datalist id="session-duration-options"><option value="25" /><option value="50" /><option value="90" /></datalist>
              <label className="mt-4 block text-sm font-bold" htmlFor="session-goal">{t("sharedFocusRooms.sessionGoal")} <span className="font-normal opacity-65">{t("sharedFocusRooms.optional")}</span></label>
              <input id="session-goal" maxLength={160} value={goalLabel} onChange={(event) => setGoalLabel(event.target.value)} placeholder={t("sharedFocusRooms.goalPlaceholder")} className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4" />
              <p className="mt-4 rounded-xl bg-amber-400/15 p-3 text-sm">
                {t("sharedFocusRooms.createSessionHelp")}
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  className="min-h-11 rounded-xl border px-4"
                  onClick={() => setCreateOpen(false)}
                >
                  {t('common.cancel')}</button>
                <PrimaryButton
                  loading={creating}
                  disabled={!roomTitle.trim() || durationMinutes < 1 || durationMinutes > 480}
                  onClick={() => {
                    setCreating(true); void createFocusRoom(accessToken, {
                      title: roomTitle.trim(),
                      visibility: "private",
                      mode: "commitment",
                    }).then(async (created) => {
                      await createCommitment(accessToken, created.id, {
                        durationMinutes,
                        goalLabel: goalLabel.trim() || undefined,
                        reconnectGraceSeconds: 60,
                      });
                      onOpenRoom(created.id);
                    }).catch((cause) => { console.error("Could not create focus room", cause); setError(t("sharedFocusRooms.createFailed")); }).finally(() => setCreating(false));
                  }}
                >
                  {creating ? t("sharedFocusRooms.creating") : t("sharedFocus.createSession")}
                </PrimaryButton>
              </div>
            </Dialog>
          )}
        </div>
      </main>
    );

  if (!room)
    return <main className="p-8">{error ? t("sharedFocusLobby.roomLoadFailed") : t("sharedFocusLobby.loadingRoom")}</main>;
  const active =
      !!room.commitment && ["active", "break"].includes(room.commitment.status),
    terminal = !!room.commitment && ["completed", "ended_early", "cancelled"].includes(room.commitment.status),
    readyCount = room.members.filter((member) => member.ready).length,
    currentMember = room.members.find(
      (member) => member.userId === room.currentUserId,
    ),
    roomErrorMessage =
      error === "room-load-failed"
        ? t("sharedFocusLobby.roomLoadFailed")
        : error === "session-start-failed"
          ? t("sharedFocusLobby.sessionStartFailed")
          : error;
  return (
    <main className={active ? "min-h-screen w-screen overflow-x-hidden bg-slate-950" : "min-h-screen p-4 md:p-7"}>
      <div className={active ? "min-h-screen w-screen" : "mx-auto max-w-6xl"}>
        {!active && <header className="mb-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <button
              className="min-h-11 rounded-xl border px-4"
              onClick={onBack}
            >
              ← {t("sharedFocusLobby.backToSessions")}
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-black">{room.title}</h1>
                <span className="rounded-full border px-3 py-1 text-xs font-bold">
                  {t(`sharedFocusLobby.roomStatus.${room.commitment?.status ?? "lobby"}`)}
                </span>
              </div>
              <p className="mt-1 text-sm opacity-70">
                {t("sharedFocusLobby.participantsCount", { count: room.members.length })}
              </p>
              {!terminal && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-[var(--bp-surface)] px-3 py-2 text-sm">
                  <span className="font-semibold">{t("sharedFocusRooms.inviteCode")}</span>
                  <code dir="ltr" className="rounded-md bg-[var(--bp-accent-soft)] px-2 py-1 font-bold tracking-wider">{room.joinCode}</code>
                  <OutlineButton size="sm" onClick={() => {
                    void navigator.clipboard.writeText(room.joinCode)
                      .then(() => setNotice(t("sharedFocus.codeCopied")))
                      .catch(() => setError(t("sharedFocus.copyFailed")));
                  }}>{t("sharedFocus.copyCode")}</OutlineButton>
                </div>
              )}
            </div>
            {!terminal && <button
              className="min-h-11 rounded-xl border border-red-500/40 px-4 text-red-600"
              onClick={() =>
                active
                  ? setLeaveOpen(true)
                  : void leaveFocusRoom(accessToken, room.id).then(onBack)
              }
            >
              {t("sharedFocusLobby.leave")}
            </button>}
          </div>
          {!terminal && room.mode === "commitment" && (
            <p className="mt-4 rounded-xl bg-amber-400/15 p-3 text-sm font-semibold">
              {t("sharedFocusLobby.collectiveEndHelp")}
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
            {roomErrorMessage}
          </p>
        )}
        {terminal ? (
          <section className="mx-auto max-w-2xl rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 text-center shadow-sm sm:p-8">
            <div aria-hidden className="mx-auto grid size-10 place-items-center rounded-full bg-[var(--bp-accent-soft)] text-lg text-[var(--bp-accent-ink)]">✓</div>
            <p className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-[var(--bp-muted)]">{t(`sharedFocusLobby.roomStatus.${room.commitment?.status ?? "completed"}`)}</p>
            <h2 className="mt-2 text-2xl font-black">
              {room.commitment?.status === "completed" ? t("sharedFocusLifecycle.complete") : t("sharedFocusLifecycle.endedEarly")}
            </h2>
            <p className="mt-2 text-[var(--bp-muted)]">
              {room.commitment?.status === "completed"
                ? t("sharedFocusLifecycle.completedHelp")
                : room.commitment?.endReason === "owner_ended_session"
                  ? t("sharedFocusLifecycle.endedByOwner")
                  : (() => {
                      const actor = room.members.find((member) => member.userId === room.commitment?.endedByUserId);
                      return actor && !actor.anonymous ? t("sharedFocusLifecycle.endedBecauseLeft", { actor: actor.displayName }) : t("sharedFocusLifecycle.endedBecauseParticipantLeft");
                    })()}
            </p>
            {room.commitment?.goalLabel && <p className="mt-4 text-sm"><strong>{t("sharedFocusLobby.goal")}:</strong> {room.commitment.goalLabel}</p>}
            <p className="mt-6 text-5xl font-black tabular-nums">{clock(Math.max(0, Math.floor((new Date(room.commitment?.endedAt ?? Date.now()).getTime() - new Date(room.commitment?.startedAt ?? room.commitment?.endedAt ?? Date.now()).getTime()) / 1000)))}</p><p className="mt-1 text-sm text-[var(--bp-muted)]">{t("sharedFocusLifecycle.focusedTogether")}</p>
            <dl className="mt-6 grid grid-cols-3 divide-x divide-[var(--bp-border)] text-center"><div><dt className="text-xs text-[var(--bp-muted)]">{t("sharedFocusLifecycle.planned")}</dt><dd className="mt-1 font-black">{t("sharedFocusLifecycle.minutes", { count: room.commitment?.durationMinutes ?? 0 })}</dd></div><div><dt className="text-xs text-[var(--bp-muted)]">{t('sharedFocus.participants')}</dt><dd className="mt-1 font-black">{room.members.length}</dd></div><div><dt className="text-xs text-[var(--bp-muted)]">{t("sharedFocusLifecycle.completedAt")}</dt><dd className="mt-1 font-black">{room.commitment?.endedAt ? new Date(room.commitment.endedAt).toLocaleTimeString(language === "ar" ? "ar" : "en", { hour: "2-digit", minute: "2-digit" }) : "—"}</dd></div></dl>
            <div className="mt-6 border-t border-[var(--bp-border)] pt-5 text-start"><h3 className="font-black">{t('sharedFocus.participants')}</h3>{room.members.map((member) => <div key={member.userId} className="mt-3 flex items-center gap-3"><div className="grid size-9 place-items-center rounded-full bg-[var(--bp-accent-soft)] text-xs font-black text-[var(--bp-accent-ink)]">{member.displayName.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div><div className="min-w-0 flex-1"><p className="font-bold">{member.displayName}</p><p className="text-xs text-[var(--bp-muted)]">{member.role === "owner" ? t("sharedFocusLobby.owner") : t("sharedFocusLobby.participant")}{member.userId === room.currentUserId ? ` · ${t("sharedFocusLobby.you")}` : ""}</p></div><strong>{t("sharedFocusLifecycle.focusedMinutes", { count: member.focusedDurationMinutes ?? 0 })}</strong></div>)}</div>
            <PrimaryButton className="mt-7" onClick={onBack}>{t("sharedFocusLifecycle.returnToSessions")}</PrimaryButton>
          </section>
        ) : active ? (
          <>
          <SharedFocusExperienceAdapter room={room} remainingSeconds={remaining ?? 0} progress={room.commitment?.durationMinutes ? Math.max(0, Math.min(1, 1 - (remaining ?? 0) / (room.commitment.durationMinutes * 60))) : 0} busy={controlBusy} error={controlError} fullscreenSupported={typeof document !== "undefined" && document.fullscreenEnabled} isFullscreen={isFullscreen} onOpenSounds={openFocusSounds} onOpenChat={() => { setChatUnreadCount(0); setChatOpen(true); }} chatUnreadCount={chatUnreadCount} onToggleFullscreen={toggleFullscreen} onPause={() => setPauseConfirm(true)} onResume={() => void sharedControl(() => resumeCommitment(accessToken, room.commitment!.id), Boolean(room.commitment?.pausedAt))} onAddTime={() => setAddTimeOpen(true)} onFinish={() => setLeaveOpen(true)} onCancel={() => setLeaveOpen(true)} soundPanel={isFocusSoundsOpen ? <FocusSoundsPanel activeSound={ambientAudio.activeSound} isPlaying={ambientAudio.isPlaying} muted={ambientAudio.muted} volume={ambientAudio.volume} error={ambientAudio.error} onClose={closeFocusSounds} onMuteToggle={ambientAudio.toggleMuted} onPause={ambientAudio.pause} onPlay={ambientAudio.play} onStop={ambientAudio.stop} onVolumeChange={ambientAudio.setVolume} /> : null} participants={<div className="mt-6 space-y-2">{room.members.map(member => <div key={member.userId} className="flex items-center justify-between rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-2 text-sm text-[var(--bp-text)]"><span>{member.displayName}</span><span className="text-[var(--bp-muted)]">{member.state === "offline" ? t("sharedFocusLifecycle.reconnecting") : t("sharedFocusLifecycle.focusing")}</span></div>)}</div>} />
          <FocusRoomChatPanel open={chatOpen} onClose={() => setChatOpen(false)} room={room} accessToken={accessToken} language={language} messages={chatMessages} mergeMessages={mergeChatMessages} />
          {pauseConfirm && <Dialog title={t("sharedFocusLifecycle.pauseTitle")} description={t("sharedFocusLifecycle.pauseDescription")} onClose={() => !controlBusy && setPauseConfirm(false)}><div className="mt-6 flex justify-end gap-3"><OutlineButton disabled={controlBusy} onClick={() => setPauseConfirm(false)}>{t("sharedFocusLifecycle.keepFocusing")}</OutlineButton><PrimaryButton loading={controlBusy} onClick={() => { setPauseConfirm(false); void sharedControl(() => pauseCommitment(accessToken, room.commitment!.id), !room.commitment?.pausedAt); }}>{t("sharedFocusLifecycle.pauseEveryone")}</PrimaryButton></div></Dialog>}
          {addTimeOpen && <Dialog title={t("sharedFocusLifecycle.addTimeTitle")} description={t("sharedFocusLifecycle.addTimeDescription")} onClose={() => !controlBusy && setAddTimeOpen(false)}><div className="mt-6 flex flex-wrap justify-end gap-3">{[5, 10, 15].map((minutes) => <PrimaryButton key={minutes} loading={controlBusy} disabled={controlBusy} onClick={() => { setAddTimeOpen(false); void sharedControl(() => extendCommitment(accessToken, room.commitment!.id, minutes), room.commitment?.status === "active"); }}>{t("sharedFocusLifecycle.minutesToAdd", { count: minutes })}</PrimaryButton>)}<OutlineButton disabled={controlBusy} onClick={() => setAddTimeOpen(false)}>{t('common.cancel')}</OutlineButton></div></Dialog>}
          </>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(18rem,.8fr)]">
            <div className="space-y-5">
              <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider opacity-65">
                      {t("sharedFocusLobby.sharedFocus")}
                    </p>
                    <p className="mt-2 text-5xl font-black tabular-nums">
                      {remaining == null
                        ? clock((room.commitment?.durationMinutes ?? 25) * 60)
                        : clock(remaining)}
                    </p>
                    <p className="mt-3 font-semibold">
                      {room.commitment
                        ? t("sharedFocusLobby.readyCount", { ready: readyCount, total: room.members.length })
                        : t("sharedFocusLobby.participantsInRoom", { count: room.members.length })}
                    </p>
                    {room.commitment?.goalLabel && <p className="mt-2"><strong>{t("sharedFocusLobby.goal")}:</strong> {room.commitment.goalLabel}</p>}
                  </div>
                  <span className="rounded-full bg-[var(--bp-accent-soft)] px-3 py-2 text-sm font-bold text-[var(--bp-accent-ink)]">
                    {t(`sharedFocusLobby.roomStatus.${room.commitment?.status ?? "open"}`)}
                  </span>
                </div>
                {room.mode === "commitment" && room.commitment && !active && (
                  <div className="mt-6 border-t border-[var(--bp-border)] pt-5">
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--bp-muted)]"><span>{t("sharedFocusLobby.durationFocus", { count: room.commitment.durationMinutes })}</span><span>{room.commitment.breakMinutes ? t("sharedFocusLobby.durationBreak", { count: room.commitment.breakMinutes }) : t("sharedFocusLobby.noBreak")}</span><span>{t("sharedFocusLobby.reconnectGrace", { count: room.commitment.reconnectGraceSeconds })}</span></div>
                    <h2 className="mt-5 font-black">{t("sharedFocusLobby.stayTogether")}</h2>
                    <p className="my-2 text-sm text-[var(--bp-muted)]">{t("sharedFocusLobby.collectiveEndHelp")}</p>
                    <p className="mt-3 text-sm font-semibold">
                      {t("sharedFocusLobby.sessionStartsWhenReady")}
                    </p>
                    <label className="mt-4 flex min-h-11 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={accepted || currentMember?.acceptedAgreement}
                        onChange={(event) => setAccepted(event.target.checked)}
                        disabled={currentMember?.acceptedAgreement}
                      />{" "}
                      {t("sharedFocusLobby.acceptCollectiveEnd")}
                    </label>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <PrimaryButton
                        disabled={
                          Boolean(currentMember?.ready) ||
                          (!accepted && !currentMember?.acceptedAgreement)
                        }
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
                        {currentMember?.ready ? t("sharedFocusLobby.ready") : t("sharedFocusLobby.imReady")}
                      </PrimaryButton>
                      {room.ownerUserId === room.currentUserId && (
                        <OutlineButton
                          disabled={!room.members.length || readyCount !== room.members.length}
                          onClick={() =>
                            void startCommitment(
                              accessToken,
                              room.commitment!.id,
                            )
                              .then(setRoom)
                              .catch((cause) => { console.error("Could not start commitment", cause); setError("session-start-failed"); })
                          }
                        >
                          {t("sharedFocusLobby.startSession")}</OutlineButton>
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
                      {t("sharedFocusLobby.setUpSession")}
                    </button>
                  )}
              </section>
              <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-lg font-black">{t('sharedFocus.participants')}</h2>
                  <span className="text-sm text-[var(--bp-muted)]">
                    {room.members.length}
                  </span>
                </div>
                <div className="divide-y divide-[var(--bp-border)]">
                  {room.members.map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div
                        aria-hidden="true"
                        className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--bp-accent-soft)] text-sm font-black text-[var(--bp-accent-ink)]"
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
                        <p className="text-xs text-[var(--bp-muted)]">
                          {member.role === "owner" ? t("sharedFocusLobby.owner") : t("sharedFocusLobby.participant")}
                          {member.userId === room.currentUserId ? ` · ${t("sharedFocusLobby.you")}` : ""}
                        </p>
                      </div>
                      <span className={`text-xs font-bold ${member.ready ? "text-[var(--bp-success)]" : "text-[var(--bp-muted)]"}`}>
                        {member.ready ? t("sharedFocusLobby.ready") : room.commitment?.status === "lobby" ? t("sharedFocusLobby.preparing") : t("sharedFocusLobby.notReady")}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <aside className="space-y-5">
              <section className="hidden rounded-2xl border p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black">{t("sharedFocusRooms.pendingInvitations")}</h2>
                  {room.canManageInvitations && (
                    <button
                      className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950"
                      onClick={() => {
                        setInviteOpen(true);
                        setInviteLink("");
                        setInviteError("");
                      }}
                    >
                      {t("sharedFocusRooms.createInvite")}
                    </button>
                  )}
                </div>
                {managedInvites.length === 0 ? (
                  <p className="mt-4 text-sm opacity-60">{t("sharedFocusRooms.noPendingInvitations")}</p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {managedInvites.map((invite) => (
                      <div
                        key={invite.id}
                        className="rounded-xl bg-black/5 p-3 dark:bg-white/5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <strong className="truncate">
                            {invite.label ?? t("sharedFocusRooms.inviteLink")}
                          </strong>
                          <span className="rounded-full border px-2 py-1 text-xs">
                            {t(`sharedFocusRooms.invitationStatus.${invite.status}`)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs opacity-65">
                          {t("sharedFocusRooms.sentAt", { date: new Date(invite.sentAt).toLocaleString(language === "ar" ? "ar" : "en") })}
                          <br />
                          {t("sharedFocusRooms.expiresAt", { date: new Date(invite.expiresAt).toLocaleString(language === "ar" ? "ar" : "en") })}
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
                            {t("sharedFocusRooms.revoke")}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <section className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5">
                <h2 className="text-lg font-black">{t("sharedFocusLifecycle.activity")}</h2>
                <div className="mt-4 space-y-3">
                  {room.events.length === 0 ? (
                    <p className="text-sm opacity-60">{t("sharedFocusLifecycle.noActivity")}</p>
                  ) : (
                    room.events.map((event) => (
                      <div key={event.id} className="flex gap-3 text-sm">
                        <span aria-hidden="true">●</span>
                        <div>
                          <p>{eventMessage(event, room, t)}</p>
                          <time className="text-xs opacity-60">
                            {new Date(event.createdAt).toLocaleTimeString(language === "ar" ? "ar" : "en", {
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
            title={t("sharedFocusRooms.inviteTitle")}
            description={t("sharedFocusRooms.inviteDescription")}
            onClose={() => !sending && setInviteOpen(false)}
          >
            <div
              className="mt-5 grid grid-cols-2 gap-2"
              role="tablist"
              aria-label={t("sharedFocusRooms.invitationType")}
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
                {t("sharedFocusRooms.inviteByEmail")}
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
                {t("sharedFocusRooms.createInviteLink")}
              </button>
            </div>
            {inviteType === "email" ? (
              <>
                <label
                  htmlFor="invite-email"
                  className="mt-5 block text-sm font-bold"
                >
                  {t("sharedFocusRooms.emailAddress")}
                </label>
                <input
                  autoFocus
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={Boolean(inviteError)}
                  aria-describedby={inviteError ? "invite-error" : undefined}
                  placeholder={t("auth.emailPlaceholder")}
                  dir="ltr"
                  className="mt-2 min-h-12 w-full rounded-xl border bg-transparent px-4"
                />
              </>
            ) : (
              <p className="mt-5 rounded-xl bg-black/5 p-4 text-sm dark:bg-white/5">
                {t("sharedFocusRooms.inviteLinkHelp")}
              </p>
            )}
            <label
              htmlFor="invite-expiry"
              className="mt-4 block text-sm font-bold"
            >
              {t("sharedFocusRooms.expiresAfter")}
            </label>
            <select
              id="invite-expiry"
              value={expires}
              onChange={(event) => setExpires(Number(event.target.value))}
              className="mt-2 min-h-12 w-full rounded-xl border bg-white px-4 dark:bg-slate-900"
            >
              <option value={1}>{t("sharedFocusRooms.oneHour")}</option>
              <option value={24}>{t("sharedFocusRooms.hours", { count: 24 })}</option>
              <option value={72}>{t("sharedFocusRooms.days", { count: 3 })}</option>
              <option value={168}>{t("sharedFocusRooms.days", { count: 7 })}</option>
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
                  {t("sharedFocusRooms.inviteLink")}
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="invite-link"
                    readOnly
                    value={inviteLink}
                    dir="ltr"
                    className="min-h-11 min-w-0 flex-1 rounded-lg border bg-transparent px-3"
                  />
                  <button
                    className="min-h-11 rounded-lg border px-3"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(inviteLink)
                        .then(() => setNotice(t("sharedFocusRooms.inviteLinkCopied")))
                    }
                  >
                    {t("sharedFocusRooms.copy")}
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
                {t('common.cancel')}</button>
              <button
                disabled={sending || (inviteType === "email" && !email.trim())}
                className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950 disabled:opacity-50"
                onClick={() => void sendInvite()}
              >
                {sending
                  ? t("sharedFocusRooms.sending")
                  : inviteType === "email"
                    ? t("sharedFocusRooms.sendInvite")
                    : t("sharedFocusRooms.createLink")}
              </button>
            </div>
          </Dialog>
        )}
        {leaveOpen && (
          <Dialog
            title={t("sharedFocusLifecycle.endSessionTitle")}
            description={t("sharedFocusLifecycle.endSessionDescription")}
            onClose={() => !leaving && setLeaveOpen(false)}
          >
            <p className="mt-4 text-sm">
              {t("sharedFocusLifecycle.remainingAffected", { time: clock(remaining ?? 0), count: room.members.length })}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                autoFocus
                className="min-h-11 rounded-xl border px-4"
                disabled={leaving}
                onClick={() => setLeaveOpen(false)}
              >
                {t("sharedFocusLifecycle.stayInSession")}
              </button>
              <button
                className="min-h-11 rounded-xl bg-red-600 px-4 font-bold text-white"
                disabled={leaving}
                onClick={() => {
                  setLeaving(true);
                  setLeaveError("");
                  void leaveFocusRoom(accessToken, room.id, {
                    commandId: crypto.randomUUID(),
                    reason: "participant_left_early",
                  }).then(() => {
                    setLeaveOpen(false);
                    return refresh();
                  }).catch((cause) => {
                    console.error("Could not end shared focus session", cause);
                    setLeaveError("leave-failed");
                  }).finally(() => setLeaving(false));
                }}
              >
                {leaving ? t("sharedFocusLifecycle.ending") : t("sharedFocusLifecycle.endForEveryone")}
              </button>
            </div>
            {leaveError && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{t("sharedFocusLifecycle.leaveFailed")}</p>}
          </Dialog>
        )}
      </div>
    </main>
  );
}
