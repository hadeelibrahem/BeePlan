import { useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import type {
  GeneralLocationCategory,
  LocationTriggerType,
  ReminderLocationTrigger,
  TriggerType,
} from '../types/reminders.types'
import { reverseGeocode, type GeoapifyPlaceSuggestion } from '../services/geoapifyPlacesService'
import { LocationMapPicker } from './LocationMapPicker'
import { PlaceAutocomplete } from './PlaceAutocomplete'
import { PlaceTypeAutocomplete } from './PlaceTypeAutocomplete'

const LOCATION_TRIGGER_TYPES: LocationTriggerType[] = ['none', 'general_location', 'specific_location']
const RADIUS_OPTIONS = [100, 250, 500]

const LOCATION_TRIGGER_LABEL_KEYS: Record<LocationTriggerType, string> = {
  none: 'reminders.noLocationReminder',
  general_location: 'reminders.generalLocationReminder',
  specific_location: 'reminders.specificLocationReminder',
}

function Chip({
  label,
  selected,
  onClick,
  fullWidth,
}: {
  label: string
  selected: boolean
  onClick: () => void
  fullWidth?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-4 py-2.5 text-xs font-black transition ${fullWidth ? 'w-full text-center' : ''} ${
        selected
          ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
          : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
      }`}
    >
      {label}
    </button>
  )
}

type Props = {
  value: ReminderLocationTrigger
  onChange: (value: ReminderLocationTrigger) => void
}

export function LocationTriggerSection({ value, onChange }: Props) {
  const { t } = useLanguage()
  const [searchText, setSearchText] = useState(value.specificLocation?.placeName ?? value.pendingPlaceName ?? '')
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  const setType = (type: LocationTriggerType) => onChange({ ...value, type })

  const setGeneralCategory = (category: GeneralLocationCategory) =>
    onChange({ ...value, generalLocation: { category, customLabel: value.generalLocation?.customLabel } })

  const setGeneralCustomLabel = (customLabel: string) =>
    onChange({ ...value, generalLocation: { category: value.generalLocation?.category ?? 'custom', customLabel } })

  const handlePlaceSelected = (place: GeoapifyPlaceSuggestion) => {
    setLocationError('')
    setSearchText(place.placeName)
    onChange({
      ...value,
      specificLocation: {
        ...place,
        selectedBy: 'search',
        trigger: value.specificLocation?.trigger ?? 'arrive',
        radius: value.specificLocation?.radius ?? 100,
      },
    })
  }

  const applyResolvedPoint = (place: GeoapifyPlaceSuggestion, selectedBy: 'map' | 'current_location') => {
    setSearchText(place.placeName)
    onChange({
      ...value,
      specificLocation: {
        ...place,
        selectedBy,
        trigger: value.specificLocation?.trigger ?? 'arrive',
        radius: value.specificLocation?.radius ?? 100,
      },
    })
  }

  const handleMapPick = (coords: { latitude: number; longitude: number }) => {
    setLocationError('')
    reverseGeocode(coords.latitude, coords.longitude)
      .then((place) => applyResolvedPoint(place, 'map'))
      .catch((error: unknown) => {
        console.error(error)
        setLocationError(error instanceof Error ? error.message : 'Failed to resolve the selected point.')
      })
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.')
      return
    }

    setLocationError('')
    setIsLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        reverseGeocode(position.coords.latitude, position.coords.longitude)
          .then((place) => applyResolvedPoint(place, 'current_location'))
          .catch((error: unknown) => {
            console.error(error)
            setLocationError(error instanceof Error ? error.message : 'Failed to resolve your location.')
          })
          .finally(() => setIsLocating(false))
      },
      (error) => {
        console.error(error)
        setLocationError('Could not access your location. Please check permissions.')
        setIsLocating(false)
      },
    )
  }

  const setSpecificTrigger = (trigger: TriggerType) =>
    value.specificLocation && onChange({ ...value, specificLocation: { ...value.specificLocation, trigger } })

  const setSpecificRadius = (radius: number) =>
    value.specificLocation && onChange({ ...value, specificLocation: { ...value.specificLocation, radius } })

  return (
    <section className="grid gap-4">
      <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.locationTrigger')}</p>
      <div className="flex flex-wrap gap-2">
        {LOCATION_TRIGGER_TYPES.map((type) => (
          <Chip key={type} label={t(LOCATION_TRIGGER_LABEL_KEYS[type])} selected={value.type === type} onClick={() => setType(type)} />
        ))}
      </div>

      {value.type === 'general_location' && (
        <PlaceTypeAutocomplete
          value={value.generalLocation?.category}
          customLabel={value.generalLocation?.customLabel}
          onChange={setGeneralCategory}
          onCustomLabelChange={setGeneralCustomLabel}
        />
      )}

      {value.type === 'specific_location' && (
        <div className="grid gap-4">
          <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3">
            <p className="mb-1 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.searchPlace')}</p>
            <PlaceAutocomplete
              value={searchText}
              placeholder={t('reminders.searchPlacePlaceholder')}
              onTextChange={(text) => {
                setSearchText(text)
                // Typing without picking a suggestion must not leave a stale
                // valid selection in place - manual text entry is not allowed.
                if (value.specificLocation && text !== value.specificLocation.placeName) {
                  onChange({ ...value, specificLocation: undefined })
                }
              }}
              onPlaceSelected={handlePlaceSelected}
            />
            <p className="mt-1 text-xs text-[var(--bp-subtle)]">{t('reminders.searchPlaceManualHint')}</p>
            {!value.specificLocation && !!value.pendingPlaceName && (
              <p className="mt-1 text-xs font-semibold text-[var(--bp-accent)]">{t('reminders.pendingPlaceHelp')}</p>
            )}
          </div>

          <LocationMapPicker
            latitude={value.specificLocation?.latitude}
            longitude={value.specificLocation?.longitude}
            isLocating={isLocating}
            onMapPick={handleMapPick}
            onUseCurrentLocation={handleUseCurrentLocation}
          />

          {!!locationError && <p className="text-xs font-semibold text-red-400">{locationError}</p>}

          {value.specificLocation && (
            <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3">
              <p className="mb-1 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.placeAddress')}</p>
              <p className="py-1 text-base font-semibold text-[var(--bp-text)]">{value.specificLocation.address}</p>
              {value.specificLocation.city && <p className="text-xs text-[var(--bp-subtle)]">{value.specificLocation.city}</p>}
            </div>
          )}

          <div className="flex gap-2">
            {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => (
              <div key={triggerType} className="flex-1">
                <Chip
                  label={t(`reminders.${triggerType}`)}
                  selected={(value.specificLocation?.trigger ?? 'arrive') === triggerType}
                  onClick={() => setSpecificTrigger(triggerType)}
                  fullWidth
                />
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.radiusMeters')}</p>
            <div className="flex gap-2">
              {RADIUS_OPTIONS.map((radius) => (
                <div key={radius} className="flex-1">
                  <Chip
                    label={`${radius}m`}
                    selected={(value.specificLocation?.radius ?? 100) === radius}
                    onClick={() => setSpecificRadius(radius)}
                    fullWidth
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
