import { useState } from 'react'
import { PrimaryButton, SecondaryButton } from '../../../components/layout'
import { Modal } from '../../../components/layout/Modal'
import { LocationMapPicker } from '../../reminders/components/LocationMapPicker'
import { PlaceAutocomplete } from '../../reminders/components/PlaceAutocomplete'
import type { SavedPlace, SavedPlaceInput } from '../types'

type Props = {
  open: boolean
  initial?: SavedPlace | null
  saving?: boolean
  onClose: () => void
  onSubmit: (input: SavedPlaceInput) => void
}

const FIELD =
  'w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]'
const LABEL = 'mb-1 block text-xs font-bold text-[var(--bp-muted)]'

/**
 * Create/edit a saved place. Reuses the reminder module's Geoapify autocomplete
 * and Leaflet map picker so the "where" experience is identical to reminders.
 */
export function SavedPlaceEditorModal({ open, initial, saving, onClose, onSubmit }: Props) {
  const [name, setName] = useState(initial?.name ?? '')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [category, setCategory] = useState(initial?.category ?? '')
  const [address, setAddress] = useState(initial?.address ?? '')
  const [latitude, setLatitude] = useState<number | undefined>(initial?.latitude)
  const [longitude, setLongitude] = useState<number | undefined>(initial?.longitude)
  const [radiusMeters, setRadiusMeters] = useState(initial?.radiusMeters ?? 150)
  const [aliasText, setAliasText] = useState((initial?.aliases ?? []).join(', '))
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState('')

  const hasCoords = latitude !== undefined && longitude !== undefined

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude)
        setLongitude(position.coords.longitude)
        setIsLocating(false)
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  const handleSubmit = () => {
    if (!name.trim()) return setError('Please give this place a name.')
    if (!hasCoords) return setError('Pick a location on the map or search for an address.')
    setError('')
    onSubmit({
      name: name.trim(),
      icon: icon.trim() || null,
      category: category.trim() || null,
      address: address.trim() || null,
      latitude: latitude as number,
      longitude: longitude as number,
      radiusMeters,
      aliases: aliasText
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={initial ? 'Edit saved place' : 'Add saved place'}
      description="Teach BeePlan a permanent place. The AI resolves any of its aliases to this exact location."
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving…' : initial ? 'Save changes' : 'Add place'}
          </PrimaryButton>
        </>
      }
    >
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-[70px_1fr] gap-3">
          <div>
            <label className={LABEL}>Icon</label>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏠" maxLength={4} className={`${FIELD} text-center`} />
          </div>
          <div>
            <label className={LABEL}>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Home" className={FIELD} />
          </div>
        </div>

        <div>
          <label className={LABEL}>Category (optional)</label>
          <input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="home, work, university, gym…"
            className={FIELD}
          />
        </div>

        <div>
          <label className={LABEL}>Search address</label>
          <div className="rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3">
            <PlaceAutocomplete
              value={address}
              placeholder="Search for a place or address"
              onTextChange={setAddress}
              onPlaceSelected={(place) => {
                setAddress(place.address || place.label)
                setLatitude(place.latitude)
                setLongitude(place.longitude)
              }}
            />
          </div>
        </div>

        <LocationMapPicker
          latitude={latitude}
          longitude={longitude}
          isLocating={isLocating}
          onMapPick={({ latitude: lat, longitude: lon }) => {
            setLatitude(lat)
            setLongitude(lon)
          }}
          onUseCurrentLocation={handleUseCurrentLocation}
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Latitude</label>
            <input value={latitude ?? ''} readOnly className={`${FIELD} opacity-70`} />
          </div>
          <div>
            <label className={LABEL}>Longitude</label>
            <input value={longitude ?? ''} readOnly className={`${FIELD} opacity-70`} />
          </div>
        </div>

        <div>
          <label className={LABEL}>Radius (meters): {radiusMeters}m</label>
          <input
            type="range"
            min={50}
            max={2000}
            step={50}
            value={radiusMeters}
            onChange={(e) => setRadiusMeters(Number(e.target.value))}
            className="w-full accent-[var(--bp-accent)]"
          />
        </div>

        <div>
          <label className={LABEL}>Aliases (comma-separated)</label>
          <input
            value={aliasText}
            onChange={(e) => setAliasText(e.target.value)}
            placeholder="home, house, البيت, الدار"
            className={FIELD}
          />
          <p className="mt-1 text-[11px] text-[var(--bp-muted)]">
            Natural-language names the AI resolves to this place — English or Arabic.
          </p>
        </div>

        {error ? <p className="text-sm font-semibold text-red-500">{error}</p> : null}
      </div>
    </Modal>
  )
}
