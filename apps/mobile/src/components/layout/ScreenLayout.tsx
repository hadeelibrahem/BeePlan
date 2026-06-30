import type { ReactNode } from 'react'
import { AppHeader } from './AppHeader'
import { AppScreen } from './AppScreen'

type ScreenLayoutProps = {
  children: ReactNode
  headerSubtitle?: string
  onProfilePress?: () => void
  profileInitial?: string
  scroll?: boolean
  keyboardAvoiding?: boolean
  fab?: ReactNode
  footer?: ReactNode
  contentClassName?: string
}

export function ScreenLayout({
  children,
  headerSubtitle,
  onProfilePress,
  profileInitial,
  scroll,
  keyboardAvoiding,
  fab,
  footer,
  contentClassName,
}: ScreenLayoutProps) {
  return (
    <AppScreen scroll={scroll} keyboardAvoiding={keyboardAvoiding} fab={fab} footer={footer} contentClassName={contentClassName}>
      <AppHeader subtitle={headerSubtitle} onProfilePress={onProfilePress} profileInitial={profileInitial} />
      {children}
    </AppScreen>
  )
}
