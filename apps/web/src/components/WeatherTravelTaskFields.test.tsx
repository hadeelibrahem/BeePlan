import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(import.meta.dirname, 'WeatherTravelTaskFields.tsx'), 'utf8')

describe('web task location picker', () => {
  it('wires search, saved places, browser location, reverse geocoding, and removal', () => {
    expect(source).toMatch(/Search for a place\.\.\./)
    expect(source).toMatch(/getSavedPlaces/)
    expect(source).toMatch(/navigator\.geolocation/)
    expect(source).toMatch(/reverseGeocode/)
    expect(source).toMatch(/Remove location/)
  })

  it('does not expose manual coordinates in the task form', () => {
    expect(source).not.toMatch(/Latitude/)
    expect(source).not.toMatch(/Longitude/)
    expect(source).toMatch(/latitude: place\.latitude/)
    expect(source).toMatch(/longitude: place\.longitude/)
  })
})
