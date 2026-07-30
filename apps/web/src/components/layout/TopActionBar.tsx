import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useLanguage } from '../../i18n/LanguageContext'
import { BellIcon, MoonIcon, SearchIcon, SunIcon } from './icons'

type TopActionBarProps = {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  themeMode?: 'dark' | 'light'
  onToggleTheme?: () => void
  languageLabel?: string
  onToggleLanguage?: () => void
  notificationCount?: number
  onOpenNotifications?: () => void
  onOpenProfile?: () => void
  onSignOut?: () => Promise<void> | void
  /** Page headers may retain their local search affordance without duplicating
   * the global controls rendered by GlobalHeader. */
  pageOnly?: boolean
}

const ICON_BUTTON =
  'bp-header-control flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-slate-800/50 text-[var(--bp-text)] transition-colors hover:bg-slate-700/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDEF4B] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1A1F2C]'

function userInitial(name?: string, email?: string) {
  return (name?.trim() || email?.trim() || '?').charAt(0).toUpperCase()
}

export function TopActionBar({
  searchValue = '',
  onSearchChange,
  searchPlaceholder,
  themeMode,
  onToggleTheme,
  languageLabel,
  onToggleLanguage,
  notificationCount = 0,
  onOpenNotifications,
  onOpenProfile,
  onSignOut,
  pageOnly = false,
}: TopActionBarProps) {
  const { user } = useAuth()
  const { t, language } = useLanguage()
  const searchable = Boolean(onSearchChange)
  const placeholder = searchPlaceholder ?? t('topBar.searchPlaceholder')
  const [showSearch, setShowSearch] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isSignOutDialogOpen, setIsSignOutDialogOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarRef = useRef<HTMLButtonElement>(null)

  const closeMenu = (restoreFocus = true) => {
    setIsMenuOpen(false)
    if (restoreFocus) requestAnimationFrame(() => avatarRef.current?.focus())
  }

  useEffect(() => {
    if (!isMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) closeMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMenuOpen])

  const handleMenuKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    event.preventDefault()
    items[next]?.focus()
  }

  async function confirmSignOut() {
    if (isSigningOut || !onSignOut) return
    setIsSigningOut(true)
    setSignOutError('')
    try {
      await onSignOut()
      setIsSignOutDialogOpen(false)
    } catch (error) {
      setSignOutError(error instanceof Error ? error.message : t('account.signOutError'))
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="flex h-9 flex-wrap items-center gap-2">
      {searchable && (showSearch ? (
        <div className="bp-header-search flex h-9 items-center gap-2 rounded-lg border border-white/8 bg-slate-800/45 px-2.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-[var(--bp-muted)]" />
          <input autoFocus value={searchValue} onChange={(event) => onSearchChange?.(event.target.value)} placeholder={placeholder} className="w-32 bg-transparent text-xs text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-muted)] sm:w-44" />
          <button type="button" onClick={() => { setShowSearch(false); onSearchChange?.('') }} aria-label={t('topBar.closeSearch')} className="shrink-0 text-sm font-black text-[var(--bp-muted)] hover:text-[var(--bp-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDEF4B]">x</button>
        </div>
      ) : <button type="button" onClick={() => setShowSearch(true)} aria-label={t('actions.search')} className={ICON_BUTTON}><SearchIcon className="h-3.5 w-3.5" /></button>)}
      {!pageOnly && onToggleTheme && <button type="button" onClick={onToggleTheme} aria-label={themeMode === 'dark' ? t('topBar.switchToLight') : t('topBar.switchToDark')} className={ICON_BUTTON}>{themeMode === 'dark' ? <MoonIcon className="h-3.5 w-3.5 text-slate-300" /> : <SunIcon className="h-3.5 w-3.5 text-slate-300" />}</button>}
      {!pageOnly && onToggleLanguage && <button type="button" onClick={onToggleLanguage} aria-label={t('actions.switchLanguage')} className={`${ICON_BUTTON} text-[11px] font-black`}>{language === 'ar' ? 'EN' : 'AR'}</button>}
      {!pageOnly && onOpenNotifications && <button type="button" onClick={onOpenNotifications} aria-label={t('topBar.notifications')} className={`relative ${ICON_BUTTON}`}><BellIcon className="h-3.5 w-3.5 text-slate-300" />{notificationCount > 0 && <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-[#FDEF4B] ring-2 ring-slate-900 shadow-[0_0_8px_rgba(253,239,75,0.65)]" />}</button>}

      {!pageOnly && <div ref={menuRef} className="relative">
        <button ref={avatarRef} type="button" onClick={() => setIsMenuOpen((open) => !open)} aria-label={t('topBar.openAccountMenu')} aria-haspopup="menu" aria-expanded={isMenuOpen} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#FDEF4B]/40 bg-[#FDEF4B]/10 text-xs font-black text-[#FDEF4B] transition hover:bg-[#FDEF4B]/20 hover:border-[#FDEF4B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDEF4B]">{userInitial(user?.fullName, user?.email)}</button>
        {isMenuOpen && <div role="menu" aria-label={t('account.title')} onKeyDown={handleMenuKeys} className="bp-modal absolute end-0 top-11 z-50 w-64 rounded-xl border border-white/5 bg-slate-900 p-2 shadow-xl">
          <div className="border-b border-white/5 px-3 py-2"><p className="truncate text-sm font-black text-[var(--bp-text)]">{user?.fullName || t('account.title')}</p>{user?.email && <p className="truncate text-xs text-[var(--bp-muted)]">{user.email}</p>}</div>
          {onOpenProfile && <button type="button" role="menuitem" onClick={() => { closeMenu(false); onOpenProfile() }} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--bp-text)] hover:bg-slate-800">Settings</button>}
          {onToggleTheme && <button type="button" role="menuitem" onClick={onToggleTheme} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--bp-text)] hover:bg-slate-800">{t('account.theme')}: {themeMode === 'dark' ? t('actions.darkMode') : t('actions.lightMode')}</button>}
          {onToggleLanguage && <button type="button" role="menuitem" onClick={onToggleLanguage} className="w-full rounded-lg px-3 py-2 text-left text-sm font-bold text-[var(--bp-text)] hover:bg-slate-800">{t('account.language')}: {languageLabel}</button>}
          <button type="button" role="menuitem" onClick={() => { closeMenu(false); setIsSignOutDialogOpen(true) }} className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-black text-red-500 hover:bg-red-500/10">{t('actions.signOut')}</button>
        </div>}
      </div>
      }

      {isSignOutDialogOpen && <div role="alertdialog" aria-modal="true" aria-labelledby="sign-out-title" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4">
        <div className="bp-modal w-full max-w-sm rounded-xl border border-white/5 bg-slate-900 p-5 shadow-2xl">
          <h2 id="sign-out-title" className="text-lg font-black text-[var(--bp-text)]">{t('account.signOutTitle')}</h2>
          <p className="mt-2 text-sm text-[var(--bp-muted)]">{t('account.signOutBody', { brand: t('common.brand_name') })}</p>
          {signOutError && <p className="mt-3 rounded-lg bg-red-500/10 p-2 text-sm font-bold text-red-500">{signOutError}</p>}
          <div className="mt-5 flex justify-end gap-3"><button type="button" disabled={isSigningOut} onClick={() => setIsSignOutDialogOpen(false)} className="rounded-lg border border-white/5 px-3 py-2 text-sm font-bold text-[var(--bp-text)] disabled:opacity-50">{t('common.cancel')}</button><button type="button" disabled={isSigningOut} onClick={() => void confirmSignOut()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-black text-white disabled:opacity-50">{isSigningOut ? t('account.signingOut') : t('actions.signOut')}</button></div>
        </div>
      </div>}
    </div>
  )
}
