import type { RecurrenceSuggestion } from '../lib/tasksApi'

type RecurrenceSuggestionCardProps = {
  suggestion: RecurrenceSuggestion
  onMakeRecurring: (suggestion: RecurrenceSuggestion) => void
  onDismiss: (suggestion: RecurrenceSuggestion) => void
}

export default function RecurrenceSuggestionCard({
  suggestion,
  onMakeRecurring,
  onDismiss,
}: RecurrenceSuggestionCardProps) {
  return (
    <section className="rounded-2xl border border-[var(--bp-accent)]/30 bg-[var(--bp-accent-soft)]/60 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">
        BeePlan noticed a pattern
      </p>
      <p className="mt-2 text-sm font-semibold leading-6 text-[var(--bp-text)]">
        {suggestion.reason}
      </p>
      <p className="mt-1 text-xs text-[var(--bp-muted)]">{suggestion.preview}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onMakeRecurring(suggestion)}
          className="rounded-xl bg-[var(--bp-accent)] px-3 py-2 text-xs font-black text-[var(--bp-accent-text)] transition active:scale-[0.98]"
        >
          Make Recurring
        </button>
        <button
          type="button"
          onClick={() => onDismiss(suggestion)}
          className="rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-3 py-2 text-xs font-bold text-[var(--bp-text)] transition hover:border-[var(--bp-accent)]/50"
        >
          Dismiss
        </button>
      </div>
    </section>
  )
}
