import type { ReactNode } from 'react'
import { BeePlanLogo } from '../components/BeePlanLogo'

type AllTasksScreenProps = {
  onBackDashboard?: () => void
  onCreateTask?: () => void
  onViewTaskDetails?: () => void
}

type Task = {
  title: string
  category: string
  due: string
  priority: 'High' | 'Medium' | 'Low'
  status: 'To Do' | 'In Progress' | 'Done' | 'Missed'
  progress: number
  done?: boolean
}

const tasks: Task[] = [
  {
    title: 'Design new landing page hero section',
    category: 'Design',
    due: 'Today',
    priority: 'High',
    status: 'In Progress',
    progress: 65,
  },
  {
    title: 'Review mobile app design mockups',
    category: 'Design',
    due: 'Today',
    priority: 'Medium',
    status: 'To Do',
    progress: 0,
  },
  {
    title: 'Team sync - weekly standup notes',
    category: 'Meeting',
    due: 'Today',
    priority: 'Low',
    status: 'Done',
    progress: 100,
    done: true,
  },
  {
    title: 'Code review for payment module PR',
    category: 'Development',
    due: 'Tomorrow',
    priority: 'High',
    status: 'To Do',
    progress: 0,
  },
  {
    title: 'Bug fix - login page validation',
    category: 'Development',
    due: 'Tomorrow',
    priority: 'High',
    status: 'In Progress',
    progress: 30,
  },
  {
    title: 'Finalize Q3 marketing strategy deck',
    category: 'Marketing',
    due: 'Jun 7',
    priority: 'High',
    status: 'In Progress',
    progress: 72,
  },
  {
    title: 'Set up CI/CD pipeline for staging',
    category: 'Development',
    due: 'Jun 8',
    priority: 'High',
    status: 'In Progress',
    progress: 90,
  },
  {
    title: 'Research competitor pricing models',
    category: 'Research',
    due: 'Jul 1',
    priority: 'Medium',
    status: 'In Progress',
    progress: 60,
  },
]

export default function AllTasksScreen({
  onBackDashboard,
  onCreateTask,
  onViewTaskDetails,
}: AllTasksScreenProps) {
  return (
    <div className="min-h-screen bg-[#1F2937] text-white">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-64 shrink-0 self-start overflow-y-auto rounded-3xl border border-[#3B465B] bg-[#2B3443]/80 p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <BeePlanLogo showTagline size={48} />
          </div>

          <nav className="space-y-2 text-sm">
            <SideItem label="Dashboard" icon="DB" onClick={onBackDashboard} />
            <SideItem active label="Tasks" icon="TS" />
            <SideItem label="Reminders" icon="RM" />
            <SideItem label="Calendar" icon="CA" />
            <SideItem label="Notes" icon="NO" />
            <SideItem label="Analytics" icon="AN" />
          </nav>

          <div className="mt-10">
            <p className="mb-3 text-xs font-bold uppercase text-slate-400">Categories</p>
            <CategoryDot label="Work" color="bg-blue-400" />
            <CategoryDot label="Personal" color="bg-purple-400" />
            <CategoryDot label="Study" color="bg-green-400" />
            <CategoryDot label="Health" color="bg-red-400" />
            <CategoryDot label="Finance" color="bg-[#FDE64B]" />
          </div>

          <div className="mt-20 rounded-3xl bg-[#2B3443] p-5">
            <p className="font-bold">Keep going!</p>
            <p className="mt-1 text-xs text-slate-400">You're doing great today.</p>
            <div className="mt-5 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#FDE64B] font-black text-[#FDE64B]">
              64%
            </div>
          </div>
        </aside>

        <main className="flex-1 rounded-3xl border border-[#3B465B] bg-[#2B3443]/40 p-6">
          <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-3xl font-black">All Tasks</h2>
              <p className="text-sm text-slate-400">Manage, filter, and track all your tasks</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button type="button" className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">Search</button>
              <button type="button" className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">Filter</button>
              <button type="button" className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">Sort: Due Date</button>
              <button
                type="button"
                onClick={onCreateTask}
                className="rounded-xl bg-[#FDE64B] px-5 py-3 text-sm font-black text-black"
              >
                + New Task
              </button>
            </div>
          </header>

          <div className="mb-6 flex flex-wrap gap-3">
            <Chip active label="All" count="24" />
            <Chip label="To Do" count="8" />
            <Chip label="In Progress" count="5" />
            <Chip label="Done" count="7" />
            <Chip label="Missed" count="4" />
          </div>

          <section className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <Summary value="24" label="All Tasks" icon="ALL" />
            <Summary value="8" label="To Do" icon="TODO" />
            <Summary value="5" label="In Progress" icon="MOVE" />
            <Summary value="7" label="Done" icon="DONE" />
            <Summary value="4" label="Missed" icon="LATE" />
          </section>

          <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
            <section className="space-y-6">
              <TaskGroup title="Today" count="5 tasks" tasks={tasks.slice(0, 3)} onViewTaskDetails={onViewTaskDetails} />
              <TaskGroup title="Tomorrow" count="3 tasks" tasks={tasks.slice(3, 5)} onViewTaskDetails={onViewTaskDetails} />
              <TaskGroup title="This Week" count="4 tasks" tasks={tasks.slice(5)} onViewTaskDetails={onViewTaskDetails} />
            </section>

            <aside className="space-y-5">
              <Panel title="Quick Filters">
                <FilterRow label="Overdue" count="3" color="bg-red-400" />
                <FilterRow label="Due Today" count="5" color="bg-[#FDE64B]" />
                <FilterRow label="Due This Week" count="9" color="bg-blue-400" />
              </Panel>

              <Panel title="My Filters">
                <FilterRow label="Important" count="6" color="bg-[#FDE64B]" />
                <FilterRow label="Personal Tasks" count="4" color="bg-purple-400" />
              </Panel>

              <Panel title="Categories">
                <FilterRow label="Work" count="12" color="bg-blue-400" />
                <FilterRow label="Personal" count="6" color="bg-purple-400" />
                <FilterRow label="Study" count="3" color="bg-green-400" />
                <FilterRow label="Health" count="2" color="bg-red-400" />
              </Panel>
            </aside>
          </div>
        </main>
      </div>

      <button
        type="button"
        onClick={onCreateTask}
        className="fixed bottom-8 right-8 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FDE64B] text-3xl font-black text-black shadow-2xl shadow-[#FDE64B]/30"
      >
        +
      </button>
    </div>
  )
}

function SideItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string
  label: string
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${
        active ? 'bg-[#FDE64B]/15 text-[#FDE64B]' : 'text-slate-300 hover:bg-[#2B3443]'
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function CategoryDot({ label, color }: { label: string; color: string }) {
  return (
    <div className="mb-3 flex items-center gap-3 text-sm text-slate-300">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      {label}
    </div>
  )
}

function Chip({ label, count, active }: { label: string; count: string; active?: boolean }) {
  return (
    <button
      type="button"
      className={`rounded-full px-5 py-2 text-sm font-bold ${
        active ? 'bg-[#FDE64B] text-black' : 'bg-[#3B465B] text-slate-200'
      }`}
    >
      {label} <span className="opacity-70">{count}</span>
    </button>
  )
}

function Summary({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <div className="rounded-2xl border border-[#3B465B] bg-[#2B3443] p-5">
      <div className="mb-3 text-2xl">{icon}</div>
      <div className="text-3xl font-black">{value}</div>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  )
}

function TaskGroup({
  title,
  count,
  tasks,
  onViewTaskDetails,
}: {
  title: string
  count: string
  tasks: Task[]
  onViewTaskDetails?: () => void
}) {
  return (
    <div>
      <h3 className="mb-3 font-bold">
        {title} <span className="text-sm text-slate-400">- {count}</span>
      </h3>

      <div className="overflow-hidden rounded-2xl border border-[#3B465B] bg-[#2B3443]">
        {tasks.map((task) => (
          <TaskRow key={task.title} task={task} onViewTaskDetails={onViewTaskDetails} />
        ))}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onViewTaskDetails,
}: {
  task: Task
  onViewTaskDetails?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onViewTaskDetails}
      className="grid w-full cursor-pointer grid-cols-[28px_1fr_120px_120px_160px_24px] items-center gap-4 border-b border-[#3B465B] px-5 py-4 text-left transition hover:bg-[#2B3443] last:border-b-0"
    >
      <div className={`h-5 w-5 rounded-md border ${task.done ? 'border-green-400 bg-green-400' : 'border-slate-500'}`} />

      <div>
        <p className={`font-semibold text-white ${task.done ? 'text-slate-500 line-through' : ''}`}>{task.title}</p>
        <p className="text-xs text-slate-400">{task.category} - {task.due}</p>
      </div>

      <Badge label={task.priority} type={task.priority} />
      <Badge label={task.status} type={task.status} />

      <div>
        <div className="h-2 rounded-full bg-slate-700">
          <div
            className={`h-2 rounded-full ${
              task.progress === 100 ? 'bg-green-400' : task.progress === 0 ? 'bg-slate-600' : 'bg-[#FDE64B]'
            }`}
            style={{ width: `${task.progress}%` }}
          />
        </div>
        <p className="mt-1 text-right text-xs text-slate-400">{task.progress}%</p>
      </div>

      <span className="text-slate-400">&gt;</span>
    </button>
  )
}

function Badge({ label, type }: { label: string; type: string }) {
  const color =
    type === 'High' || type === 'Missed'
      ? 'bg-red-500/20 text-red-300'
      : type === 'Medium'
        ? 'bg-orange-500/20 text-orange-300'
        : type === 'Low' || type === 'Done'
          ? 'bg-green-500/20 text-green-300'
          : type === 'In Progress'
            ? 'bg-blue-500/20 text-blue-300'
            : 'bg-slate-500/20 text-slate-300'

  return <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${color}`}>{label}</span>
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#3B465B] bg-[#2B3443] p-5">
      <h3 className="mb-4 font-bold">{title}</h3>
      {children}
    </div>
  )
}

function FilterRow({ label, count, color }: { label: string; count: string; color: string }) {
  return (
    <div className="mb-4 flex items-center justify-between text-sm last:mb-0">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        <span className="text-slate-300">{label}</span>
      </div>
      <span className="rounded-full bg-[#3B465B] px-2 py-1 text-xs">{count}</span>
    </div>
  )
}




