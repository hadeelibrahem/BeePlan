import { HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common'
import { AppGuardService } from './app-guard.service'

const userId = '11111111-1111-4111-8111-111111111111'
const requestId = '500e509f-ba0e-4920-aeaf-7b4d1bfd2af9'
const body = { packageName: 'com.example.blocked', justification: 'Needed for an urgent work task.', requestId }

function query(rows: unknown[]) {
  return Object.assign(Promise.resolve(rows), { limit: jest.fn().mockResolvedValue(rows) })
}

describe('AppGuardService requestAccess database boundaries', () => {
  it('fails closed when the idempotency lookup times out and never dispatches AI', async () => {
    const timeout = Object.assign(new Error('Query read timeout'), { code: 'ETIMEDOUT' })
    const database = {
      db: { select: jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => ({ limit: jest.fn().mockRejectedValue(timeout) })) })) })) },
      poolStats: () => ({ totalCount: 10, idleCount: 0, waitingCount: 1 }),
    }
    const evaluator = { evaluate: jest.fn() }
    const service = new AppGuardService(database as never, evaluator as never, { issueAppGuard: jest.fn() } as never)

    await expect(service.requestAccess(userId, body)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(evaluator.evaluate).not.toHaveBeenCalled()
  })

  it('dispatches AI only after idempotency, settings, and rate-limit queries complete', async () => {
    const responses = [
      [],
      [{ id: 'settings-1', userId, enabled: true, maxTemporaryMinutes: 10, strictness: 'balanced' }],
      [{ id: 'app-1', userId, packageName: body.packageName, displayName: 'Blocked app' }],
      [],
    ]
    const select = jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => query(responses.shift() ?? [])) })) }))
    const returning = jest.fn().mockResolvedValue([{ id: 'decision-1', userId, clientRequestId: requestId, packageName: body.packageName, decision: 'deny', category: 'work', confidence: .9, reason: 'Stay focused.', durationMinutes: null, expiresAt: null, createdAt: new Date() }])
    const database = { db: { select, insert: jest.fn(() => ({ values: jest.fn(() => ({ returning })) })) }, poolStats: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }) }
    const evaluator = { evaluate: jest.fn().mockResolvedValue({ decision: 'deny', confidence: .9, category: 'work', reason: 'Stay focused.', suggestedDurationMinutes: null }) }
    const service = new AppGuardService(database as never, evaluator as never, { issueAppGuard: jest.fn() } as never)

    await expect(service.requestAccess(userId, body)).resolves.toMatchObject({ decision: 'deny', clientRequestId: requestId })
    expect(evaluator.evaluate).toHaveBeenCalledTimes(1)
  })

  it('returns an idempotent decision before rate limiting and does not dispatch AI again', async () => {
    const existing = { id: 'decision-1', userId, clientRequestId: requestId, packageName: body.packageName, decision: 'deny', category: 'work', confidence: .9, reason: 'Stay focused.', durationMinutes: null, expiresAt: null, createdAt: new Date() }
    const select = jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => query([existing])) })) }))
    const evaluator = { evaluate: jest.fn() }
    const service = new AppGuardService({ db: { select }, poolStats: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }) } as never, evaluator as never, { issueAppGuard: jest.fn() } as never)

    await expect(service.requestAccess(userId, body)).resolves.toMatchObject({ id: existing.id, clientRequestId: requestId, decision: 'deny' })
    expect(select).toHaveBeenCalledTimes(1)
    expect(evaluator.evaluate).not.toHaveBeenCalled()
  })

  it('returns a structured 429 after six distinct logical attempts in one hour', async () => {
    const recent = Array.from({ length: 6 }, (_, index) => ({ clientRequestId: `00000000-0000-4000-8000-00000000000${index}`, createdAt: new Date() }))
    const responses = [
      [],
      [{ id: 'settings-1', userId, enabled: true, maxTemporaryMinutes: 10, strictness: 'balanced' }],
      [{ id: 'app-1', userId, packageName: body.packageName, displayName: 'Blocked app' }],
      recent,
    ]
    const select = jest.fn(() => ({ from: jest.fn(() => ({ where: jest.fn(() => query(responses.shift() ?? [])) })) }))
    const evaluator = { evaluate: jest.fn() }
    const service = new AppGuardService({ db: { select }, poolStats: () => ({ totalCount: 1, idleCount: 1, waitingCount: 0 }) } as never, evaluator as never, { issueAppGuard: jest.fn() } as never)

    let captured: HttpException | null = null
    try { await service.requestAccess(userId, body) } catch (error) { captured = error as HttpException }
    expect(captured).toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS })
    const response = captured!.getResponse() as { code: string; message: string; retryAfterSeconds: number }
    expect(response).toMatchObject({ code: 'APP_GUARD_RATE_LIMITED', message: 'Too many requests. Try again shortly.' })
    expect(response.retryAfterSeconds).toBeGreaterThan(0)
    expect(evaluator.evaluate).not.toHaveBeenCalled()
  })
})
