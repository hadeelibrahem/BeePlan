import type { ReactNode } from 'react'
import { AppLayout, EmptyState, PageHeader, TopActionBar, type SidebarNavHandlers, type SidebarPage } from './layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'

export type { SidebarNavHandlers }

type PlaceholderPageScreenProps = SidebarNavHandlers & {
  active: SidebarPage
  title: string
  subtitle: string
  icon: ReactNode
  onSignOut?: () => void
}

export function PlaceholderPageScreen({ active, title, subtitle, icon, onSignOut, ...nav }: PlaceholderPageScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  return (
    <AppLayout active={active} {...nav} panelTitle="Keep going!" panelCaption="You're doing great today." panelPercent={64}>
      <PageHeader
        title={title}
        subtitle={subtitle}
        toolbar={
          <TopActionBar
            searchValue=""
            onSearchChange={() => {}}
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
      />

      <EmptyState
        icon={icon}
        title="Coming soon"
        description={`${title} isn't built yet, but you can keep exploring Dashboard, Tasks, and Reminders.`}
      />
    </AppLayout>
  )
}
