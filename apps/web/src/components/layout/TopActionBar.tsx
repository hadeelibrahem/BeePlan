import { useState } from 'react'
import { BellIcon, MoonIcon, SearchIcon, SunIcon } from './icons'

type TopActionBarProps = {
  searchValue: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  themeMode: 'dark' | 'light'
  onToggleTheme: () => void
  languageLabel: string
  onToggleLanguage: () => void
  notificationCount?: number
  profileInitial?: string
  onProfileClick?: () => void
}

const ICON_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bp-border)] transition-colors hover:bg-[var(--bp-border)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bp-bg)]'

/**
 * The single shared top-right action area used by every page (Dashboard, Tasks,
 * Reminders, Calendar, Notes, Analytics, ...). Only global, app-wide controls
 * belong here — page-specific actions (Sort, Filter, "New X") render separately
 * via PageHeader's `pageActions` slot instead, so this bar stays identical
 * everywhere.
 */
export function TopActionBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  themeMode,
  onToggleTheme,
  languageLabel,
  onToggleLanguage,
  notificationCount = 0,
  profileInitial = 'F',
  onProfileClick,
}: TopActionBarProps) {
  const [showSearch, setShowSearch] = useState(false)

  return (
    <div className="flex h-11 flex-wrap items-center gap-3">
      {showSearch ? (
        <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3">
          <SearchIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            autoFocus
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-40 bg-transparent text-sm text-[var(--bp-text)] outline-none placeholder:text-slate-500 sm:w-56"
          />
          <button
            type="button"
            onClick={() => {
              setShowSearch(false)
              onSearchChange('')
            }}
            aria-label="Close search"
            className="shrink-0 text-sm font-black text-slate-400 hover:text-[var(--bp-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)]"
          >
            ×
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setShowSearch(true)} aria-label="Search" className={ICON_BUTTON}>
          <SearchIcon className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        onClick={onToggleTheme}
        aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        className={ICON_BUTTON}
      >
        {themeMode === 'dark' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
      </button>

      <button
        type="button"
        onClick={onToggleLanguage}
        aria-label="Switch language"
        className="flex h-11 items-center justify-center rounded-xl bg-[var(--bp-border)] px-4 text-sm font-bold transition-colors hover:bg-[var(--bp-border)]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bp-bg)]"
      >
        {languageLabel}
      </button>

      <button type="button" aria-label="Notifications" className={`relative ${ICON_BUTTON}`}>
        <BellIcon className="h-4 w-4" />
        {notificationCount > 0 && (
          <span className="absolute -end-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bp-accent)] text-[10px] font-black text-[var(--bp-accent-text)]">
            {notificationCount > 9 ? '9+' : notificationCount}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onProfileClick}
        aria-label="Profile"
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--bp-accent)] text-sm font-black text-[var(--bp-accent-text)] transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bp-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bp-bg)]"
      >
        {profileInitial}
      </button>
    </div>
  )
}
