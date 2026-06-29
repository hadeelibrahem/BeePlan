import { BeePlanLogo } from '../components/BeePlanLogo'
type TaskDetailsScreenProps = {
  onBack?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onMarkDone?: () => void
}

export default function TaskDetailsScreen({
  onBack,
  onEdit,
  onDelete,
  onMarkDone,
}: TaskDetailsScreenProps) {
  return (
    <div className="min-h-screen bg-[#1F2937] text-white">
      <div className="mx-auto flex max-w-7xl gap-6 px-6 py-6">
        <aside className="sticky top-6 hidden max-h-[calc(100vh-3rem)] w-64 shrink-0 self-start overflow-y-auto rounded-3xl border border-[#3B465B] bg-[#2B3443]/80 p-5 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <BeePlanLogo showTagline size={48} />
          </div>

          <nav className="space-y-3">
            <SideItem icon="DB" label="Dashboard" />
            <SideItem active icon="TS" label="Tasks" />
            <SideItem icon="RM" label="Reminders" />
            <SideItem icon="CA" label="Calendar" />
            <SideItem icon="NO" label="Notes" />
            <SideItem icon="AN" label="Analytics" />
          </nav>

          <div className="mt-12">
            <p className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-400">Categories</p>
            <Category label="Marketing" count="4" color="bg-[#FDE64B]" />
            <Category label="Design" count="3" color="bg-purple-400" />
            <Category label="Development" count="6" color="bg-blue-400" />
            <Category label="Operations" count="2" color="bg-green-400" />
            <Category label="Research" count="1" color="bg-red-400" />
          </div>

          <div className="mt-12 rounded-3xl border border-[#3B465B] bg-[#2B3443] p-5">
            <div className="mb-3 flex justify-between text-sm">
              <span className="font-bold uppercase tracking-wide text-slate-400">Productivity</span>
              <span className="font-black text-[#FDE64B]">64%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700">
              <div className="h-2 w-[64%] rounded-full bg-[#FDE64B]" />
            </div>
          </div>
        </aside>

        <main className="flex-1 rounded-3xl border border-[#3B465B] bg-[#2B3443]/40 p-6">
          <header className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-5">
                <button onClick={onBack} className="text-slate-400 hover:text-white">
                  Back
                </button>
                <div>
                  <h1 className="text-xl font-black">Task Details</h1>
                  <p className="text-sm text-slate-500">View and manage your task</p>
                </div>
              </div>

              <div className="flex items-center gap-5 text-slate-400">
                <button>Open</button>
                <button>Menu</button>
                <span>EN</span>
                <span>Dark</span>
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FDE64B]/30 font-bold text-[#FDE64B]">
                  AC
                </div>
              </div>
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
            <section className="space-y-6">
              <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                <div className="mb-8 flex justify-between">
                  <div className="flex flex-wrap gap-2">
                    <Badge color="blue">In Progress</Badge>
                    <Badge color="red">High</Badge>
                    <Badge color="yellow">Marketing</Badge>
                  </div>
                  <span className="text-2xl font-black text-[#FDE64B]">STAR</span>
                </div>

                <h2 className="mb-4 text-2xl font-black">Finalize Q3 marketing strategy deck</h2>
                <p className="max-w-4xl leading-7 text-slate-400">
                  Create a comprehensive marketing strategy presentation covering Q3 goals, channel allocation,
                  budget breakdown, competitor analysis, and KPIs. Needs to include executive summary, detailed
                  campaign timelines, creative direction, and expected ROI projections for each channel.
                </p>

                <div className="mt-7 grid gap-4 md:grid-cols-4">
                  <InfoBox title="Created" value="2026-06-20" />
                  <InfoBox title="Updated" value="2026-06-28" />
                  <InfoBox title="Due Date" value="2026-07-03" />
                  <InfoBox title="Due Time" value="5:00 PM" />
                </div>
              </section>

              <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="font-black">Progress</h3>
                  <span className="text-3xl font-black text-[#FDE64B]">72%</span>
                </div>
                <div className="h-3 rounded-full bg-[#3B465B]">
                  <div className="h-3 w-[72%] rounded-full bg-[#FDE64B]" />
                </div>

                <div className="mt-5 space-y-4 text-sm">
                  <ProgressRow icon="DONE" label="13 of 18 subtasks completed" />
                  <ProgressRow icon="EST" label="Estimated" value="24h" />
                  <ProgressRow icon="SPENT" label="Spent" value="16h" blue />
                  <ProgressRow icon="LEFT" label="Remaining" value="8h" yellow />
                </div>
              </section>

              <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                <div className="mb-6 flex justify-between">
                  <div>
                    <h3 className="font-black">Subtasks</h3>
                    <p className="text-sm text-slate-500">13 of 18 completed</p>
                  </div>
                  <button className="font-bold text-[#FDE64B]">+ Add Subtask</button>
                </div>

                <div className="space-y-2">
                  {subtasks.map((task, index) => (
                    <Subtask key={task.title} {...task} active={index === 3} />
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                <div className="mb-6 flex justify-between">
                  <h3 className="font-black">Dependencies</h3>
                  <button className="font-bold text-[#FDE64B]">+ Add Dependency</button>
                </div>

                <Dependency title="Finish market research report" status="Done" color="bg-green-400" />
                <Arrow />
                <Dependency title="Finalize Q2 performance metrics" status="Done" color="bg-green-400" />
                <Arrow />
                <Dependency title="Approve creative assets" status="In Progress" color="bg-blue-400" />
              </section>

              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                  <div className="mb-5 flex items-center justify-between">
                    <h3 className="font-black">Reminder</h3>
                    <div className="flex h-7 w-12 items-center justify-end rounded-full bg-[#FDE64B] p-1">
                      <div className="h-5 w-5 rounded-full bg-white" />
                    </div>
                  </div>
                  <p className="text-sm text-slate-400">30 minutes before due date</p>
                </section>

                <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                  <h3 className="mb-5 font-black">Recurring</h3>
                  <p className="text-sm text-slate-400">Repeats</p>
                  <p className="mt-1 font-bold text-purple-400">Every Monday</p>
                </section>
              </div>

              <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                <div className="mb-4 flex justify-between">
                  <h3 className="font-black">Notes</h3>
                  <button className="text-sm text-slate-400">Edit</button>
                </div>
                <p className="leading-7 text-slate-400">
                  Key talking points: Market expansion into APAC region, 20% budget increase proposal for
                  digital channels, new influencer partnership program. Need to align with Sales team on lead
                  gen targets before finalizing.
                </p>
              </section>

              <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                <div className="mb-5 flex justify-between">
                  <div>
                    <h3 className="font-black">Attachments</h3>
                    <p className="text-sm text-slate-500">5 files</p>
                  </div>
                  <button className="font-bold text-[#FDE64B]">+ Add</button>
                </div>

                <div className="space-y-3">
                  {attachments.map((file) => (
                    <Attachment key={file.name} {...file} />
                  ))}
                </div>

                <div className="mt-5 flex h-28 items-center justify-center rounded-2xl border border-dashed border-[#3B465B] text-slate-500">
                  Drag and drop files here
                </div>
              </section>

              <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                <h3 className="mb-6 font-black">Activity Timeline</h3>
                <Timeline title="Attachment added" desc="campaign_timeline_draft.pdf was uploaded" color="bg-pink-400" />
                <Timeline title="Progress updated" desc="Progress changed from 65% to 72%" color="bg-purple-400" />
                <Timeline title="Subtask completed" desc="Visual asset coordination with design marked done" color="bg-blue-400" />
                <Timeline title="Reminder set" desc="Reminder configured for 30 minutes before due date" color="bg-[#FDE64B]" />
                <Timeline title="Status changed" desc="Moved from To Do to In Progress" color="bg-blue-400" />
                <Timeline title="Task created" desc="Finalize Q3 marketing strategy deck was created" color="bg-green-400" />
              </section>

              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                  <div className="mb-6 flex justify-between">
                    <h3 className="font-black">Labels</h3>
                    <button className="font-bold text-[#FDE64B]">+ Add Label</button>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Badge color="purple">Design</Badge>
                    <Badge color="yellow">Marketing</Badge>
                    <Badge color="blue">University</Badge>
                    <Badge color="red">Work</Badge>
                  </div>
                </section>

                <section className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-7">
                  <h3 className="mb-6 font-black">Time Estimation</h3>
                  <div className="h-3 rounded-full bg-[#3B465B]">
                    <div className="h-3 w-[66%] rounded-full bg-blue-400" />
                  </div>
                  <div className="mt-6 grid grid-cols-3 text-center">
                    <Time value="24h" label="Estimated" />
                    <Time value="16h" label="Spent" blue />
                    <Time value="8h" label="Remaining" yellow />
                  </div>
                </section>
              </div>
            </section>

            <aside className="hidden space-y-4 xl:block">
              <SideCard title="Priority" value="High" red />
              <SideCard title="Status" value="In Progress" blue />
              <SideCard title="Category" value="Marketing" yellow />
              <SideCard title="Due Date" value={'2026-07-03\n5:00 PM'} />
              <SideCard title="Reminder" value="30 minutes before" />
              <SideCard title="Recurring" value="Every Monday" />
              <SideCard title="Time Estimate" value="24h" />
            </aside>
          </div>

          <footer className="mt-8 border-t border-[#3B465B] pt-6">
          <div className="flex justify-between gap-4">
            <button onClick={onDelete} className="rounded-xl border border-red-500/50 px-8 py-3 font-bold text-red-400">
              Delete Task
            </button>
            <div className="flex gap-4">
              <button onClick={onEdit} className="rounded-xl bg-[#3B465B] px-10 py-3 font-bold text-slate-400">
                Edit Task
              </button>
              <button onClick={onMarkDone} className="rounded-xl bg-[#FDE64B] px-10 py-3 font-black text-black">
                Mark as Done
              </button>
            </div>
          </div>
          </footer>
        </main>
      </div>
    </div>
  )
}

function SideItem({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <button className={`flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left ${active ? 'bg-[#FDE64B]/15 text-[#FDE64B]' : 'text-slate-400'}`}>
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function Category({ label, count, color }: { label: string; count: string; color: string }) {
  return (
    <div className="mb-5 flex items-center justify-between text-slate-400">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
        {label}
      </div>
      <span className="rounded-lg bg-[#2B3443] px-2 py-1 text-xs">{count}</span>
    </div>
  )
}

function Badge({ children, color }: { children: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-500/20 text-blue-400',
    red: 'bg-red-500/20 text-red-400',
    yellow: 'bg-yellow-500/20 text-[#FDE64B]',
    green: 'bg-green-500/20 text-green-400',
    purple: 'bg-purple-500/20 text-purple-400',
  }

  return <span className={`rounded-lg px-3 py-2 text-sm font-bold ${colors[color]}`}>{children}</span>
}

function InfoBox({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#2B3443] p-4">
      <p className="text-xs font-black uppercase text-slate-500">{title}</p>
      <p className="mt-2 font-bold text-slate-200">{value}</p>
    </div>
  )
}

function ProgressRow({ icon, label, value, blue, yellow }: { icon: string; label: string; value?: string; blue?: boolean; yellow?: boolean }) {
  return (
    <div className="flex justify-between text-slate-400">
      <span>{icon} {label}</span>
      {value ? <span className={`font-bold ${blue ? 'text-blue-400' : yellow ? 'text-[#FDE64B]' : 'text-white'}`}>{value}</span> : null}
    </div>
  )
}

const subtasks = [
  { title: 'Executive summary slide', date: '2026-06-25', done: true },
  { title: 'Q2 performance review data', date: '2026-06-25', done: true },
  { title: 'Competitor analysis section', date: '2026-06-26', done: true },
  { title: 'Channel allocation strategy', date: '2026-06-26', done: true },
  { title: 'Budget breakdown by quarter', date: '2026-06-27', done: true },
  { title: 'Creative direction moodboard', date: '2026-06-27', done: true },
  { title: 'Executive presentation rehearsal', date: '2026-07-01', done: false },
  { title: 'Final VP review and feedback', date: '2026-07-02', done: false },
  { title: 'Board meeting delivery', date: '2026-07-03', done: false },
]

function Subtask({ title, date, done, active }: { title: string; date: string; done: boolean; active?: boolean }) {
  return (
    <div className={`grid grid-cols-[24px_1fr_120px_50px_70px] items-center gap-4 rounded-xl px-4 py-3 ${active ? 'bg-[#2B3443]' : ''}`}>
      <div className={`h-5 w-5 rounded-md border ${done ? 'border-green-400 bg-green-400 text-black' : 'border-slate-500'}`}>
        {done ? 'OK' : ''}
      </div>
      <p className={done ? 'text-slate-500 line-through' : 'text-slate-200'}>{title}</p>
      <p className="text-sm text-slate-500">{date}</p>
      <span className="rounded-full bg-[#FDE64B]/20 px-2 py-1 text-center text-xs font-bold text-[#FDE64B]">AC</span>
      <span className={`text-sm font-bold ${done ? 'text-green-400' : 'text-slate-500'}`}>{done ? 'Done' : 'Open'}</span>
    </div>
  )
}

function Dependency({ title, status, color }: { title: string; status: string; color: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#2B3443] px-5 py-4">
      <div className="flex items-center gap-4">
        <span className={`h-3 w-3 rounded-full ${color}`} />
        <span>{title}</span>
      </div>
      <Badge color={status === 'Done' ? 'green' : 'blue'}>{status}</Badge>
    </div>
  )
}

function Arrow() {
  return <div className="py-2 text-center text-slate-500">v</div>
}

const attachments = [
  { name: 'Q3_Marketing_Strategy_v3.pdf', meta: '4.2 MB - 2026-06-27', color: 'bg-red-500' },
  { name: 'competitor_analysis_2026.xlsx', meta: '1.8 MB - 2026-06-26', color: 'bg-blue-500' },
  { name: 'creative_moodboard_final.jpg', meta: '3.5 MB - 2026-06-28', color: 'bg-green-500' },
  { name: 'budget_projection_Q3.pptx', meta: '5.1 MB - 2026-06-27', color: 'bg-orange-500' },
]

function Attachment({ name, meta, color }: { name: string; meta: string; color: string }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-[#2B3443] p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>FILE</div>
      <div>
        <p className="font-bold text-slate-200">{name}</p>
        <p className="text-sm text-slate-500">{meta}</p>
      </div>
    </div>
  )
}

function Timeline({ title, desc, color }: { title: string; desc: string; color: string }) {
  return (
    <div className="relative mb-8 flex gap-5">
      <span className={`mt-1 h-6 w-6 rounded-full ${color}`} />
      <div>
        <p className="font-bold text-slate-200">{title}</p>
        <p className="text-sm text-slate-500">{desc}</p>
      </div>
    </div>
  )
}

function Time({ value, label, blue, yellow }: { value: string; label: string; blue?: boolean; yellow?: boolean }) {
  return (
    <div>
      <p className={`text-xl font-black ${blue ? 'text-blue-400' : yellow ? 'text-[#FDE64B]' : 'text-white'}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  )
}

function SideCard({ title, value, red, blue, yellow }: { title: string; value: string; red?: boolean; blue?: boolean; yellow?: boolean }) {
  return (
    <div className="rounded-3xl border border-[#3B465B] bg-[#2B3443] p-5">
      <p className="mb-3 text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
      <p className={`whitespace-pre-line font-bold ${red ? 'text-red-400' : blue ? 'text-blue-400' : yellow ? 'text-[#FDE64B]' : 'text-slate-200'}`}>
        {value}
      </p>
    </div>
  )
}





