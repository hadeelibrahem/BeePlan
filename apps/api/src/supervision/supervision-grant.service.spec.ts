import { createVerify, generateKeyPairSync } from 'node:crypto'
import { SupervisionGrantService } from './supervision-grant.service'

describe('SupervisionGrantService', () => {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const service = new SupervisionGrantService({ get: () => Buffer.from(keys.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string).toString('base64') } as never)
  it('signs every authorization field in the compact payload', () => {
    const grant = service.issue({ requestId: 'request', supervisedUserId: 'user', relationshipId: 'relationship', packageName: 'com.example.app', expiresAt: Date.now() + 60_000, decisionSource: 'ai' })
    const [body, signature] = grant.token.split('.'); const verifier = createVerify('RSA-SHA256'); verifier.update(body); verifier.end()
    expect(verifier.verify(keys.publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
    expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toMatchObject({ version: 1, packageName: 'com.example.app', supervisedUserId: 'user' })
  })
  it('detects a modified expiry or package', () => {
    const grant = service.issue({ requestId: 'request', supervisedUserId: 'user', relationshipId: 'relationship', packageName: 'com.example.app', expiresAt: Date.now() + 60_000, decisionSource: 'ai' }); const [body, signature] = grant.token.split('.'); const payload = JSON.parse(Buffer.from(body, 'base64url').toString()); payload.expiresAt += 60_000; const changed = Buffer.from(JSON.stringify(payload)).toString('base64url'); const verifier = createVerify('RSA-SHA256'); verifier.update(changed); verifier.end(); expect(verifier.verify(keys.publicKey, Buffer.from(signature, 'base64url'))).toBe(false)
  })
  it('issues a self-owned v2 grant without relationship authority', () => {
    const grant = service.issueAppGuard({ requestId: 'request', userId: 'user', packageName: 'com.example.app', expiresAt: Date.now() + 60_000, decisionSource: 'ai' })
    const [body, signature] = grant.token.split('.'); const verifier = createVerify('RSA-SHA256'); verifier.update(body); verifier.end()
    expect(verifier.verify(keys.publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
    expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toMatchObject({ version: 2, userId: 'user', packageName: 'com.example.app', decisionSource: 'ai' })
  })
})
