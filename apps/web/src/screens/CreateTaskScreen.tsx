import { BeePlanLogo } from '../components/BeePlanLogo'
type CreateTaskScreenProps = {
  onCancel?: () => void
  onSave?: () => void
}

export default function CreateTaskScreen({ onCancel, onSave }: CreateTaskScreenProps) {
  return (
    <div className="min-h-screen bg-[#1F2937] text-white">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-64 shrink-0 self-start overflow-y-auto rounded-3xl border border-[#3B465B] bg-[#2B3443]/80 p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <BeePlanLogo showTagline size={48} />
          </div>

          <nav className="space-y-2">
            <SideItem icon="DB" label="Dashboard" />
            <SideItem active icon="TS" label="Tasks" />
            <SideItem icon="RM" label="Reminders" />
            <SideItem icon="CA" label="Calendar" />
            <SideItem icon="NO" label="Notes" />
            <SideItem icon="AN" label="Analytics" />
          </nav>

          <div className="mt-12">
            <p className="mb-4 text-xs font-bold uppercase text-slate-400">Categories</p>
            <CategoryDot label="Work" color="bg-blue-400" />
            <CategoryDot label="Personal" color="bg-purple-400" />
            <CategoryDot label="Study" color="bg-green-400" />
            <CategoryDot label="Health" color="bg-red-400" />
            <CategoryDot label="Finance" color="bg-[#FDE64B]" />
            <CategoryDot label="Shopping" color="bg-pink-400" />
            <CategoryDot label="Travel" color="bg-cyan-400" />
          </div>

          <div className="mt-12 rounded-3xl border border-[#3B465B] bg-[#2B3443] p-5">
            <p className="font-bold">Keep going!</p>
            <p className="mt-1 text-xs text-slate-400">You're doing great today.</p>
            <div className="mt-6 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#FDE64B] font-black text-[#FDE64B]">
              64%
            </div>
            <p className="mt-3 text-xs text-slate-400">24 of 32 tasks completed</p>
          </div>
        </aside>

        <main className="flex-1 rounded-3xl border border-[#3B465B] bg-[#2B3443]/40 p-6">
          <header className="mb-8 flex items-center justify-between">
            <div>
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
                <button type="button" onClick={onCancel} className="hover:text-white">
                  Back
                </button>
                <span>Tasks</span>
                <span>/</span>
                <span className="text-white">Create New Task</span>
              </div>

              <h2 className="text-3xl font-black">Create New Task</h2>
              <p className="mt-2 text-sm text-slate-400">Organize your work and stay productive.</p>
            </div>

            <div className="flex items-center gap-3">
              <button className="rounded-xl border border-[#3B465B] bg-[#2B3443] px-4 py-3">Dark</button>
              <button className="rounded-xl border border-[#3B465B] bg-[#2B3443] px-4 py-3 text-sm">EN</button>
              <button className="rounded-full bg-[#FDE64B] px-4 py-3 font-black text-black">A</button>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
            <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443]/50 p-6 shadow-2xl">
              <SectionTitle icon="INFO" title="Task Information" />

              <FieldLabel label="Task Title" required />
              <input
                className="mb-6 w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-[#FDE64B]"
                placeholder="Enter task title..."
              />

              <FieldLabel label="Description" />
              <textarea
                className="mb-2 min-h-40 w-full resize-none rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-[#FDE64B]"
                placeholder="Describe your task..."
              />
              <p className="mb-6 text-right text-xs text-slate-500">0/500</p>

              <div className="mb-6 border-t border-[#3B465B] pt-6">
                <FieldLabel label="Subtasks" />
                <p className="mb-3 text-sm text-slate-400">Break down your task into smaller steps</p>
                <button className="w-full rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-4 font-bold text-[#FDE64B]">
                  + Add Subtask
                </button>
              </div>

              <div className="mb-6 border-t border-[#3B465B] pt-6">
                <FieldLabel label="Notes" />
                <textarea
                  className="min-h-24 w-full resize-none rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-white outline-none placeholder:text-slate-500 focus:border-[#FDE64B]"
                  placeholder="Additional notes (optional)..."
                />
              </div>

              <div className="border-t border-[#3B465B] pt-6">
                <FieldLabel label="Attachments" />
                <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 text-center">
                  <div className="text-sm font-black text-[#FDE64B]">UPLOAD</div>
                  <p className="mt-3 text-sm text-slate-300">Drag & drop files here, or click to browse</p>
                  <p className="mt-1 text-xs text-slate-500">Supports: Images, PDF, Documents</p>
                </div>
              </div>
            </section>

            <section className="space-y-5">
              <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443]/50 p-6">
                <SectionTitle icon="SET" title="Task Settings" />

                <FieldLabel label="Priority" />
                <div className="mb-6 grid grid-cols-3 gap-3">
                  <Segment label="Low" color="text-green-400" />
                  <Segment active label="= Medium" color="text-orange-400" />
                  <Segment label="High" color="text-red-400" />
                </div>

                <FieldLabel label="Task Status" />
                <div className="mb-6 grid grid-cols-4 gap-3">
                  <Segment active label="To Do" color="text-[#FDE64B]" />
                  <Segment label="In Progress" color="text-blue-400" />
                  <Segment label="Done" color="text-green-400" />
                  <Segment label="Missed" color="text-red-400" />
                </div>

                <FieldLabel label="Category" />
                <select className="mb-6 w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-slate-300 outline-none focus:border-[#FDE64B]">
                  <option>Select category...</option>
                  <option>Work</option>
                  <option>Personal</option>
                  <option>Study</option>
                  <option>Health</option>
                </select>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel label="Due Date" />
                    <input
                      type="date"
                      className="w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-slate-300 outline-none focus:border-[#FDE64B]"
                    />
                  </div>
                  <div>
                    <FieldLabel label="Due Time" />
                    <input
                      type="time"
                      className="w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-slate-300 outline-none focus:border-[#FDE64B]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443]/50 p-6">
                  <FieldLabel label="Recurring Task" />
                  <select className="w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-slate-300 outline-none focus:border-[#FDE64B]">
                    <option>None</option>
                    <option>Daily</option>
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </select>
                </div>

                <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443]/50 p-6">
                  <FieldLabel label="Dependencies" />
                  <p className="mb-4 text-sm text-slate-400">Task depends on another task</p>
                  <button className="w-full rounded-xl border border-dashed border-white/15 bg-black/20 px-4 py-4 font-bold text-[#FDE64B]">
                    + Add Dependency
                  </button>
                </div>
              </div>

              <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443]/50 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <FieldLabel label="Reminder" />
                    <p className="text-sm text-slate-400">BeePlan will remind you before the due date.</p>
                  </div>
                  <div className="flex h-7 w-12 items-center justify-end rounded-full bg-[#FDE64B] p-1">
                    <div className="h-5 w-5 rounded-full bg-white" />
                  </div>
                </div>

                <FieldLabel label="Reminder Time" />
                <select className="w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-slate-300 outline-none focus:border-[#FDE64B]">
                  <option>30 minutes before</option>
                  <option>10 minutes before</option>
                  <option>1 hour before</option>
                  <option>1 day before</option>
                </select>
              </div>

              <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443]/50 p-6">
                <FieldLabel label="Quick Tip" />
                <p className="text-sm leading-6 text-slate-400">
                  Break large tasks into subtasks to make them easier to manage.
                </p>
              </div>
            </section>
          </div>

          <div className="mt-8 flex justify-end gap-4 border-t border-[#3B465B] pt-6">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-[#3B465B] bg-[#2B3443] px-12 py-4 font-bold text-slate-300 hover:bg-[#3B465B]"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onSave}
              className="rounded-xl bg-[#FDE64B] px-12 py-4 font-black text-black shadow-lg shadow-[#FDE64B]/20"
            >
              Save Task
            </button>
          </div>
        </main>
      </div>
    </div>
  )
}

function SideItem({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <button
      type="button"
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
    <div className="mb-4 flex items-center gap-3 text-sm text-slate-300">
      <span className={`h-3 w-3 rounded-full ${color}`} />
      {label}
    </div>
  )
}

function SectionTitle({ icon, title }: { icon: string; title: string }) {
  return (
    <h3 className="mb-6 flex items-center gap-3 text-lg font-black">
      <span className="text-[#FDE64B]">{icon}</span>
      {title}
    </h3>
  )
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-300">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({
  label,
  active,
  color,
}: {
  label: string
  active?: boolean
  color: string
}) {
  return (
    <button
      type="button"
      className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
        active
          ? 'border-[#FDE64B] bg-[#FDE64B]/10 text-[#FDE64B]'
          : `border-[#3B465B] bg-[#2B3443] ${color}`
      }`}
    >
      {label}
    </button>
  )
}





