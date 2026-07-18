import Svg, { Path } from 'react-native-svg'

export type MobileIconName =
  | 'dashboard' | 'tasks' | 'focus' | 'reminders' | 'people' | 'notifications'
  | 'calendar' | 'check' | 'priority' | 'add' | 'search' | 'filter' | 'folder'

type Props = { name: MobileIconName; color: string; size?: number; accessibilityLabel?: string }

const PATHS: Record<MobileIconName, string> = {
  dashboard: 'M4 13h6V4H4v9zm0 7h6v-5H4v5zm10 0h6v-9h-6v9zm0-16v5h6V4h-6z',
  tasks: 'M5 5h14M5 12h14M5 19h14M3 5h.01M3 12h.01M3 19h.01',
  focus: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2',
  reminders: 'M18 9a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  people: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m6.5-1a3 3 0 1 0 0-6m2 16v-1a4 4 0 0 0-2-3.65',
  notifications: 'M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  check: 'M5 12l4 4L19 6',
  priority: 'M12 3v18m0-18 7 7m-7-7-7 7',
  add: 'M12 5v14M5 12h14',
  search: 'm21 21-4.35-4.35M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14z',
  filter: 'M4 6h16M7 12h10m-7 6h4',
  folder: 'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z',
}

/** Shared themed outline icons for the main mobile product surfaces. */
export function MobileIcon({ name, color, size = 20, accessibilityLabel }: Props) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityRole={accessibilityLabel ? 'image' : undefined} accessibilityLabel={accessibilityLabel}><Path d={PATHS[name]} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
}
