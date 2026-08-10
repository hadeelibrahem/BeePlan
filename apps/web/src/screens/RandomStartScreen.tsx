import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, Dices, ExternalLink, Loader2, Search, Target, X } from 'lucide-react'
import { getRandomStart, type RandomStartItem } from '../lib/tasksApi'
import { PageHeader, SectionCard } from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { buildWheel, EMPTY_FILTERS, isRtlLabel, pickRandom, type WheelFilters, type WheelMode } from '../features/randomStart/randomStartLogic'

const COLORS = ['#fff178', '#fffbed', '#ffe96a', '#fffdf4']
const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

const copy = {
  en: { title: 'Random Start', subtitle: "Can't decide what to do next? Build your wheel and let BeePlan choose.", all: 'All Tasks', allDesc: 'Spin all eligible tasks.', pick: 'Pick Tasks', pickDesc: 'Choose specific tasks yourself.', filter: 'Filter Tasks', filterDesc: 'Build the wheel using task properties.', weighted: 'Weighted by priority', spin: 'Spin', next: 'Your next task', focus: 'Start Focus', again: 'Spin Again', view: 'View Task', remove: 'Remove from wheel & spin again', none: 'No tasks are available for Random Start.', choose: 'Choose at least two tasks to build your wheel.', matches: 'No tasks match these filters.', search: 'Search tasks', selectAll: 'Select All', clear: 'Clear' },
  ar: { title: 'ابدأ عشوائيًا', subtitle: 'مش عارف بأي مهمة تبدأ؟ جهّز عجلة المهام ودع BeePlan يختار لك.', all: 'كل المهام', allDesc: 'أدر كل المهام المتاحة.', pick: 'اختر المهام', pickDesc: 'اختر مهام محددة بنفسك.', filter: 'تصفية المهام', filterDesc: 'جهّز العجلة باستخدام خصائص المهام.', weighted: 'ترجيح حسب الأولوية', spin: 'ابدأ الدوران', next: 'مهمتك التالية', focus: 'ابدأ التركيز', again: 'أدر مرة أخرى', view: 'عرض المهمة', remove: 'استبعدها وأدر مرة أخرى', none: 'لا توجد مهام متاحة للبدء العشوائي.', choose: 'اختر مهمتين على الأقل لتجهيز العجلة.', matches: 'لا توجد مهام تطابق هذه التصفيات.', search: 'ابحث في المهام', selectAll: 'اختر الكل', clear: 'مسح' },
}

function Wheel({ items, rotation, spinning }: { items: RandomStartItem[]; rotation: number; spinning: boolean }) {
  const slice = items.length ? 360 / items.length : 360
  const gradient = items.length ? items.map((_, i) => `${COLORS[i % COLORS.length]} ${i * slice}deg ${(i + 1) * slice}deg`).join(',') : '#fffbed'
  return <div className="relative mx-auto aspect-square w-[min(78vw,430px)]" role="img" aria-label={`Random task wheel with ${items.length} tasks`}>
    <div className="absolute -top-3 left-1/2 z-20 -translate-x-1/2 text-4xl text-[var(--bp-brand-dark)]">▼</div>
    <div className="h-full rounded-full border-[6px] border-[#ffed85] p-2 shadow-[0_18px_45px_rgba(160,125,0,.2)]">
      <div className="relative h-full overflow-hidden rounded-full border border-[#f5df66]" style={{ background: `conic-gradient(${gradient})`, transform: `rotate(${rotation}deg)`, transition: spinning ? 'transform 2.4s cubic-bezier(.12,.74,.16,1)' : 'none' }}>
        {items.map((item, i) => { const angle = i * slice + slice / 2; return <div key={item.candidateKey} dir={isRtlLabel(item.title) ? 'rtl' : 'ltr'} className="absolute left-1/2 top-1/2 w-[30%] -translate-x-1/2 -translate-y-1/2 text-center text-[clamp(9px,1.3vw,13px)] font-black leading-tight text-[#3b3500]" style={{ transform: `rotate(${angle}deg) translateY(-140px) rotate(${-angle}deg)` }}><span className="line-clamp-2 break-words">{item.title}</span></div> })}
        <div className="absolute left-1/2 top-1/2 grid h-[23%] w-[23%] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-[#fff4a5] bg-[var(--bp-accent)] text-4xl">🐝</div>
      </div>
    </div>
  </div>
}

function DependencyInfo({ task, language, result = false }: { task: RandomStartItem; language: 'en' | 'ar'; result?: boolean }) {
  const count = task.incompleteDependencyCount ?? 0
  if (!count) return null
  const titles = task.dependencyTitles?.join('، ')
  const text = language === 'ar' ? (titles ? `تعتمد على: ${titles}` : `${count} تبعية غير مكتملة`) : (titles ? `Depends on: ${titles}` : `${count} incomplete ${count === 1 ? 'dependency' : 'dependencies'}`)
  return <p className={`${result ? 'mt-3 rounded-xl bg-amber-400/10 p-3 text-sm' : 'mt-1 text-xs'} text-[var(--bp-muted)]`}>⚠ {text}{result ? <span className="mt-1 block">{language === 'ar' ? 'ما زال بإمكانك اختيار ما تريد فعله.' : 'You can still choose what you want to do.'}</span> : null}</p>
}

export default function RandomStartScreen({ accessToken, onBack, onViewTask, onStartFocus }: { accessToken: string; onBack: () => void; onViewTask: (id: string) => void; onStartFocus: (task: RandomStartItem) => Promise<void> }) {
  const { language, isRTL, formatNumber } = useLanguage(); const c = copy[language]
  const [all, setAll] = useState<RandomStartItem[]>([]); const [mode, setMode] = useState<WheelMode>('all'); const [selected, setSelected] = useState(new Set<string>()); const [excluded, setExcluded] = useState(new Set<string>()); const [filters, setFilters] = useState<WheelFilters>(EMPTY_FILTERS); const [weighted, setWeighted] = useState(false); const [query, setQuery] = useState(''); const [result, setResult] = useState<RandomStartItem | null>(null); const [shown, setShown] = useState<RandomStartItem[]>([]); const [rotation, setRotation] = useState(0); const [spinning, setSpinning] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { let live = true; setLoading(true); getRandomStart(accessToken).then((response) => { if (!live) return; setAll(response.candidates); setSelected(new Set(response.candidates.map(x => x.candidateKey))); setShown(response.candidates.slice(0, 12)) }).catch((e) => live && setError(e instanceof Error ? e.message : c.none)).finally(() => live && setLoading(false)); return () => { live = false } }, [accessToken, c.none])
  const eligible = useMemo(() => buildWheel(all, mode, selected, filters, excluded), [all, mode, selected, filters, excluded])
  useEffect(() => { if (!spinning && eligible.length === 1) { setResult(eligible[0]); setShown(eligible) } }, [eligible, spinning])
  const visibleTasks = useMemo(() => all.filter((task) => task.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [all, query])
  const invalid = spinning || loading || eligible.length < 2
  const setFilter = (group: keyof WheelFilters, value: string) => setFilters((current) => ({ ...current, [group]: current[group].includes(value) ? current[group].filter(x => x !== value) : [...current[group], value] }))
  async function spin(exclude?: RandomStartItem) {
    if (spinning) return
    const nextExcluded = exclude ? new Set([...excluded, exclude.candidateKey]) : excluded
    if (exclude) setExcluded(nextExcluded)
    const pool = buildWheel(all, mode, selected, filters, nextExcluded); const picked = pickRandom(pool, weighted)
    if (!picked) { setResult(pool[0] ?? null); return }
    if (pool.length === 1) { setResult(pool[0]); setShown(pool); return }
    setSpinning(true); setResult(null)
    const wheel = pool.length <= 12 ? pool : [...pool.slice(0, 11).filter(x => x.candidateKey !== picked.candidateKey), picked].slice(0, 12)
    setShown(wheel); const index = wheel.findIndex(x => x.candidateKey === picked.candidateKey); const slice = 360 / wheel.length; const target = 360 - (index * slice + slice / 2); const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; const delta = ((target - (rotation % 360) + 360) % 360) + (reduced ? 0 : 1800)
    await wait(30); setRotation(v => v + delta); await wait(reduced ? 80 : 2450); setResult(picked); setSpinning(false)
  }
  async function startFocus() { if (result) await onStartFocus(result) }
  const emptyMessage = !all.length ? c.none : mode === 'pick' && eligible.length < 2 ? c.choose : mode === 'filter' && !eligible.length ? c.matches : ''
  return <main className="mx-auto w-[min(94vw,1240px)] pb-10" dir={isRTL ? 'rtl' : 'ltr'}>
    <PageHeader title={c.title} subtitle={c.subtitle} toolbar={<button onClick={onBack} className="flex items-center gap-2 rounded-xl border border-[var(--bp-border)] px-3 py-2 text-sm font-bold"><ArrowLeft className={isRTL ? 'rotate-180' : ''} size={16} />{language === 'ar' ? 'رجوع' : 'Back'}</button>} />
    <div className="mb-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label={c.title}>{(['all','pick','filter'] as WheelMode[]).map(value => <button key={value} role="radio" aria-checked={mode === value} onClick={() => { setMode(value); setResult(null) }} className={`rounded-2xl border p-4 text-start transition ${mode === value ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/10 shadow-lg' : 'border-[var(--bp-border)] bg-[var(--bp-surface)]'}`}><span className="flex items-center gap-2 font-black">{mode === value ? <Check size={17} /> : <Dices size={17} />}{value === 'all' ? c.all : value === 'pick' ? c.pick : c.filter}</span><span className="mt-1 block text-xs text-[var(--bp-muted)]">{value === 'all' ? c.allDesc : value === 'pick' ? c.pickDesc : c.filterDesc}</span></button>)}</div>
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,.85fr)_minmax(440px,1.15fr)]">
      <SectionCard>
        <div className="flex items-center justify-between"><h2 className="font-black">{mode === 'all' ? c.all : mode === 'pick' ? c.pick : c.filter}</h2><span className="rounded-full bg-[var(--bp-accent)]/15 px-3 py-1 text-xs font-bold">{formatNumber(eligible.length)} {language === 'ar' ? 'مهمة' : 'tasks'}</span></div>
        {mode === 'pick' ? <div className="mt-4"><label className="flex items-center gap-2 rounded-xl border border-[var(--bp-border)] px-3"><Search size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder={c.search} className="w-full bg-transparent py-3 outline-none" /></label><div className="mt-3 flex gap-3 text-sm"><button className="font-bold text-[var(--bp-accent-ink)]" onClick={() => setSelected(new Set(all.map(x => x.candidateKey)))}>{c.selectAll}</button><button className="text-[var(--bp-muted)]" onClick={() => setSelected(new Set())}>{c.clear}</button></div><div className="mt-3 max-h-80 space-y-2 overflow-auto">{visibleTasks.map(task => <label key={task.candidateKey} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--bp-border)] p-3"><input type="checkbox" checked={selected.has(task.candidateKey)} onChange={() => setSelected(s => { const n = new Set(s); n.has(task.candidateKey) ? n.delete(task.candidateKey) : n.add(task.candidateKey); return n })} /><span className="min-w-0 flex-1"><span className="block truncate font-bold" dir={isRtlLabel(task.title) ? 'rtl' : 'ltr'}>{task.title}</span><span className="text-xs capitalize text-[var(--bp-muted)]">{task.priority}{task.estimatedTimeMinutes ? ` · ${task.estimatedTimeMinutes} min` : ''}{task.dueDate ? ` · ${new Date(task.dueDate).toLocaleDateString(language)}` : ''}</span><DependencyInfo task={task} language={language} /></span></label>)}</div></div> : null}
        {mode === 'filter' ? <div className="mt-4 space-y-5">{([['priorities', language === 'ar' ? 'الأولوية' : 'Priority', [['high', language === 'ar' ? 'عالية' : 'High'],['medium', language === 'ar' ? 'متوسطة' : 'Medium'],['low', language === 'ar' ? 'منخفضة' : 'Low']]],['due', language === 'ar' ? 'الموعد' : 'Due', [['today', language === 'ar' ? 'اليوم' : 'Today'],['week', language === 'ar' ? 'هذا الأسبوع' : 'This Week'],['none', language === 'ar' ? 'بدون موعد' : 'No Deadline']]],['durations', language === 'ar' ? 'المدة' : 'Estimated time', [['under30','Under 30 min'],['30to60','30–60 min'],['over60','1h+']]]] as const).map(([group,label,values]) => <fieldset key={group}><legend className="mb-2 text-sm font-black">{label}</legend><div className="flex flex-wrap gap-2">{values.map(([value,text]) => <button key={value} aria-pressed={filters[group].includes(value)} onClick={() => setFilter(group,value)} className={`rounded-full border px-3 py-2 text-xs font-bold ${filters[group].includes(value) ? 'border-[var(--bp-accent)] bg-[var(--bp-accent)]/15' : 'border-[var(--bp-border)]'}`}>{text}</button>)}</div></fieldset>)}</div> : <p className="mt-4 text-sm text-[var(--bp-muted)]">{mode === 'all' ? c.allDesc : `${formatNumber(selected.size)} ${language === 'ar' ? 'محدد' : 'selected'}`}</p>}
        <label className="mt-6 flex cursor-pointer items-center justify-between rounded-xl border border-[var(--bp-border)] p-3"><span><span className="block font-bold">{c.weighted}</span><span className="text-xs text-[var(--bp-muted)]">High 3× · Medium 2× · Low 1×</span></span><input type="checkbox" checked={weighted} onChange={e => setWeighted(e.target.checked)} /></label>
      </SectionCard>
      <SectionCard className="text-center"><Wheel items={shown.length ? shown : eligible.slice(0,12)} rotation={rotation} spinning={spinning} />{emptyMessage ? <p className="mt-5 text-sm text-[var(--bp-muted)]">{emptyMessage}</p> : null}<button disabled={invalid} onClick={() => void spin()} className="mt-5 inline-flex min-w-52 items-center justify-center gap-2 rounded-xl bg-[var(--bp-accent)] px-6 py-3.5 font-black text-[var(--bp-accent-text)] disabled:cursor-not-allowed disabled:opacity-45">{spinning ? <Loader2 className="animate-spin" size={18} /> : <Dices size={18} />}{c.spin} {formatNumber(eligible.length)} {language === 'ar' ? 'مهمة' : 'tasks'}</button></SectionCard>
    </div>
    {result && !spinning ? <SectionCard className="mt-5 border-[var(--bp-accent)]/50 bg-gradient-to-br from-[var(--bp-accent)]/15 to-[var(--bp-surface)]"><p className="text-xs font-black uppercase tracking-widest text-[var(--bp-accent-ink)]">🐝 {c.next}</p><h2 className="mt-2 text-2xl font-black" dir={isRtlLabel(result.title) ? 'rtl' : 'ltr'}>{result.title}</h2><p className="mt-2 text-sm capitalize text-[var(--bp-muted)]">{result.priority} {result.dueDate ? `· ${new Date(result.dueDate).toLocaleDateString(language)}` : ''} {result.estimatedTimeMinutes ? `· ${result.estimatedTimeMinutes} min` : ''}</p><div className="mt-5 flex flex-wrap gap-2"><button onClick={() => void startFocus()} className="flex items-center gap-2 rounded-xl bg-[var(--bp-accent)] px-4 py-2.5 font-black text-[var(--bp-accent-text)]"><Target size={16}/>{c.focus}</button><button onClick={() => void spin()} className="rounded-xl border border-[var(--bp-border)] px-4 py-2.5 font-bold">{c.again}</button><button onClick={() => onViewTask(result.taskId ?? result.id)} className="flex items-center gap-2 rounded-xl border border-[var(--bp-border)] px-4 py-2.5 font-bold">{c.view}<ExternalLink size={15}/></button><button onClick={() => void spin(result)} className="flex items-center gap-2 px-3 py-2.5 text-sm font-bold text-[var(--bp-muted)]"><X size={15}/>{c.remove}</button></div></SectionCard> : null}
    {result && !spinning ? <DependencyInfo task={result} language={language} result /> : null}
    {error ? <p role="alert" className="mt-4 text-sm text-red-400">{error}</p> : null}
  </main>
}
