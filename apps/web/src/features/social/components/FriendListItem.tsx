import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { FriendSummary } from '../types/social.types'
import { FriendAvatar } from './FriendAvatar'
import { useLanguage } from '../../../i18n/LanguageContext'

type Props = {
  friend: FriendSummary
  onRemove: (friend: FriendSummary) => void
  onReport: (friend: FriendSummary) => void
  /** Future friend-detail seam. When omitted the row isn't clickable. */
  onSelect?: (friend: FriendSummary) => void
}

type MenuPosition = { top: number; left: number }
const VIEWPORT_GUTTER = 8
const MENU_GAP = 6

/** A single friend row: avatar, display name, username, and secondary actions. */
export function FriendListItem({ friend, onRemove, onReport, onSelect }: Props) {
  const { t } = useLanguage()
  const [menuOpen, setMenuOpen] = useState(false)
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const clickable = Boolean(onSelect)

  const updatePosition = () => {
    const trigger = triggerRef.current
    const menu = menuRef.current
    if (!trigger || !menu) return
    const triggerRect = trigger.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const left = Math.min(Math.max(VIEWPORT_GUTTER, triggerRect.right - menuRect.width), window.innerWidth - menuRect.width - VIEWPORT_GUTTER)
    const opensDownward = triggerRect.bottom + MENU_GAP + menuRect.height <= window.innerHeight - VIEWPORT_GUTTER
    setPosition({ left, top: opensDownward ? triggerRect.bottom + MENU_GAP : Math.max(VIEWPORT_GUTTER, triggerRect.top - MENU_GAP - menuRect.height) })
  }

  useEffect(() => {
    if (!menuOpen) { setPosition(null); return }
    updatePosition()
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => { window.removeEventListener('resize', updatePosition); window.removeEventListener('scroll', updatePosition, true); document.removeEventListener('mousedown', closeOnOutsideClick); document.removeEventListener('keydown', closeOnEscape) }
  }, [menuOpen])

  const closeThen = (action: () => void) => { setMenuOpen(false); action() }
  const menu = menuOpen && typeof document !== 'undefined' ? createPortal(
    <div ref={menuRef} role="menu" aria-label={t('actions.show')} style={position ? { top: position.top, left: position.left } : { top: 0, left: 0, visibility: 'hidden' }} className="fixed z-[60] min-w-40 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-1 shadow-lg">
      <button type="button" role="menuitem" onClick={() => closeThen(() => onSelect?.(friend))} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--bp-text)] hover:bg-[var(--bp-bg)]">{t('people.title')}</button>
      <button type="button" role="menuitem" onClick={() => closeThen(() => onSelect?.(friend))} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[var(--bp-text)] hover:bg-[var(--bp-bg)]">{t('people.sharing.manage')}</button>
      <button type="button" role="menuitem" onClick={() => closeThen(() => onReport(friend))} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">{t('people.friends.report')}</button>
      <button type="button" role="menuitem" onClick={() => closeThen(() => onRemove(friend))} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-500/10">{t('people.friends.remove')}</button>
    </div>, document.body,
  ) : null

  return <div className="group relative flex items-center gap-3 rounded-xl border-b border-[var(--bp-border)] px-2 py-3 transition hover:bg-[var(--bp-bg)] last:border-0"><button type="button" disabled={!clickable} onClick={() => onSelect?.(friend)} className={`flex flex-1 items-center gap-3 text-start ${clickable ? 'cursor-pointer' : 'cursor-default'}`}><FriendAvatar fullName={friend.fullName} avatarUrl={friend.avatarUrl} /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[var(--bp-text)]">{friend.fullName}</span><span className="block truncate text-[11px] text-[var(--bp-muted)]">@{friend.username}</span></span></button><span className="hidden rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-600 sm:inline-flex">{t('focusHome.statusActive')}</span><button ref={triggerRef} type="button" aria-label={t('actions.show')} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)} className="rounded-lg p-2 text-lg leading-none text-[var(--bp-muted)] opacity-70 transition hover:bg-[var(--bp-surface)] hover:text-[var(--bp-text)] group-hover:opacity-100">⋯</button>{menu}</div>
}
