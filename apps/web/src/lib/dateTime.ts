export type BeePlanLocale = 'en' | 'ar' | string

export function localeFor(language: BeePlanLocale = 'en') {
  return language === 'ar' ? 'ar' : language === 'en' ? 'en-US' : language
}

/** Date-only API values are calendar days, not UTC instants. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    const [, year, month, day] = dateOnly
    const parsed = new Date(Number(year), Number(month) - 1, Number(day))
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(value: string | null | undefined, language: BeePlanLocale = 'en', options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const date = parseLocalDate(value)
  return date ? new Intl.DateTimeFormat(localeFor(language), options).format(date) : ''
}

export function formatDateTime(value: string | null | undefined, language: BeePlanLocale = 'en') {
  const date = parseLocalDate(value)
  return date ? new Intl.DateTimeFormat(localeFor(language), { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date) : ''
}
