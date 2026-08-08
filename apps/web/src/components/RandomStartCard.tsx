import { useMemo, useState } from "react";
import { Dices, ExternalLink, Loader2, X } from "lucide-react";
import { changeTaskStatus, getRandomStart, updateSubtask, type RandomStartItem, type RandomStartMode } from "../lib/tasksApi";
import { SectionCard } from "./layout";

const WHEEL_LIMIT = 12;
const WHEEL_COLORS = ["#fff178", "#fffbed", "#ffe96a", "#fffdf4"];
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function Wheel({ candidates, rotation, spinning }: { candidates: RandomStartItem[]; rotation: number; spinning: boolean }) {
  const slice = 360 / candidates.length;
  const gradient = candidates.map((_, index) => `${WHEEL_COLORS[index % WHEEL_COLORS.length]} ${index * slice}deg ${(index + 1) * slice}deg`).join(", ");
  return <div className="relative mx-auto aspect-square w-[min(82vw,440px)] max-w-full">
    <div className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 text-4xl leading-none text-[var(--bp-brand-dark)] drop-shadow-md">▼</div>
    <div className="h-full w-full rounded-full border-[5px] border-[#ffed85] p-2 shadow-[0_15px_38px_rgba(160,125,0,.18)]">
      <div className="relative h-full w-full overflow-hidden rounded-full border border-[#f5df66]" style={{ background: `conic-gradient(from 0deg, ${gradient})`, transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 2.4s cubic-bezier(.12,.74,.16,1)" : "transform .35s ease-out" }}>
        {candidates.map((candidate, index) => { const angle = index * slice + slice / 2; return <div key={candidate.candidateKey} className="absolute left-1/2 top-1/2 flex w-[28%] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center text-[clamp(9px,1.7vw,14px)] font-black leading-tight text-[var(--bp-brand-dark)]" style={{ transform: `rotate(${angle}deg) translateY(-${Math.min(145, Math.max(82, candidates.length * 11))}px) rotate(${-angle}deg)` }}><span aria-hidden>{candidate.itemType === "subtask" ? "▣" : "●"}</span><span className="line-clamp-3 break-words">{candidate.title}</span></div>; })}
        <div className="absolute left-1/2 top-1/2 grid h-[24%] w-[24%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#fff4a5] bg-[var(--bp-accent)] text-4xl shadow-[0_5px_16px_rgba(80,60,0,.2)]">🐝</div>
      </div>
    </div>
  </div>;
}

export function RandomStartCard({ accessToken, onOpenTask, onCreateTask }: { accessToken: string; onOpenTask: (id: string) => void; onCreateTask?: () => void }) {
  const [task, setTask] = useState<RandomStartItem | null>(null); const [candidates, setCandidates] = useState<RandomStartItem[]>([]); const [rotation, setRotation] = useState(0);
  const [mode, setMode] = useState<RandomStartMode>("anything"); const [loading, setLoading] = useState(false); const [visible, setVisible] = useState(false); const [error, setError] = useState(""); const [lastId, setLastId] = useState<string>();
  const [spinning, setSpinning] = useState(false);
  const wheelCandidates = useMemo(() => { if (candidates.length <= WHEEL_LIMIT || !task) return candidates; const first = candidates.slice(0, WHEEL_LIMIT - 1); return first.some((item) => item.candidateKey === task.candidateKey) ? first : [...first, task]; }, [candidates, task]);

  async function spin() {
    if (loading) return;
    setLoading(true); setSpinning(true); setError(""); setTask(null); setCandidates([]); setVisible(true);
    try {
      const result = await getRandomStart(accessToken, mode, lastId);
      if (!result.task || !result.candidates.length) { setTask(null); setCandidates([]); setSpinning(false); setLoading(false); return; }
      setTask(result.task); setLastId(result.task.candidateKey); setCandidates(result.candidates);
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
      const items = result.candidates.length <= WHEEL_LIMIT ? result.candidates : result.candidates.slice(0, WHEEL_LIMIT - 1).some((item) => item.candidateKey === result.task!.candidateKey) ? result.candidates.slice(0, WHEEL_LIMIT - 1) : [...result.candidates.slice(0, WHEEL_LIMIT - 1), result.task];
      const index = items.findIndex((item) => item.candidateKey === result.task!.candidateKey); const slice = 360 / items.length; const target = 360 - (index * slice + slice / 2); const current = rotation; const delta = ((target - (current % 360) + 360) % 360) + (reduced ? 0 : (items.length === 1 ? 360 : 360 * 5));
      await wait(30);
      setRotation(current + delta);
      await wait(reduced ? 280 : items.length === 1 ? 850 : 2450);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to find a task."); setSpinning(false); }
    finally { setSpinning(false); setLoading(false); }
  }
  async function start() { if (!task || loading) return; setLoading(true); try { if (task.itemType === "subtask") await updateSubtask(accessToken, task.taskId!, task.id, { status: "in_progress", isDone: false }); else await changeTaskStatus(accessToken, task.id, { status: "in_progress", progress: Math.max(task.progress, 1) }); onOpenTask(task.taskId ?? task.id); } catch (e) { setError(e instanceof Error ? e.message : "Unable to start this task."); } finally { setLoading(false); } }
  const close = () => { if (!loading) { setVisible(false); setTask(null); setCandidates([]); setError(""); } };
  return <>
    <SectionCard className="border-[var(--bp-accent)]/20 bg-gradient-to-br from-[var(--bp-surface)] to-[var(--bp-accent)]/5"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex items-center gap-2"><Dices size={18} className="text-[var(--bp-accent-ink)]" /><h2 className="text-base font-black">Random Start</h2></div><p className="mt-1 text-sm text-[var(--bp-muted)]">Don’t know where to start? Let BeePlan pick something for you.</p></div><button onClick={() => void spin()} disabled={loading} className="rounded-xl bg-[var(--bp-accent)] px-4 py-2.5 text-sm font-black text-[var(--bp-accent-text)] disabled:opacity-60">{loading ? <Loader2 className="animate-spin" size={16} /> : "Random Start"}</button></div></SectionCard>
    {visible ? <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Your Random Start"><div className="w-full max-w-4xl rounded-[32px] border border-[var(--bp-border)] bg-[var(--bp-surface)] p-5 shadow-2xl sm:p-8"><div className="flex items-start justify-between"><div><p className="text-xs font-black uppercase tracking-[.2em] text-[#7c6500]">Your Random Start</p><h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Let’s pick something for you</h2><p className="mt-2 text-sm text-[var(--bp-muted)]">{spinning ? "Spinning through your available tasks…" : "Your next step is ready."}</p></div><button onClick={close} disabled={loading} aria-label="Close"><X size={24} /></button></div>{error ? <div className="py-16 text-center"><p className="text-lg font-black">Nothing to pick right now</p><button onClick={onCreateTask} className="mt-5 rounded-xl bg-[var(--bp-accent)] px-5 py-3 font-black">Create Task</button></div> : wheelCandidates.length ? <><div className="mt-8"><Wheel candidates={wheelCandidates} rotation={rotation} spinning={spinning} /></div><div className="mt-5 text-center"><p className="text-lg font-black">{spinning ? "Spinning…" : "Your pick"}</p><p className="mt-1 text-sm text-[var(--bp-muted)]">{spinning ? "We’ll stop on one for you" : task?.parentTitle ? `${task.title} · ${task.parentTitle}` : task?.title}</p></div>{!spinning && task ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2"><select value={mode} onChange={(event) => setMode(event.target.value as RandomStartMode)} disabled={loading} className="rounded-xl border border-[var(--bp-border)] bg-transparent px-3 py-2 text-sm"><option value="anything">Anything</option><option value="quick_win">Quick Win</option><option value="important">Important</option></select><button onClick={() => void spin()} disabled={loading} className="rounded-xl border border-[var(--bp-border)] px-4 py-2 text-sm font-black">🎲 Spin Again</button><button onClick={() => void start()} disabled={loading} className="rounded-xl bg-[var(--bp-accent)] px-5 py-2 font-black">Start Task</button><button onClick={() => onOpenTask(task.taskId ?? task.id)} disabled={loading} className="flex items-center gap-1 px-3 py-2 text-sm font-bold text-[var(--bp-muted)]">View Task <ExternalLink size={14} /></button></div> : null}</> : <div className="py-16 text-center"><p className="text-lg font-black">Let’s pick something for you</p><p className="mt-2 text-sm text-[var(--bp-muted)]">Loading your available tasks…</p></div>}</div></div> : null}
  </>;
}
