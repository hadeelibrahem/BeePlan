import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createSign, randomUUID } from 'node:crypto'

export type SignedTemporaryGrantPayload = { version: 1; grantId: string; requestId: string; supervisedUserId: string; relationshipId: string; packageName: string; issuedAt: number; expiresAt: number; decisionSource: string; nonce: string }
export type AppGuardGrantPayload = { version: 2; grantId: string; requestId: string; userId: string; packageName: string; issuedAt: number; expiresAt: number; decisionSource: 'ai'; nonce: string }

const b64url = (value: Buffer | string) => Buffer.from(value).toString('base64url')
/** Compact detached-authority token. All authorization fields live inside the signed payload. */
@Injectable()
export class SupervisionGrantService {
  private readonly privateKey: string | null
  constructor(config: ConfigService) { const encoded = config.get<string>('SUPERVISION_GRANT_PRIVATE_KEY'); this.privateKey = encoded ? Buffer.from(encoded, 'base64').toString('utf8') : null }
  issue(input: Omit<SignedTemporaryGrantPayload, 'version' | 'grantId' | 'issuedAt' | 'nonce'>) {
    if (!this.privateKey) throw new ServiceUnavailableException('Temporary access signing is unavailable.')
    const payload: SignedTemporaryGrantPayload = { version: 1, grantId: randomUUID(), issuedAt: Date.now(), nonce: randomUUID(), ...input }
    const body = b64url(JSON.stringify(payload)); const signer = createSign('RSA-SHA256'); signer.update(body); signer.end()
    return { payload, token: `${body}.${signer.sign(this.privateKey).toString('base64url')}` }
  }
  issueAppGuard(input: Omit<AppGuardGrantPayload, 'version' | 'grantId' | 'issuedAt' | 'nonce'>) {
    if (!this.privateKey) throw new ServiceUnavailableException('Temporary access signing is unavailable.')
    const payload: AppGuardGrantPayload = { version: 2, grantId: randomUUID(), issuedAt: Date.now(), nonce: randomUUID(), ...input }
    const body = b64url(JSON.stringify(payload)); const signer = createSign('RSA-SHA256'); signer.update(body); signer.end()
    return { payload, token: `${body}.${signer.sign(this.privateKey).toString('base64url')}` }
  }
}
