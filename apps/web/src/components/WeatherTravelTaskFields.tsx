import { useEffect, useState } from 'react'
import { getSavedPlaces } from '../features/context/api/context.api'
import type { SavedPlace } from '../features/context/types'
import { PlaceAutocomplete } from '../features/reminders/components/PlaceAutocomplete'
import { LocationMapPicker } from '../features/reminders/components/LocationMapPicker'
import { reverseGeocode, type GeoapifyPlaceSuggestion } from '../features/reminders/services/geoapifyPlacesService'
import type { TaskDestination } from '../lib/tasksApi'

type Props = {
  accessToken?: string
  destination: Partial<TaskDestination>
  enabled: boolean
  travelMode: 'driving' | 'walking' | 'cycling'
  onDestination: (value: Partial<TaskDestination>) => void
  onEnabled: (value: boolean) => void
  onTravelMode: (value: 'driving' | 'walking' | 'cycling') => void
}

export function WeatherTravelTaskFields({ accessToken, destination, enabled, onDestination, onEnabled }: Props) {
  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  useEffect(() => {
    if (!accessToken) return
    let active = true
    void getSavedPlaces(accessToken).then((places) => { if (active) setSavedPlaces(places) }).catch(() => undefined)
    return () => { active = false }
  }, [accessToken])

  const select = (value: Partial<TaskDestination>) => {
    onDestination(value)
    setSearchText(value.displayName ?? '')
    setLocationError('')
    setPickerOpen(false)
  }

  const selectSearchResult = (place: GeoapifyPlaceSuggestion) => select({
    displayName: place.placeName || place.label,
    address: [place.address, place.city].filter(Boolean).join(', ') || place.label,
    latitude: place.latitude,
    longitude: place.longitude,
    savedPlaceId: null,
  })

  const selectSavedPlace = (place: SavedPlace) => select({
    displayName: place.name,
    address: place.address,
    latitude: place.latitude,
    longitude: place.longitude,
    savedPlaceId: place.id,
  })

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Current location is not supported by this browser. Search for a place instead.')
      return
    }
    setLocating(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const place = await reverseGeocode(coords.latitude, coords.longitude)
        selectSearchResult(place)
      } catch {
        select({ displayName: 'Current location', address: null, latitude: coords.latitude, longitude: coords.longitude, savedPlaceId: null })
      } finally {
        setLocating(false)
      }
    }, (error) => {
      setLocating(false)
      setLocationError(error.code === error.PERMISSION_DENIED ? 'Location access was denied. Search for a place instead.' : 'Current location is unavailable. Search for a place or try again.')
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 })
  }

  return <>
    <div className="mt-4 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-3">
      <div className="flex items-center justify-between gap-4">
        <div><p className="font-black text-[var(--bp-text)]">🐝 Task Assistant</p><p className="mt-1 text-xs text-[var(--bp-muted)]">Uses task context, weather and travel to help you prepare.</p></div>
        <button type="button" role="switch" aria-checked={enabled} aria-label="Enable Task Assistant" onClick={() => onEnabled(!enabled)} className={`relative h-6 w-11 shrink-0 rounded-full p-1 transition ${enabled ? 'bg-[var(--bp-accent)]' : 'bg-[var(--bp-border)]'}`}><span className={`block h-4 w-4 rounded-full bg-white transition ${enabled ? 'ms-auto' : ''}`} /></button>
      </div>
    </div>
    <button type="button" aria-label={destination.displayName ? 'Change location' : 'Add location'} onClick={() => setPickerOpen(true)} className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-input)] p-3 text-start hover:border-[var(--bp-accent)]">
      <span className="text-xl">📍</span><span className="min-w-0 flex-1"><span className="block text-xs font-black uppercase tracking-wide text-[var(--bp-subtle)]">Location</span><span className="mt-1 block truncate text-sm font-bold text-[var(--bp-text)]">{destination.displayName || 'Add location'}</span>{destination.address ? <span className="block truncate text-xs text-[var(--bp-muted)]">{destination.address}</span> : null}</span><span className="text-lg text-[var(--bp-muted)]">›</span>
    </button>

    {pickerOpen ? <div role="dialog" aria-modal="true" aria-labelledby="task-location-title" className="fixed inset-0 z-[100] overflow-y-auto bg-black/50 p-4"><div className="mx-auto max-w-2xl rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="task-location-title" className="text-xl font-black text-[var(--bp-text)]">Choose Location</h2><button type="button" aria-label="Close location picker" onClick={() => setPickerOpen(false)} className="text-2xl text-[var(--bp-muted)]">×</button></div><div className="mt-4 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-input)] px-3"><PlaceAutocomplete value={searchText} placeholder="Search for a place..." onTextChange={setSearchText} onPlaceSelected={selectSearchResult} /></div><button type="button" onClick={useCurrentLocation} disabled={locating} className="mt-3 rounded-xl border border-[var(--bp-border)] px-4 py-3 text-sm font-bold text-[var(--bp-text)] disabled:opacity-60">📍 {locating ? 'Finding current location...' : 'Use current location'}</button>{locationError ? <p role="alert" className="mt-2 text-sm text-red-400">{locationError}</p> : null}{savedPlaces.length ? <div className="mt-6"><p className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">Saved places</p><div className="divide-y divide-[var(--bp-border)]">{savedPlaces.map((place) => <button type="button" key={place.id} onClick={() => selectSavedPlace(place)} className="flex w-full items-center gap-3 py-3 text-start hover:bg-[var(--bp-accent-soft)]"><span className="text-xl">{place.icon || '📍'}</span><span><span className="block font-bold text-[var(--bp-text)]">{place.name}</span><span className="block text-xs text-[var(--bp-muted)]">{place.address || 'Saved place'}</span></span></button>)}</div></div> : null}<div className="mt-6"><LocationMapPicker latitude={Number.isFinite(destination.latitude) ? destination.latitude : undefined} longitude={Number.isFinite(destination.longitude) ? destination.longitude : undefined} isLocating={locating} onMapPick={async (coords) => { try { selectSearchResult(await reverseGeocode(coords.latitude, coords.longitude)) } catch { select({ displayName: 'Pinned location', address: null, ...coords, savedPlaceId: null }) } }} onUseCurrentLocation={useCurrentLocation} /></div>{destination.displayName ? <button type="button" onClick={() => select({ displayName: '', address: null, latitude: NaN, longitude: NaN, savedPlaceId: null })} className="mt-4 rounded-xl border border-red-500/40 px-4 py-2 text-sm font-bold text-red-400">Remove location</button> : null}</div></div> : null}
  </>
}
