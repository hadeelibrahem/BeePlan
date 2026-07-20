export type GreetingPeriod = 'morning' | 'afternoon' | 'evening'

/** Returns a local-device greeting period without relying on server time. */
export function getGreetingPeriod(date: Date = new Date()): GreetingPeriod {
  const hour = date.getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

export function greetingTranslationKey(date: Date = new Date()) {
  return `dashboard.greeting.${getGreetingPeriod(date)}` as const
}
