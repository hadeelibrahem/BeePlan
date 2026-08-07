import { MOBILE_AUTH_SESSION, parseMobileAuthMessage } from './mobileAuthBridge'

const user = { id: 'u1', fullName: 'Bee Plan', username: 'bee', email: 'bee@example.com', avatarUrl: null, timezone: 'UTC' }

test('accepts a validated mobile session message', () => {
  expect(parseMobileAuthMessage(JSON.stringify({ type: MOBILE_AUTH_SESSION, payload: { accessToken: 'jwt', user } }))).toMatchObject({ type: MOBILE_AUTH_SESSION, payload: { accessToken: 'jwt', user: { id: 'u1' } } })
})

test('rejects malformed bridge messages', () => {
  expect(parseMobileAuthMessage(JSON.stringify({ type: MOBILE_AUTH_SESSION, payload: { accessToken: 'jwt' } }))).toBeNull()
  expect(parseMobileAuthMessage('not-json')).toBeNull()
})
