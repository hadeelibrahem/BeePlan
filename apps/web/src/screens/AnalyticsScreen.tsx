import { AnalyticsIcon } from '../components/layout'
import { PlaceholderPageScreen, type SidebarNavHandlers } from '../components/PlaceholderPageScreen'

export default function AnalyticsScreen(nav: SidebarNavHandlers & { onSignOut?: () => void }) {
  return (
    <PlaceholderPageScreen
      active="analytics"
      title="Analytics"
      subtitle="Track your productivity over time"
      icon={<AnalyticsIcon className="h-6 w-6" />}
      {...nav}
    />
  )
}
