import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { AppScreen } from './AppScreen'

type ScreenLayoutProps = {
  children: ReactNode
  headerSubtitle?: string
  onSignOut?: () => Promise<void> | void
  onOpenNotifications?: () => void
  unreadCount?: number
  scroll?: boolean
  keyboardAvoiding?: boolean
  fab?: ReactNode
  footer?: ReactNode
  contentClassName?: string
  refreshing?: boolean
  onRefresh?: () => void
}

export function ScreenLayout({
  children,
  headerSubtitle,
  onSignOut,
  onOpenNotifications,
  unreadCount,
  scroll,
  keyboardAvoiding,
  fab,
  footer,
  contentClassName,
  refreshing,
  onRefresh,
}: ScreenLayoutProps) {
  return (
    <AppScreen scroll={scroll} keyboardAvoiding={keyboardAvoiding} fab={fab} footer={footer} contentClassName={contentClassName} refreshing={refreshing} onRefresh={onRefresh}>
      <AppHeader subtitle={headerSubtitle} onSignOut={onSignOut} onOpenNotifications={onOpenNotifications} unreadCount={unreadCount} />
      {children}
    </AppScreen>
  )
}
