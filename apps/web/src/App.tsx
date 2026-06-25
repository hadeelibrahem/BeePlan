import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from './lib/api'
import { useAppStore } from './store/useAppStore'

function App() {
  const { sidebarOpen, toggleSidebar } = useAppStore()
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    retry: false,
  })

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6">
        <header className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">
              BeePlan web
            </p>
            <h1 className="mt-2 text-3xl font-bold">Project dashboard</h1>
          </div>
          <button
            className="rounded-md bg-cyan-300 px-4 py-2 font-semibold text-zinc-950"
            type="button"
            onClick={toggleSidebar}
          >
            Toggle panel
          </button>
        </header>

        <section className="grid flex-1 gap-5 py-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-xl font-semibold">Stack is ready</h2>
            <p className="mt-3 max-w-2xl text-zinc-300">
              React Query, Zod, Zustand, TypeScript, Vite, and Tailwind are wired
              into this web app.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {['React Query', 'Zod', 'Zustand'].map((item) => (
                <div
                  className="rounded-md border border-zinc-800 bg-zinc-950 p-4"
                  key={item}
                >
                  <p className="font-medium">{item}</p>
                </div>
              ))}
            </div>
          </div>

          {sidebarOpen && (
            <aside className="rounded-lg border border-zinc-800 bg-zinc-900 p-5">
              <h2 className="text-xl font-semibold">API status</h2>
              <p className="mt-3 text-zinc-300">
                {healthQuery.isLoading
                  ? 'Checking API...'
                  : healthQuery.data
                    ? `${healthQuery.data.service} online`
                    : 'API not reachable yet'}
              </p>
              {healthQuery.data && (
                <p className="mt-4 text-sm text-zinc-500">
                  {healthQuery.data.timestamp}
                </p>
              )}
            </aside>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
