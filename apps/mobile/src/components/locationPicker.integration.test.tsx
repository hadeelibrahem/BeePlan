import { readFileSync } from 'fs'
import { resolve } from 'path'

const picker = readFileSync(resolve(__dirname, 'WeatherTravelTaskFields.tsx'), 'utf8')
const create = readFileSync(resolve(__dirname, '../screens/CreateTaskScreen.tsx'), 'utf8')
const edit = readFileSync(resolve(__dirname, '../screens/EditTaskScreen.tsx'), 'utf8')

describe('task location picker wiring', () => {
  it('supports search, current location, saved places, removal, and internal coordinates', () => {
    expect(picker).toMatch(/Search for a place\.\.\./)
    expect(picker).toMatch(/requestForegroundPermissionsAsync/)
    expect(picker).toMatch(/reverseGeocodeAsync/)
    expect(picker).toMatch(/useSavedPlaces/)
    expect(picker).toMatch(/latitude: position\.coords\.latitude/)
    expect(picker).toMatch(/Remove location/)
  })

  it('keeps destination payload wiring in both create and edit flows without coordinate inputs', () => {
    expect(create).toMatch(/destination\.displayName && Number\.isFinite\(destination\.latitude\)/)
    expect(edit).toMatch(/destination\.displayName && Number\.isFinite\(destination\.latitude\)/)
    expect(create).not.toMatch(/placeholder="YYYY-MM-DD"/)
    expect(create).not.toMatch(/placeholder="HH:mm"/)
    expect(edit).not.toMatch(/placeholder="YYYY-MM-DD"/)
    expect(edit).not.toMatch(/placeholder="HH:mm"/)
  })
})
