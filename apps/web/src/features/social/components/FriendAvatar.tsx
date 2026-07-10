type Props = {
  fullName: string
  avatarUrl?: string | null
  size?: number
}

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Round avatar: shows the photo when present, else colored initials. */
export function FriendAvatar({ fullName, avatarUrl, size = 40 }: Props) {
  const dimension = { width: size, height: size }
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fullName}
        style={dimension}
        className="shrink-0 rounded-full object-cover"
      />
    )
  }
  return (
    <div
      style={dimension}
      className="flex shrink-0 items-center justify-center rounded-full bg-[var(--bp-accent-soft)] text-xs font-black text-[var(--bp-accent)]"
      aria-hidden
    >
      {initials(fullName)}
    </div>
  )
}
