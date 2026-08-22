import { setGuardianRestrictionSources } from '../../../modules/beeplan-focus-blocker'
import { mobileSupervisionApi as api } from './api'

export type EnforcementState = 'strict_foreground_intervention' | 'released'

/** Server rules are authoritative; native receives only the union of active approved package names. */
export async function reconcileGuardianRestrictions(): Promise<{ state: EnforcementState; packages: string[] }> {
  await api.reconcile()
  const rules = await api.deviceRestrictions()
  const active = rules.filter(rule => rule.status === 'active' && Array.isArray(rule.blockedPackages) && rule.endsAt)
  const sources = active.map(rule => ({ sourceId: `guardian:${rule.id}`, packages: rule.blockedPackages as string[], endsAtMs: new Date(rule.endsAt).getTime() })).filter(source => Number.isFinite(source.endsAtMs))
  const result = await setGuardianRestrictionSources(sources)
  return { state: result.blockedPackages.length ? 'strict_foreground_intervention' : 'released', packages: result.blockedPackages }
}
