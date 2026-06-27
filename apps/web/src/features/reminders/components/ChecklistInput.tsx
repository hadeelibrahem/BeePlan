import { useLanguage } from '../../../i18n/LanguageContext'
import type { ChecklistItem } from '../types/reminders.types'

type Props = {
  value: ChecklistItem[]
  onChange: (value: ChecklistItem[]) => void
}

export function ChecklistInput({ value, onChange }: Props) {
  const { formatNumber, t } = useLanguage()
  const addItem = () => onChange([...value, { id: `item-${Date.now()}`, title: '', isDone: false }])
  const updateItem = (id: string, title: string) =>
    onChange(value.map((item) => (item.id === id ? { ...item, title } : item)))
  const removeItem = (id: string) => onChange(value.filter((item) => item.id !== id))

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.checklist')}</p>
        <button
          type="button"
          onClick={addItem}
          className="rounded-full border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] px-4 py-2 text-xs font-black text-[var(--bp-accent)]"
        >
          {t('reminders.addItem')}
        </button>
      </div>
      <div className="grid gap-3">
        {value.map((item, index) => (
          <div key={item.id} className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] text-xs font-black text-[var(--bp-accent)]">
              {formatNumber(index + 1)}
            </span>
            <input
              value={item.title}
              onChange={(event) => updateItem(item.id, event.target.value)}
              placeholder={t('reminders.checklistItem')}
              className="min-w-0 flex-1 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] focus:border-[var(--bp-accent)]"
            />
            <button type="button" onClick={() => removeItem(item.id)} className="px-2 py-2 font-black text-[var(--bp-subtle)]">
              x
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
