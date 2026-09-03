import { deliverAppGuardRequestResult, getPendingAppGuardRequest, isAppGuardResultDeliveryAvailable, setAppGuardRestrictionSources, subscribeToEvents, type BeeJustificationRequestEvent } from '../../../modules/beeplan-focus-blocker'
import { mobileAppGuardApi as api } from './api'

export type EnforcementState = 'strict_foreground_intervention' | 'released'

/** Server rules are authoritative; native receives only the union of active approved package names. */
export async function reconcileAppGuardRestrictions(): Promise<{ state: EnforcementState; packages: string[] }> {
  const rule = await api.restrictions()
  if (__DEV__) console.info(`[AppGuard:Mobile] sync start enabled=${rule.enabled} restrictedCount=${rule.packages.length}`)
  const sources = rule.enabled && rule.packages.length ? [{ sourceId: 'app-guard', packages: rule.packages, endsAtMs: Date.UTC(2099, 0, 1) }] : []
  const result = await setAppGuardRestrictionSources(sources)
  if (__DEV__) console.info(`[AppGuard:Mobile] native sync restrictedCount=${result.blockedPackages.length}`)
  if (__DEV__) console.info('[AppGuard:Mobile] sync success')
  return { state: result.blockedPackages.length ? 'strict_foreground_intervention' : 'released', packages: result.blockedPackages }
}

/** @deprecated Legacy-only symbol; the visible route uses reconcileAppGuardRestrictions. */
export const reconcileGuardianRestrictions = reconcileAppGuardRestrictions
let activeReconcile: (() => Promise<void>) | null = null
let appGuardRequestInFlight = false
let appGuardAppState = 'active'

/** AppState is diagnostic/recovery only; it never removes or invalidates the authenticated listener. */
export function onAppGuardAppStateChanged(state: string): void {
  appGuardAppState = state
  if (__DEV__) console.info(`[AppGuard:Mobile] background transition requestInFlight=${appGuardRequestInFlight}`)
  if (state === 'background' && __DEV__) console.info('[AppGuard:Mobile] listener retained in background')
  if (state === 'active') void activeReconcile?.()
}

export function registerJustificationFlow(userId: string) {
  const processedRequestIds = new Set<string>()
  const requestStartedAt = new Map<string, number>()
  const handle = (event: BeeJustificationRequestEvent) => {
    if (processedRequestIds.has(event.requestId)) return
    // The native client normally owns this path. If it is unavailable, never
    // start a JS request which cannot settle while the BlockActivity backgrounds RN.
    if (appGuardAppState !== 'active') {
      if (__DEV__) console.info(`[AppGuard:Mobile] request deferred because appState=background requestId=${event.requestId}`)
      return
    }
    processedRequestIds.add(event.requestId)
    requestStartedAt.set(event.requestId, Date.now())
    if (__DEV__) console.info(`[AppGuard:Mobile] request received requestId=${event.requestId}`)
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('App Guard request timed out.')), 45_000)
    })
    const deliver = async (decision: 'allow' | 'deny' | 'error', reason: string | null, signedGrant: string | null) => {
      if (__DEV__) console.info(`[AppGuard:Mobile] delivering native result requestId=${event.requestId} decision=${decision}`)
      const delivered = await deliverAppGuardRequestResult(event.requestId, decision, reason, signedGrant, userId)
      if (!delivered) throw new Error('Native App Guard result delivery was rejected as stale or unavailable.')
      if (__DEV__) console.info(`[AppGuard:Mobile] native delivery completed requestId=${event.requestId}`)
    }
    void (async () => {
      appGuardRequestInFlight = true
      try {
        if (!isAppGuardResultDeliveryAvailable()) throw new Error('Native App Guard result delivery is unavailable.')
        const result = await Promise.race([api.requestAccess(event.packageName, event.justification, event.requestId), timeout])
        const decision = result.decision === 'allow' && typeof result.signedGrant === 'string' ? 'allow' : 'deny'
        await deliver(decision, result.reason ?? null, decision === 'allow' ? result.signedGrant ?? null : null)
      } catch {
        if (__DEV__) console.info(`[AppGuard:Mobile] native delivery failed requestId=${event.requestId}`)
        try {
          await deliver('error', "We couldn't review your request right now. This app remains restricted.", null)
        } catch {
          if (__DEV__) console.info(`[AppGuard:Mobile] fail-closed native delivery failed requestId=${event.requestId}`)
        }
      } finally {
        appGuardRequestInFlight = false
        requestStartedAt.delete(event.requestId)
        if (timeoutId) clearTimeout(timeoutId)
      }
    })()
  }
  const subscription = subscribeToEvents('onBeeJustificationRequested', handle)
  if (__DEV__) console.info('[AppGuard:Mobile] listener registered')
  // SharedFlow events are fire-and-forget. Drain the in-memory native request
  // after subscribing so a BlockScreen request raised before JS was ready is
  // processed exactly once by the same correlation handler.
  const reconcile = async () => {
    const request = await getPendingAppGuardRequest().catch(() => null)
    if (!request) return
    if (__DEV__) console.info(`[AppGuard:Mobile] reconciliation started requestId=${request.requestId}`)
    // A completion that was suspended in the background may never have run its
    // JS continuation. The API replays this same native requestId idempotently.
    const startedAt = requestStartedAt.get(request.requestId)
    // An event plus the immediate initial drain is a duplicate. Only replay a
    // request that has been stuck long enough to indicate background suspension.
    if (processedRequestIds.has(request.requestId) && (!startedAt || Date.now() - startedAt < 2_000)) return
    processedRequestIds.delete(request.requestId)
    handle(request)
    if (__DEV__) console.info(`[AppGuard:Mobile] reconciliation completed requestId=${request.requestId}`)
  }
  activeReconcile = reconcile
  void reconcile()
  return { remove: () => { if (activeReconcile === reconcile) activeReconcile = null; subscription.remove() } }
}
