import { useMemo, useState } from 'react'
import type { AuthUser } from '../../lib/api'
import { useLanguage } from '../../i18n/LanguageContext'
import { updateProfile } from './settings.api'

const COMMON: Array<[string, string]> = [
  ['Asia/Hebron', 'palestine'],
  ['Asia/Amman', 'amman'],
  ['Europe/London', 'london'],
  ['America/New_York', 'newYork'],
  ['America/Los_Angeles', 'losAngeles'],
  ['UTC', 'utc'],
]

function allZones() {
  const supported = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  const map = new Map(COMMON)
  for (const id of supported) {
    if (!map.has(id)) map.set(id, id.split('/').at(-1)?.replaceAll('_', ' ') ?? id)
  }
  return [...map].map(([id, city]) => ({ id, city }))
}

function display(id: string, city: string, locale: string) {
  const offset = new Intl.DateTimeFormat(locale, {
    timeZone: id,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? 'UTC'
  return `${city} (${id}) — ${offset}`
}

export function TimezoneSelector({
  user,
  token,
  onUpdated,
}: {
  user: AuthUser
  token: string
  onUpdated: (user: AuthUser) => void
}) {
  const { language, t } = useLanguage()
  const zones = useMemo(allZones, [])
  const [value, setValue] = useState(user.timezone)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const filtered = zones
    .filter((item) => `${item.city} ${item.id}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 80)

  const save = async (next: string) => {
    if (next === user.timezone) return
    setValue(next)
    setStatus('settingsTimezone.saving')
    try {
      const updated = await updateProfile(token, {
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        timezone: next,
      })
      onUpdated(updated)
      setStatus('settingsTimezone.saved')
    } catch (error) {
      console.error('Unable to save timezone', error)
      setValue(user.timezone)
      setStatus('settingsTimezone.saveFailed')
    }
  }

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return (
    <div className="space-y-2">
      <label className="space-y-1">
        <span className="text-xs font-bold text-[var(--bp-muted)]">{t('settingsTimezone.label')}</span>
        <input
          className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-sm text-[var(--bp-text)]"
          placeholder={t('settingsTimezone.searchPlaceholder')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label={t('settingsTimezone.label')}
          className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-input)] px-3 py-2 text-sm text-[var(--bp-text)]"
          value={value}
          onChange={(event) => void save(event.target.value)}
        >
          {filtered.map((item) => {
            const commonCity = COMMON.some(([id]) => id === item.id)
              ? t(`settingsTimezone.cities.${item.city}`)
              : item.city
            return <option key={item.id} value={item.id}>{display(item.id, commonCity, language)}</option>
          })}
        </select>
      </label>
      {user.timezone === 'UTC' && detected !== 'UTC' ? (
        <button
          type="button"
          className="text-xs font-bold text-[var(--bp-accent-ink)]"
          onClick={() => void save(detected)}
        >
          {t('settingsTimezone.useDevice', { timezone: detected })}
        </button>
      ) : null}
      {status ? <p role="status" className="text-xs font-bold text-[var(--bp-muted)]">{t(status)}</p> : null}
    </div>
  )
}
