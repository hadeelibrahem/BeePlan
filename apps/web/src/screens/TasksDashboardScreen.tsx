import { BeePlanLogo } from '../components/BeePlanLogo'
import type { Reminder } from '../features/reminders'

type TasksDashboardScreenProps = {
  reminders: Reminder[]
  onViewReminders: () => void
  onViewTasks: () => void
}

export default function TasksDashboardScreen({
  reminders,
  onViewReminders,
  onViewTasks,
}: TasksDashboardScreenProps) {
  return (
    <div className="min-h-screen bg-[#1F2937] text-white">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="hidden w-64 shrink-0 rounded-3xl border border-[#3B465B] bg-[#2B3443]/80 p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <BeePlanLogo showTagline size={48} />
          </div>

          <nav className="space-y-2 text-sm">
            <SideItem active icon="DB" label="Dashboard" />
            <SideItem icon="TS" label="Tasks" onClick={onViewTasks} />
            <SideItem icon="RM" label="Reminders" onClick={onViewReminders} />
            <SideItem icon="CA" label="Calendar" />
            <SideItem icon="NO" label="Notes" />
            <SideItem icon="AN" label="Analytics" />
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
              <h2 className="text-3xl font-black">Dashboard</h2>
              <p className="text-sm text-slate-400">Smart productivity dashboard</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">Search</button>
              <button className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">Dark</button>
              <button className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">EN</button>
              <button className="rounded-xl bg-[#FDE64B] px-5 py-3 text-sm font-black text-black">F</button>
            </div>
          </header>

          <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            <StatCard icon="TODAY" value="8" title="Today's Tasks" desc="Tasks planned for today" />
            <StatCard icon="DONE" value="24" title="Completed" desc="Tasks you've completed" />
            <StatCard icon="HIGH" value="3" title="High Priority" desc="Important tasks to focus on" />
            <StatCard icon="REM" value={String(reminders.length)} title="Reminders" desc="Smart reminders synced" />
          </section>

          <section className="mb-6 rounded-3xl border border-[#3B465B] bg-[#2B3443] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold">Overall Progress</h2>
                <p className="text-sm text-slate-400">You're doing great! Keep it up.</p>
              </div>
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#FDE64B] text-xl font-black text-[#FDE64B]">
                64%
              </div>
            </div>

            <div className="mt-6 h-3 rounded-full bg-slate-700">
              <div className="h-3 w-[64%] rounded-full bg-[#FDE64B]" />
            </div>

            <div className="mt-3 flex justify-between text-sm text-slate-400">
              <span>24 completed</span>
              <span>32 total tasks</span>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="font-bold">Today's Focus</h2>
                <button type="button" onClick={onViewTasks} className="text-sm font-bold text-[#FDE64B]">
                  View All &gt;
                </button>
              </div>

              <FocusTask title="Finalize Q3 marketing strategy" time="10:00 AM" color="bg-red-400" />
              <FocusTask title="Review design mockups for mobile app" time="1:30 PM" color="bg-orange-400" />
              <FocusTask title="Team sync - weekly standup" time="9:00 AM" color="bg-[#FDE64B]" done />
              <FocusTask title="Update project documentation" time="4:00 PM" color="bg-slate-400" />
            </div>

            <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-6">
              <h2 className="mb-5 font-bold">Quick Actions</h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ActionCard icon="+" title="New Task" desc="Create a new task" onClick={onViewTasks} />
                <ActionCard icon="RM" title="New Reminder" desc="Add a reminder" onClick={onViewReminders} />
                <ActionCard icon="CA" title="View Calendar" desc="See your schedule" />
                <ActionCard icon="TS" title="All Tasks" desc="View all tasks" onClick={onViewTasks} />
              </div>
            </div>
          </section>
        </main>
      </div>

      <button
        type="button"
        onClick={onViewTasks}
        className="fixed bottom-8 right-8 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#FDE64B] text-3xl font-bold text-black shadow-2xl shadow-[#FDE64B]/30"
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

function StatCard({ icon, value, title, desc }: { icon: string; value: string; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-[#3B465B] bg-[#2B3443] p-5 shadow-xl transition hover:border-[#FDE64B]/40">
      <div className="mb-3 text-2xl">{icon}</div>
      <div className="text-3xl font-black">{value}</div>
      <h3 className="mt-2 font-bold">{title}</h3>
      <p className="mt-2 text-sm text-slate-400">{desc}</p>
    </div>
  )
}

function FocusTask({
  title,
  time,
  color,
  done,
}: {
  title: string
  time: string
  color: string
  done?: boolean
}) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className={`h-5 w-5 rounded-full border ${done ? 'border-[#FDE64B] bg-[#FDE64B]' : 'border-slate-500'}`}>
        {done ? 'OK' : ''}
      </div>
      <div className="flex-1">
        <p className={`font-semibold ${done ? 'text-slate-500 line-through' : ''}`}>{title}</p>
        <p className="text-sm text-slate-400">{time}</p>
      </div>
      <span className={`h-2 w-2 rounded-full ${color}`} />
    </div>
  )
}

function ActionCard({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: string
  title: string
  desc: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-[#3B465B] bg-[#2B3443] p-5 text-left transition hover:border-[#FDE64B]/40"
    >
      <div className="mb-3 text-2xl">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      <p className="text-sm text-slate-400">{desc}</p>
    </button>
  )
}
