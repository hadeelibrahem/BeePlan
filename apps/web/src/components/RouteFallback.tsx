import { PrimaryButton } from './layout/Buttons'

export function RouteFallback({
  title,
  message,
  onBack,
  actionLabel = 'Go to dashboard',
}: {
  title: string
  message: string
  onBack: () => void
  actionLabel?: string
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--bp-bg)] px-5 text-center text-[var(--bp-text)]">
      <section className="max-w-md rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 shadow-xl">
        <h1 className="text-xl font-black">{title}</h1>
        <p className="mt-2 text-sm text-[var(--bp-muted)]">{message}</p>
        <PrimaryButton className="mt-5" onClick={onBack}>{actionLabel}</PrimaryButton>
      </section>
    </main>
  )
}
