import { useEffect, useState } from 'react'

export const isRenderableAppIcon = (value?: string | null) => {
  if (!value) return false
  if (/^https?:\/\//i.test(value)) return true
  return /^data:image\/(?:png|webp|jpeg|jpg|gif);base64,[A-Za-z0-9+/]+={0,2}$/i.test(value)
}

/** Renders only consented approved-app artwork supplied by the supervision API. */
export function AppIcon({ app, size = 'md' }: { app: { displayName?: string; iconReference?: string | null; icon?: string | null; iconUri?: string | null }; size?: 'sm' | 'md' }) {
  const [failed, setFailed] = useState(false)
  const source = [app.iconReference, app.iconUri, app.icon].find(isRenderableAppIcon) ?? null
  useEffect(() => { setFailed(false) }, [source])
  const classes = size === 'sm' ? 'h-7 w-7 text-xs' : 'h-11 w-11 text-base'
  return source && !failed ? <img src={source} alt="" onError={() => setFailed(true)} className={`${classes} shrink-0 rounded-xl object-cover ring-1 ring-[var(--bp-border)]`} /> : <span aria-hidden className={`${classes} grid shrink-0 place-items-center rounded-xl bg-[var(--bp-accent-soft)] font-black text-[var(--bp-accent-ink)]`}>{(app.displayName?.trim()[0] ?? '?').toUpperCase()}</span>
}
