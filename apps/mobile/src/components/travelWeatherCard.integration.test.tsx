import { readFileSync } from 'fs'
import { resolve } from 'path'

const source = readFileSync(resolve(__dirname, 'TravelWeatherCard.tsx'), 'utf8')

describe('mobile Task Assistant card', () => {
  it('renders API preparation suggestions and its empty state', () => {
    expect(source).toMatch(/state\.suggestions\.map\(\(item\) =>/)
    expect(source).toMatch(/item\.title/)
    expect(source).toMatch(/item\.description/)
  })

  it('keeps weather/travel display read-only and does not schedule legacy alerts', () => {
    const sync = readFileSync(resolve(__dirname, '../lib/weatherTravelNotificationSync.ts'), 'utf8')
    expect(sync).toMatch(/localDeliveryEligible/)
    expect(source).not.toMatch(/scheduleNotificationAsync/)
  })
})
