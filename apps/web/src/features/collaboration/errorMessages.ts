/**
 * Maps API errors (and known backend messages) to friendly, user-facing copy.
 * Never surface a raw backend string — always route through here. §13.
 */
export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = error as (Error & { status?: number }) | undefined
  const raw = (err?.message ?? '').toLowerCase()

  if (raw === 'network') {
    return 'You appear to be offline. Check your connection and try again.'
  }
  if (raw.includes('already a member')) return 'This person is already a member.'
  if (raw.includes('pending invite')) return 'This person already has a pending invite.'
  if (raw.includes('friends with')) return 'You can only invite people you are friends with.'
  if (raw.includes('owner')) return err?.message ?? fallback // owner-rule messages are already friendly
  if (err?.status === 403) return 'You do not have permission to do that.'
  if (err?.status === 404) return 'This task is no longer available.'
  if (err?.status === 409) return 'This action conflicts with the current state. Refresh and try again.'
  if (raw && raw !== 'request_failed') return err?.message ?? fallback
  return fallback
}
