import { useEffect, useMemo, useRef, useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import type { GeneralLocationCategory } from '../types/reminders.types'

const PLACE_TYPES: GeneralLocationCategory[] = [
  'home',
  'work',
  'university',
  'school',
  'gym',
  'pharmacy',
  'grocery_store',
  'coffee_shop',
  'restaurant',
  'hospital',
  'airport',
  'bank',
  'atm',
  'parking',
  'gas_station',
  'mosque',
  'library',
  'custom',
]

type Props = {
  value?: GeneralLocationCategory
  customLabel?: string
  onChange: (category: GeneralLocationCategory) => void
  onCustomLabelChange: (label: string) => void
}

export function PlaceTypeAutocomplete({ value, customLabel, onChange, onCustomLabelChange }: Props) {
  const { t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedLabel = value ? t(`reminders.generalLocationCategory.${value}`) : ''
  const displayValue = isOpen ? query : selectedLabel

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setQuery('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredTypes = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return PLACE_TYPES
    return PLACE_TYPES.filter((type) => t(`reminders.generalLocationCategory.${type}`).toLowerCase().includes(normalized))
  }, [query, t])

  const openDropdown = () => {
    setQuery('')
    setIsOpen(true)
  }

  const handleSelect = (type: GeneralLocationCategory) => {
    onChange(type)
    setQuery('')
    setIsOpen(false)
  }

  return (
    <div>
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.placeType')}</p>
      <div ref={containerRef} className="relative">
        <input
          value={displayValue}
          onChange={(event) => {
            setQuery(event.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={openDropdown}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false)
              setQuery('')
            }
          }}
          placeholder={t('reminders.placeTypePlaceholder')}
          autoComplete="off"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="w-full rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 pe-9 text-base font-semibold text-[var(--bp-text)] outline-none transition placeholder:text-[var(--bp-placeholder)] placeholder:font-normal focus:border-[var(--bp-accent)]"
        />
        <span className="pointer-events-none absolute inset-y-0 end-4 flex items-center text-xs text-[var(--bp-subtle)]">▾</span>

        {isOpen && (
          <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] shadow-[0_16px_40px_var(--bp-shadow)]">
            {filteredTypes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-[var(--bp-subtle)]">{t('reminders.placeTypeNoResults')}</p>
            ) : (
              <ul role="listbox" className="divide-y divide-[var(--bp-border)]">
                {filteredTypes.map((type) => (
                  <li key={type}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={value === type}
                      onClick={() => handleSelect(type)}
                      className={`block w-full px-4 py-3 text-start text-sm font-semibold transition hover:bg-[var(--bp-accent-soft)] ${
                        value === type ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-text)]'
                      }`}
                    >
                      {t(`reminders.generalLocationCategory.${type}`)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {value === 'custom' && (
        <label className="mt-3 block rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
          <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
            {t('reminders.customPlaceType')}
          </span>
          <input
            value={customLabel ?? ''}
            onChange={(event) => onCustomLabelChange(event.target.value)}
            placeholder={t('reminders.customLabelPlaceholder')}
            className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
          />
        </label>
      )}
    </div>
  )
}
