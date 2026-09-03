import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { and, desc, eq, gte } from 'drizzle-orm'
import { DatabaseService } from '../db/database.service'
import { describeDatabaseError } from '../db/database-error'
import { appGuardAccessDecisions, appGuardRestrictedApps, appGuardSettings } from '../db/schema'
import { SupervisionAccessEvaluator } from './supervision-access-evaluator.service'
import { SupervisionGrantService } from './supervision-grant.service'

const durations = new Set([5, 10, 15])
const APP_GUARD_RATE_LIMIT_MAX_ATTEMPTS = 6
const APP_GUARD_RATE_LIMIT_WINDOW_MS = 60 * 60_000
const RATE_LIMIT_MESSAGE = 'Too many requests. Try again shortly.'
@Injectable()
export class AppGuardService {
  private readonly logger = new Logger(AppGuardService.name)
  constructor(private readonly database: DatabaseService, private readonly evaluator: SupervisionAccessEvaluator, private readonly grants: SupervisionGrantService) {}
  private get db() { return this.database.db }
  async settings(userId: string) { const [row] = await this.db.select().from(appGuardSettings).where(eq(appGuardSettings.userId, userId)); const apps = await this.db.select().from(appGuardRestrictedApps).where(eq(appGuardRestrictedApps.userId, userId)); return { ...(row ?? { enabled: false, maxTemporaryMinutes: 10, strictness: 'balanced' }), restrictedApps: apps } }
  async updateSettings(userId: string, body: Record<string, unknown>) { const max = Number(body.maxTemporaryMinutes ?? 10); if (!durations.has(max)) throw new BadRequestException('Maximum temporary access must be 5, 10, or 15 minutes.'); const strictness = String(body.strictness ?? 'balanced'); if (!['flexible', 'balanced', 'strict'].includes(strictness)) throw new BadRequestException('Invalid App Guard strictness.'); const [existing] = await this.db.select().from(appGuardSettings).where(eq(appGuardSettings.userId, userId)); if (existing) await this.db.update(appGuardSettings).set({ enabled: body.enabled === undefined ? existing.enabled : body.enabled === true, maxTemporaryMinutes: max, strictness, updatedAt: new Date() }).where(eq(appGuardSettings.id, existing.id)); else await this.db.insert(appGuardSettings).values({ userId, enabled: body.enabled === true, maxTemporaryMinutes: max, strictness }); return this.settings(userId) }
  async replaceApps(userId: string, body: Record<string, unknown>) { if (!Array.isArray(body.apps)) throw new BadRequestException('Apps are required.'); const apps = [...new Map((body.apps as Array<Record<string, unknown>>).map(app => [String(app.packageName ?? '').trim(), app])).values()]; if (apps.some(app => !String(app.packageName ?? '').trim())) throw new BadRequestException('Every app needs a package name.'); await this.db.transaction(async tx => { await tx.delete(appGuardRestrictedApps).where(eq(appGuardRestrictedApps.userId, userId)); if (apps.length) await tx.insert(appGuardRestrictedApps).values(apps.map(app => ({ userId, packageName: String(app.packageName).trim(), displayName: app.displayName ? String(app.displayName).slice(0, 255) : null }))) }); return this.settings(userId) }
  async restrictions(userId: string) { const settings = await this.settings(userId); return settings.enabled ? { enabled: true, packages: settings.restrictedApps.map(app => app.packageName) } : { enabled: false, packages: [] } }
  private accessResponse(row: typeof appGuardAccessDecisions.$inferSelect) {
    const signedGrant = row.decision === 'allow' && row.expiresAt
      ? this.grants.issueAppGuard({ requestId: row.id, userId: row.userId, packageName: row.packageName, expiresAt: row.expiresAt.getTime(), decisionSource: 'ai' }).token
      : null
    return { ...row, signedGrant }
  }

  async requestAccess(userId: string, body: Record<string, unknown>) {
    const requestStartedAt = Date.now()
    let stage = 'validation'
    const packageName = String(body.packageName ?? '').trim()
    const justification = String(body.justification ?? '').trim()
    const traceId = String(body.requestId ?? '')
    try {
      if (!/^[0-9a-f-]{36}$/i.test(traceId)) throw new BadRequestException('A valid App Guard request ID is required.')
      if (!packageName || justification.length < 8 || justification.length > 2000) throw new BadRequestException('Please provide a short explanation.')
      this.logger.debug(`[AppGuard:API] request received requestId=${traceId}`)

      stage = 'idempotency_lookup'
      const idempotencyStartedAt = Date.now()
      this.logger.debug(`[AppGuard:API] idempotency lookup started requestId=${traceId}`)
      const [existing] = await this.db.select().from(appGuardAccessDecisions).where(and(eq(appGuardAccessDecisions.userId, userId), eq(appGuardAccessDecisions.clientRequestId, traceId))).limit(1)
      this.logger.debug(`[AppGuard:API] idempotency lookup completed requestId=${traceId} found=${Boolean(existing)} durationMs=${Date.now() - idempotencyStartedAt}`)
      if (existing) {
        stage = 'existing_decision_reconstruction'
        const response = this.accessResponse(existing)
        this.logger.debug(`[AppGuard:API] response ready requestId=${traceId}`)
        return response
      }

      stage = 'settings_lookup'
      const settingsStartedAt = Date.now()
      this.logger.debug(`[AppGuard:API] settings lookup started requestId=${traceId}`)
      const settings = await this.settings(userId)
      this.logger.debug(`[AppGuard:API] settings lookup completed requestId=${traceId} durationMs=${Date.now() - settingsStartedAt}`)
      if (!settings.enabled) throw new ForbiddenException('AI App Guard is disabled.')
      if (!settings.restrictedApps.some(app => app.packageName === packageName)) throw new ForbiddenException('This app is not restricted by your AI App Guard.')

      stage = 'rate_limit_lookup'
      const rateLimitStartedAt = Date.now()
      this.logger.debug(`[AppGuard:API] rate limit lookup started requestId=${traceId}`)
      const rateLimitNow = Date.now()
      const recent = await this.db.select({ clientRequestId: appGuardAccessDecisions.clientRequestId, createdAt: appGuardAccessDecisions.createdAt }).from(appGuardAccessDecisions).where(and(eq(appGuardAccessDecisions.userId, userId), gte(appGuardAccessDecisions.createdAt, new Date(rateLimitNow - APP_GUARD_RATE_LIMIT_WINDOW_MS))))
      this.logger.debug(`[AppGuard:API] rate limit lookup completed requestId=${traceId} durationMs=${Date.now() - rateLimitStartedAt}`)
      // The unique (user_id, client_request_id) index makes each persisted row
      // one logical attempt. Replays returned above never reach this count.
      const logicalAttempts = new Map(recent.filter(item => item.clientRequestId).map(item => [item.clientRequestId!, item])).size
      if (logicalAttempts >= APP_GUARD_RATE_LIMIT_MAX_ATTEMPTS) {
        const oldest = recent.reduce<Date | null>((value, item) => !value || item.createdAt < value ? item.createdAt : value, null)
        const retryAfterSeconds = Math.max(1, Math.ceil(((oldest?.getTime() ?? rateLimitNow) + APP_GUARD_RATE_LIMIT_WINDOW_MS - rateLimitNow) / 1000))
        throw new HttpException({ statusCode: HttpStatus.TOO_MANY_REQUESTS, code: 'APP_GUARD_RATE_LIMITED', message: RATE_LIMIT_MESSAGE, retryAfterSeconds }, HttpStatus.TOO_MANY_REQUESTS)
      }

      stage = 'evaluator_dispatch'
      this.logger.debug(`[AppGuard:API] evaluator dispatch requestId=${traceId}`)
      const ai = await this.evaluator.evaluate({ justification, packageName, appName: settings.restrictedApps.find(app => app.packageName === packageName)?.displayName ?? undefined, recentRequestCount: recent.length, traceId })
      const minimumConfidence = settings.strictness === 'strict' ? .8 : settings.strictness === 'flexible' ? .6 : .7
      const allowed = ai.decision === 'allow' && ai.confidence >= minimumConfidence && !['entertainment', 'social'].includes(ai.category)
      const minutes = allowed ? Math.min(settings.maxTemporaryMinutes, durations.has(ai.suggestedDurationMinutes ?? 0) ? ai.suggestedDurationMinutes! : 10) : null
      const expiresAt = minutes ? new Date(Date.now() + minutes * 60_000) : null

      stage = 'decision_insert'
      const insertStartedAt = Date.now()
      this.logger.debug(`[AppGuard:API] decision insert started requestId=${traceId}`)
      const [row] = await this.db.insert(appGuardAccessDecisions).values({ userId, clientRequestId: traceId, packageName, decision: allowed ? 'allow' : 'deny', category: ai.category, confidence: ai.confidence, reason: ai.reason, durationMinutes: minutes, expiresAt }).returning()
      this.logger.debug(`[AppGuard:API] decision insert completed requestId=${traceId} durationMs=${Date.now() - insertStartedAt}`)
      this.logger.debug(`[AppGuard:API] decision completed requestId=${traceId} decision=${allowed ? 'allow' : 'deny'}`)
      const response = this.accessResponse(row)
      this.logger.debug(`[AppGuard:API] response ready requestId=${traceId}`)
      return response
    } catch (error) {
      if (error instanceof HttpException) {
        if (error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) this.logger.debug(`[AppGuard:API] rate limited requestId=${traceId} status=429`)
        throw error
      }
      const databaseError = describeDatabaseError(error, 'query')
      this.logger.warn(JSON.stringify({ event: 'app_guard_request_failed', requestId: traceId || 'invalid', stage, durationMs: Date.now() - requestStartedAt, database: databaseError, pool: this.database.poolStats() }))
      throw new ServiceUnavailableException("We couldn't review your request right now. This app remains restricted.")
    }
  }
  async decisions(userId: string) { return this.db.select().from(appGuardAccessDecisions).where(eq(appGuardAccessDecisions.userId, userId)).orderBy(desc(appGuardAccessDecisions.createdAt)).limit(50) }
}
