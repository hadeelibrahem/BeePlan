import { CalendarIcon } from '../components/layout'
import { PlaceholderPageScreen, type SidebarNavHandlers } from '../components/PlaceholderPageScreen'

export default function CalendarScreen(nav: SidebarNavHandlers & { onSignOut?: () => void }) {
  return (
    <PlaceholderPageScreen
      active="calendar"
      title="Calendar"
      subtitle="See your schedule at a glance"
      icon={<CalendarIcon className="h-6 w-6" />}
      {...nav}
    />
  )
}
