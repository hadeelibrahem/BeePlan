import { BeePlanLogo } from '../components/BeePlanLogo'

type EditTaskScreenProps = {
  onBack?: () => void
  onCancel?: () => void
  onDelete?: () => void
  onSave?: () => void
}

const subtasks = [
  { title: 'Executive summary slide', done: true },
  { title: 'Q2 performance review data', done: true },
  { title: 'Channel allocation strategy', done: true },
  { title: 'Executive presentation rehearsal', done: false },
]

const attachments = [
  { name: 'Q3_Marketing_Strategy_v3.pdf', meta: '4.2 MB - 2026-06-27', type: 'PDF' },
  { name: 'competitor_analysis_2026.xlsx', meta: '1.8 MB - 2026-06-26', type: 'XLS' },
]

export default function EditTaskScreen({ onBack, onCancel, onDelete, onSave }: EditTaskScreenProps) {
  return (
    <div className="min-h-screen bg-[#1F2937] text-white">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-64 shrink-0 self-start overflow-y-auto rounded-3xl border border-[#3B465B] bg-[#2B3443]/80 p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <BeePlanLogo showTagline size={48} />
          </div>

          <nav className="space-y-2 text-sm">
            <SideItem icon="DB" label="Dashboard" />
            <SideItem active icon="TS" label="Tasks" />
            <SideItem icon="RM" label="Reminders" />
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
            <p className="font-bold">Editing task</p>
            <p className="mt-1 text-xs text-slate-400">Last updated today.</p>
            <div className="mt-5 flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#FDE64B] font-black text-[#FDE64B]">
              72%
            </div>
          </div>
        </aside>

        <main className="flex-1 rounded-3xl border border-[#3B465B] bg-[#2B3443]/40 p-6">
          <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-4 flex items-center gap-2 text-sm text-slate-400">
                <button type="button" onClick={onBack} className="hover:text-white">Back</button>
                <span>Tasks</span>
                <span>/</span>
                <span className="text-white">Edit Task</span>
              </div>
              <h2 className="text-3xl font-black">Edit Task</h2>
              <p className="text-sm text-slate-400">Update task details, timing, progress, and supporting files.</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">Dark</button>
              <button className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm">EN</button>
              <button className="rounded-xl bg-[#FDE64B] px-5 py-3 text-sm font-black text-black">AC</button>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <section className="space-y-6">
              <Card title="Task Information" code="INFO">
                <FieldLabel label="Task Title" required />
                <input className={inputClass} defaultValue="Finalize Q3 marketing strategy deck" />

                <FieldLabel label="Description" />
                <textarea
                  className={`${inputClass} min-h-36 resize-none`}
                  defaultValue="Create a comprehensive marketing strategy presentation covering Q3 goals, channel allocation, budget breakdown, competitor analysis, and KPIs."
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <FieldLabel label="Category" />
                    <select className={inputClass} defaultValue="Marketing">
                      <option>Marketing</option>
                      <option>Design</option>
                      <option>Development</option>
                      <option>Research</option>
                    </select>
                  </div>
                  <div>
                    <FieldLabel label="Status" />
                    <select className={inputClass} defaultValue="In Progress">
                      <option>To Do</option>
                      <option>In Progress</option>
                      <option>Done</option>
                      <option>Missed</option>
                    </select>
                  </div>
                </div>
              </Card>

              <Card title="Editable Subtasks" action="+ Add Subtask">
                <div className="space-y-3">
                  {subtasks.map((item) => (
                    <div key={item.title} className="grid gap-3 rounded-2xl bg-[#2B3443] p-4 md:grid-cols-[32px_1fr_auto_auto] md:items-center">
                      <button className={`h-6 w-6 rounded-md border ${item.done ? 'border-green-400 bg-green-400 text-xs font-black text-[#1F2937]' : 'border-slate-500'}`}>
                        {item.done ? 'OK' : ''}
                      </button>
                      <input className="rounded-xl border border-[#3B465B] bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-[#FDE64B]" defaultValue={item.title} />
                      <button className="rounded-xl bg-[#3B465B] px-4 py-3 text-sm font-bold text-slate-200">Edit</button>
                      <button className="rounded-xl border border-red-500/40 px-4 py-3 text-sm font-bold text-red-300">Delete</button>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Notes">
                <textarea
                  className={`${inputClass} min-h-28 resize-none`}
                  defaultValue="Key talking points: market expansion, budget increase proposal, and final alignment with Sales team."
                />
              </Card>

              <Card title="Attachments" action="Upload">
                <div className="space-y-3">
                  {attachments.map((file) => (
                    <div key={file.name} className="flex items-center gap-4 rounded-2xl bg-[#2B3443] p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#3B465B] text-xs font-black text-[#FDE64B]">{file.type}</div>
                      <div className="flex-1">
                        <p className="font-bold text-slate-200">{file.name}</p>
                        <p className="text-sm text-slate-500">{file.meta}</p>
                      </div>
                      <button className="rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-300">Delete</button>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            <aside className="space-y-6">
              <Card title="Task Settings" code="SET">
                <FieldLabel label="Priority" />
                <div className="mb-5 grid grid-cols-3 gap-3">
                  <Segment label="Low" color="text-green-400" />
                  <Segment label="Medium" color="text-orange-400" />
                  <Segment active label="High" color="text-red-400" />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <FieldLabel label="Due Date" />
                    <input type="date" className={inputClass} defaultValue="2026-07-03" />
                  </div>
                  <div>
                    <FieldLabel label="Due Time" />
                    <input type="time" className={inputClass} defaultValue="17:00" />
                  </div>
                </div>
              </Card>

              <Card title="Progress Overview" code="72">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-400">13 of 18 subtasks completed</span>
                  <span className="text-2xl font-black text-[#FDE64B]">72%</span>
                </div>
                <div className="h-3 rounded-full bg-[#3B465B]">
                  <div className="h-3 w-[72%] rounded-full bg-[#FDE64B]" />
                </div>
              </Card>

              <Card title="Reminder & Recurring">
                <FieldLabel label="Reminder" />
                <select className={inputClass} defaultValue="30 minutes before">
                  <option>10 minutes before</option>
                  <option>30 minutes before</option>
                  <option>1 hour before</option>
                  <option>1 day before</option>
                </select>

                <FieldLabel label="Recurring" />
                <select className={inputClass} defaultValue="Every Monday">
                  <option>None</option>
                  <option>Daily</option>
                  <option>Every Monday</option>
                  <option>Monthly</option>
                </select>
              </Card>

              <Card title="Dependencies" action="+ Add">
                <Dependency label="Finish market research report" status="Done" />
                <Dependency label="Approve creative assets" status="In Progress" />
              </Card>

              <Card title="Activity Information">
                <InfoRow label="Created Date" value="2026-06-20" />
                <InfoRow label="Last Updated" value="2026-06-28" />
              </Card>

              <Card title="Time Tracking">
                <InfoRow label="Estimated Time" value="24h" />
                <InfoRow label="Time Spent" value="16h" />
                <InfoRow label="Remaining Time" value="8h" />
              </Card>
            </aside>
          </div>

          <footer className="mt-8 flex flex-col gap-3 border-t border-[#3B465B] pt-6 md:flex-row md:items-center md:justify-between">
            <button onClick={onDelete} className="rounded-xl border border-red-500/50 px-8 py-4 font-bold text-red-400">
              Delete Task
            </button>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button onClick={onCancel} className="rounded-xl bg-[#3B465B] px-10 py-4 font-bold text-slate-200">
                Cancel Changes
              </button>
              <button onClick={onSave} className="rounded-xl bg-[#FDE64B] px-10 py-4 font-black text-black">
                Save Changes
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

const inputClass =
  'mb-5 w-full rounded-xl border border-[#3B465B] bg-black/30 px-4 py-4 text-slate-200 outline-none focus:border-[#FDE64B]'

function SideItem({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <button className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ${active ? 'bg-[#FDE64B]/15 text-[#FDE64B]' : 'text-slate-300 hover:bg-[#2B3443]'}`}>
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

function Card({ title, code, action, children }: { title: string; code?: string; action?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443]/50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-3 text-lg font-black">
          {code ? <span className="text-[#FDE64B]">{code}</span> : null}
          {title}
        </h3>
        {action ? <button className="font-bold text-[#FDE64B]">{action}</button> : null}
      </div>
      {children}
    </section>
  )
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <label className="mb-2 block text-xs font-black uppercase tracking-wide text-slate-300">
      {label} {required ? <span className="text-red-400">*</span> : null}
    </label>
  )
}

function Segment({ label, active, color }: { label: string; active?: boolean; color: string }) {
  return (
    <button className={`rounded-xl border px-4 py-3 text-sm font-bold ${active ? 'border-[#FDE64B] bg-[#FDE64B]/10 text-[#FDE64B]' : `border-[#3B465B] bg-[#2B3443] ${color}`}`}>
      {label}
    </button>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-2xl bg-[#2B3443] px-4 py-3">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</span>
      <span className="font-bold text-slate-200">{value}</span>
    </div>
  )
}

function Dependency({ label, status }: { label: string; status: string }) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-2xl bg-[#2B3443] p-4">
      <span className="font-bold text-slate-200">{label}</span>
      <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-300">{status}</span>
    </div>
  )
}
