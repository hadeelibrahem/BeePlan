import { getDeviceCapability } from './deviceCapability'

describe('supervision device enforcement truthfulness', () => {
  it('never claims consumer Android hard blocking through Accessibility', async () => {
    const capability = await getDeviceCapability()
    expect(capability.message).not.toMatch(/AccessibilityService/i)
    if (capability.platform === 'android') expect(capability.enforceable).toBe(false)
  })
})
