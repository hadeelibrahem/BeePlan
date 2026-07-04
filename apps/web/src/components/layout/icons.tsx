type IconProps = { className?: string }

const base = 'h-5 w-5'

export function DashboardIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </svg>
  )
}

export function TasksIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 11l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3" y="4" width="18" height="16" rx="3" />
    </svg>
  )
}

export function RemindersIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 5a5 5 0 0 1 5 5v3l1.5 3h-13L7 13v-3a5 5 0 0 1 5-5Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
    </svg>
  )
}

export function CalendarIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
    </svg>
  )
}

export function NotesIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 3h11l3 3v15H5z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 9h6M9 13h6M9 17h3" strokeLinecap="round" />
    </svg>
  )
}

export function AnalyticsIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 20V10M11 20V4M18 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function FocusIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function SearchIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" strokeLinecap="round" />
    </svg>
  )
}

export function MoonIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  )
}

export function SunIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" strokeLinecap="round" />
    </svg>
  )
}

export function BellIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M18 8a6 6 0 1 0-12 0c0 3.5-1 5-2 7h16c-1-2-2-3.5-2-7Z" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" strokeLinecap="round" />
    </svg>
  )
}

export function GlobeIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" strokeLinecap="round" />
    </svg>
  )
}

export function MenuIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}

export function CloseIcon({ className = base }: IconProps) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  )
}
