import {
  AppLayout,
  DangerButton,
  PageHeader,
  SecondaryButton,
  SectionCard,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { SavedPlacesSection } from '../features/context/components/SavedPlacesSection'
import { WeeklyCommitmentsSection } from '../features/context/components/WeeklyCommitmentsSection'
import { useAuth } from '../hooks/useAuth'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { AccountSettings, AiSettings, GeneralSettings } from '../features/settings/SettingsHubSections'

type SettingsScreenProps = SidebarNavHandlers & {
  accessToken?: string
  onSignOut?: () => void
}

function SettingRow({ label, description, action }: { label: string; description: string; action: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-bold text-[var(--bp-text)]">{label}</p>
        <p className="text-xs text-[var(--bp-muted)]">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  )
}

/**
 * Profile / Settings. The distinctive part is the "Personal Context" group
 * (Saved Places + Weekly Commitments) that teaches BeePlan permanent info the AI
 * uses everywhere. The remaining sections mirror the app's existing controls.
 */
export default function SettingsScreen({ accessToken, onSignOut, ...nav }: SettingsScreenProps) {
  const { user, updateUser } = useAuth()
  const { toggleLanguage, language } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  return (
    <AppLayout active="settings" {...nav}>
      <PageHeader
        title="Settings"
        subtitle="Your profile, permanent context, and preferences"
        toolbar={
          <TopActionBar
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        {/* 1. Account */}
        <div className="hidden">
        <SectionCard>
          <h3 className="mb-3 text-sm font-black text-[var(--bp-text)]">Account</h3>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bp-accent)]/20 text-lg font-black text-[var(--bp-accent)]">
              {(user?.fullName ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--bp-text)]">{user?.fullName ?? '—'}</p>
              <p className="truncate text-xs text-[var(--bp-muted)]">{user?.email ?? ''}</p>
            </div>
          </div>
        </SectionCard>
        </div>
        <AccountSettings user={user} token={accessToken} onUpdated={updateUser} />

        {/* 2. Personal Context — the distinctive section */}
        <div className="space-y-2">
          <div className="px-1">
            <h2 className="text-xs font-black uppercase tracking-wide text-[var(--bp-muted)]">Personal Context</h2>
            <p className="text-xs text-[var(--bp-muted)]">
              Permanent places and recurring commitments BeePlan AI uses everywhere — parsing reminders, planning days, and scheduling around your fixed time.
            </p>
          </div>
          <SavedPlacesSection accessToken={accessToken} />
          <WeeklyCommitmentsSection accessToken={accessToken} />
        </div>

        {/* 3. AI Preferences */}
        <div className="hidden">
        <SectionCard>
          <h3 className="mb-1 text-sm font-black text-[var(--bp-text)]">AI Preferences</h3>
          <SettingRow
            label="Planner preferences"
            description="Focus hours, energy, buffers, and unavailable windows."
            action={<SecondaryButton onClick={nav.onNavigatePlanner}>Open AI Planner</SecondaryButton>}
          />
        </SectionCard>
        </div>
        <AiSettings token={accessToken} onOpen={nav.onNavigatePlanner} />

        {/* 4. Notifications & 5. Calendar & Planning */}
        <div className="hidden">
        <SectionCard>
          <h3 className="mb-1 text-sm font-black text-[var(--bp-text)]">Notifications</h3>
          <SettingRow
            label="Notification center"
            description="Reminders, collaboration, and location alerts."
            action={<SecondaryButton onClick={nav.onNavigateNotifications}>Open</SecondaryButton>}
          />
        </SectionCard>
        </div>
        <GeneralSettings mode={mode} language={language} timezone={user?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone} token={accessToken} onTheme={toggleTheme} onLanguage={toggleLanguage} onNotifications={nav.onNavigateNotifications} onDeleted={() => void onSignOut?.()} />

        <SectionCard>
          <h3 className="mb-1 text-sm font-black text-[var(--bp-text)]">Calendar &amp; Planning</h3>
          <SettingRow
            label="Calendar"
            description="See tasks, reminders, and commitments on a timeline."
            action={<SecondaryButton onClick={nav.onNavigateCalendar}>Open calendar</SecondaryButton>}
          />
        </SectionCard>

        {/* 9. Logout */}
        <SectionCard>
          <SettingRow
            label="Sign out"
            description="End your session on this device."
            action={<DangerButton onClick={onSignOut}>Log out</DangerButton>}
          />
        </SectionCard>
      </div>
    </AppLayout>
  )
}
