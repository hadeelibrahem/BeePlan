import { useEffect, useState } from 'react'
import { achievementImageUrl } from '../lib/achievementsApi'

export function AuthenticatedImage({ token, achievementId, imageId, className, alt = '' }: { token: string; achievementId: string; imageId: string; className?: string; alt?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    let objectUrl: string | undefined
    setSrc(null); setFailed(false)
    fetch(achievementImageUrl(achievementId, imageId), { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => { if (!response.ok) throw new Error('Image unavailable'); return response.blob() })
      .then((blob) => { if (active) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [token, achievementId, imageId])
  if (failed) return <div className={`${className ?? ''} flex items-center justify-center bg-[var(--bp-bg)] text-xs text-[var(--bp-muted)]`}>Photo unavailable</div>
  return src ? <img src={src} alt={alt} className={className} /> : <div className={`${className ?? ''} animate-pulse bg-[var(--bp-bg)]`} />
}
