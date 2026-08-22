import { buildApprovedAppPayload } from './ManagedAppsCard'

describe('supervised Android approved-app sync', () => {
  const apps = [
    { packageName: 'com.instagram.android', appName: 'Instagram', icon: 'data:image/png;base64,instagram', system: false },
    { packageName: 'com.zhiliaoapp.musically', appName: 'TikTok', icon: 'data:image/png;base64,tiktok', system: false },
    { packageName: 'com.example.unselected', appName: 'Private App', icon: null, system: false },
  ]
  it('uploads only the explicitly selected safe fields', () => expect(buildApprovedAppPayload(apps, ['com.instagram.android','com.zhiliaoapp.musically'])).toEqual([
    { platformAppIdentifier: 'com.instagram.android', displayName: 'Instagram', iconReference: 'data:image/png;base64,instagram' },
    { platformAppIdentifier: 'com.zhiliaoapp.musically', displayName: 'TikTok', iconReference: 'data:image/png;base64,tiktok' },
  ]))
  it('never uploads the unrestricted eligible inventory', () => expect(buildApprovedAppPayload(apps, ['com.instagram.android'])).not.toEqual(expect.arrayContaining([expect.objectContaining({ platformAppIdentifier: 'com.example.unselected' })])))
})
