import { NotesIcon } from '../components/layout'
import { PlaceholderPageScreen, type SidebarNavHandlers } from '../components/PlaceholderPageScreen'

export default function NotesScreen(nav: SidebarNavHandlers & { onSignOut?: () => void }) {
  return (
    <PlaceholderPageScreen
      active="notes"
      title="Notes"
      subtitle="Jot down ideas and quick thoughts"
      icon={<NotesIcon className="h-6 w-6" />}
      {...nav}
    />
  )
}
