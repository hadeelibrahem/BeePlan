import type { ReactNode } from 'react';

export type FocusExperienceViewProps = {
  title: string;
  goal?: string | null;
  durationMinutes: number;
  remainingSeconds: number;
  progress: number;
  isPaused: boolean;
  participants?: ReactNode;
  soundControl?: ReactNode;
  onPause?: () => void;
  onResume?: () => void;
  onAddTime?: () => void;
  onFinish?: () => void;
  onCancel?: () => void;
  children?: ReactNode;
  state?: 'active' | 'paused' | 'break' | 'completion';
  priority?: string | null;
  category?: string | null;
  busy?: boolean;
  error?: string | null;
  fullscreenControl?: ReactNode;
  insights?: ReactNode;
  breakContent?: ReactNode;
  completionContent?: ReactNode;
};

export function FocusExperienceView({ title, goal, durationMinutes, remainingSeconds, progress, isPaused, participants, soundControl, onPause, onResume, onAddTime, onFinish, onCancel, children, state = 'active', priority, category, busy = false, error, fullscreenControl, insights, breakContent, completionContent }: FocusExperienceViewProps) {
  const minutes = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
  const seconds = (remainingSeconds % 60).toString().padStart(2, '0');
  const circumference = 283;
  return <section data-testid="focus-experience" className={`relative flex min-h-screen w-screen flex-col items-center justify-center overflow-x-hidden px-4 py-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-center ${isPaused ? 'bg-[radial-gradient(circle_at_center,_rgba(59,130,246,.28),_rgba(15,23,42,.98)_62%)]' : 'bg-[radial-gradient(circle_at_center,_rgba(251,191,36,.3),_rgba(15,23,42,.98)_62%)]'}`}>
    <div className="flex items-center justify-center gap-3"><p className="text-xs font-black uppercase tracking-[.25em] text-amber-200">BeePlan Focus · {title}</p>{fullscreenControl}</div>
    {goal ? <h1 className="mt-3 text-2xl font-black text-white">{goal}</h1> : null}
    {(priority || category) ? <p className="mt-2 text-xs font-bold uppercase tracking-widest text-slate-300">{[priority, category].filter(Boolean).join(' · ')}</p> : null}
    <p className="mt-2 text-sm text-slate-300">{durationMinutes} minute session</p>
    {state === 'break' && breakContent ? breakContent : state === 'completion' && completionContent ? completionContent : <div className="relative mx-auto mt-8 grid size-72 place-items-center sm:size-96"><svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="2"/><circle cx="50" cy="50" r="45" fill="none" stroke={isPaused ? '#60a5fa' : '#fbbf24'} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={`${Math.max(0, Math.min(circumference, progress * circumference))} ${circumference}`} /></svg><p className="relative text-7xl font-black tabular-nums tracking-tight text-white">{minutes}:{seconds}</p></div>}
    <p className={`mt-2 text-sm font-black uppercase tracking-widest ${isPaused ? 'text-blue-300' : 'text-amber-200'}`}>{isPaused ? 'Paused for everyone' : 'Focusing together'} · {Math.round(progress * 100)}%</p>
    {participants ? <div className="mt-6">{participants}</div> : null}
    {soundControl ? <div className="mt-5">{soundControl}</div> : null}
    {state === 'active' || state === 'paused' ? <div className="mt-6 flex flex-wrap justify-center gap-3">{isPaused ? <button disabled={busy} className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-slate-950 disabled:opacity-50" onClick={onResume}>Resume</button> : <button disabled={busy} className="min-h-11 rounded-xl border px-4 font-bold text-white disabled:opacity-50" onClick={onPause}>Pause</button>}{onAddTime ? <button disabled={busy} className="min-h-11 rounded-xl border px-4 font-bold text-white disabled:opacity-50" onClick={onAddTime}>Add time</button> : null}{onFinish ? <button disabled={busy} className="min-h-11 rounded-xl border border-red-300/40 px-4 font-bold text-red-200 disabled:opacity-50" onClick={onFinish}>Finish</button> : null}{onCancel ? <button disabled={busy} className="min-h-11 rounded-xl border px-4 font-bold text-white disabled:opacity-50" onClick={onCancel}>Cancel</button> : null}</div> : null}
    {error ? <p className="mt-4 text-sm font-bold text-red-300">{error}</p> : null}
    {insights ? <div className="mt-6">{insights}</div> : null}
    {children}
  </section>;
}
