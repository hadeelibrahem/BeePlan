import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { WeatherTravelSettings } from './WeatherTravelSettings'
const preferences = { enabled:false,defaultTravelMode:'driving',homeRadiusMeters:100,preparationBufferMinutes:10,parkingWalkingBufferMinutes:0,uncertaintyBufferMinutes:5,weatherLeadMinutes:15,currentLocationFreshnessMinutes:30,coldThresholdC:12,veryColdThresholdC:5,hotThresholdC:28,extremeHeatThresholdC:35,rainThresholdPercent:50,rainAmountThresholdMm:.5,windThresholdKph:35,uvThreshold:6,visibilityThresholdMeters:1000,currentLocationFallbackEnabled:false,approximateTravelFallbackEnabled:true,aiPolishingEnabled:false,language:'en',timezone:'Asia/Hebron',advice:{} }
beforeEach(() => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok:true, json:async()=>preferences })))
test('exposes opt-in, thresholds, advice toggles, and saves through the API', async () => {
  render(<WeatherTravelSettings token="token" />)
  const toggle = await screen.findByLabelText('Enable weather and travel advice')
  fireEvent.click(toggle); fireEvent.click(screen.getByRole('button',{name:'Save Weather & Travel'}))
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  expect(screen.getByText('Umbrella advice')).toBeInTheDocument()
  expect(screen.getByLabelText('Home radius (m)')).toHaveValue(100)
})
