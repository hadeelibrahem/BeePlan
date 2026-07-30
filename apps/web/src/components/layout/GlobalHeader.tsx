import { MenuIcon } from './icons'
import { TopActionBar } from './TopActionBar'
import { useLanguage } from '../../i18n/LanguageContext'
import { useTheme } from '../../theme/ThemeContext'
import { useAuth } from '../../hooks/useAuth'

type Props = {
  onOpenMenu: () => void
  onOpenNotifications?: () => void
  onOpenSettings?: () => void
}

/** Shared authenticated application chrome. Page titles and page actions stay
 * in the content area; only global account, preference and notification
 * controls live here. */
export function GlobalHeader({ onOpenMenu, onOpenNotifications, onOpenSettings }: Props) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()
  const { signOut } = useAuth()

  return (
    <header className="bp-global-header h-16 shrink-0 border-b border-white/5 bg-[#1A1F2C]/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between px-6 sm:px-8">
        
        {/* Left Column (Only visible on mobile/tablet to toggle sidebar drawer) */}
        <div className="flex lg:hidden shrink-0 items-center gap-3">
          <button 
            type="button" 
            onClick={onOpenMenu} 
            aria-label="Open menu" 
            className="bp-header-control flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-slate-800/50 text-[var(--bp-text)] hover:bg-slate-700/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FDEF4B]"
          >
            <MenuIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Center Column: Central Global Search Bar */}
        <div className="hidden md:flex flex-1 justify-center max-w-xl mx-4">
          <div className="bp-header-search relative w-full rounded-lg">
            <span className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden="true">
                <circle cx="11" cy="11" r="8" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Search workspaces, tasks, or settings..."
              className="w-full h-9 ps-10 pe-16 rounded-lg bg-slate-800/45 border border-white/8 text-sm text-[var(--bp-text)] placeholder-slate-400 outline-none transition focus:border-[#FDEF4B] focus:ring-2 focus:ring-[#FDEF4B]/60"
            />
            <div className="absolute inset-y-0 end-0 flex items-center pe-2 pointer-events-none">
              <kbd className="hidden sm:inline-flex items-center gap-1 rounded bg-slate-850 border border-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                Ctrl K
              </kbd>
            </div>
          </div>
        </div>

        {/* Right Column: Auto right utility controls */}
        <div className="flex items-center justify-end flex-1 md:flex-initial">
          <TopActionBar
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={onOpenNotifications}
            onOpenProfile={onOpenSettings}
            onSignOut={signOut}
          />
        </div>

      </div>
    </header>
  )
}
