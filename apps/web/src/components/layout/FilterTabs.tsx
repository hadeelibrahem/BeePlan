type FilterTabsProps<T extends string> = {
  tabs: { value: T; label: string }[]
  active: T
  onChange: (value: T) => void
}

export function FilterTabs<T extends string>({ tabs, active, onChange }: FilterTabsProps<T>) {
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-max gap-1 rounded-full border border-[var(--bp-border)] bg-[var(--bp-bg)]/60 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-150 ${
              active === tab.value ? 'bg-[var(--bp-accent)] text-[var(--bp-accent-text)]' : 'text-slate-400 hover:bg-[var(--bp-border)] hover:text-[var(--bp-text)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
