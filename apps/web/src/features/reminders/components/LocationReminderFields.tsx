import { useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import { reverseGeocode, type GeoapifyPlaceSuggestion } from '../services/geoapifyPlacesService'
import type { GeneralLocationCategory, LocationReminderConfig, LocationReminderMode, TriggerType } from '../types/reminders.types'
import { LocationMapPicker } from './LocationMapPicker'
import { PlaceAutocomplete } from './PlaceAutocomplete'
import { PlaceTypeAutocomplete } from './PlaceTypeAutocomplete'

const MODES: LocationReminderMode[] = ['specific_place', 'general_category']
const RADIUS_OPTIONS = [100, 250, 500]

type Props = {
  value: LocationReminderConfig
  onChange: (value: LocationReminderConfig) => void
}

export function LocationReminderFields({ value, onChange }: Props) {
  const { t } = useLanguage()
  const [searchText, setSearchText] = useState(value.specificPlace?.placeName ?? value.pendingPlaceName ?? '')
  const [isLocating, setIsLocating] = useState(false)
  const [locationError, setLocationError] = useState('')

  const setMode = (mode: LocationReminderMode) => onChange({ ...value, mode })
  const setTrigger = (trigger: TriggerType) => onChange({ ...value, trigger })
  const setRadius = (radiusMeters: number) => onChange({ ...value, radiusMeters })

  const setGeneralCategory = (category: GeneralLocationCategory) =>
    onChange({ ...value, generalCategory: { category, customLabel: value.generalCategory?.customLabel } })

  const setGeneralCustomLabel = (customLabel: string) =>
    onChange({ ...value, generalCategory: { category: value.generalCategory?.category ?? 'custom', customLabel } })

  const handlePlaceSelected = (place: GeoapifyPlaceSuggestion) => {
    setLocationError('')
    setSearchText(place.placeName)
    onChange({ ...value, specificPlace: { ...place, selectedBy: 'search' } })
  }

  const applyResolvedPoint = (place: GeoapifyPlaceSuggestion, selectedBy: 'map' | 'current_location') => {
    setSearchText(place.placeName)
    onChange({ ...value, specificPlace: { ...place, selectedBy } })
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

  return (
    <section className="grid gap-4">
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.locationMode')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {MODES.map((mode) => {
            const selected = value.mode === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setMode(mode)}
                aria-pressed={selected}
                className={`rounded-xl border px-3 py-3 text-start transition ${
                  selected
                    ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-text)] shadow-[inset_0_0_0_1px_rgba(253,239,75,0.12),0_0_18px_rgba(253,239,75,0.08)]'
                    : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
                }`}
              >
                <span className="block text-sm font-black">
                  {t(mode === 'specific_place' ? 'reminders.modeSpecific' : 'reminders.modeCategory')}
                </span>
                <span className={`mt-1 block text-xs font-semibold ${selected ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-subtle)]'}`}>
                  {t(mode === 'specific_place' ? 'reminders.modeSpecificHint' : 'reminders.modeCategoryHint')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {value.mode === 'specific_place' && (
        <>
          <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3">
            <p className="mb-1 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
              {t('reminders.searchPlace')}
            </p>
            <PlaceAutocomplete
              value={searchText}
              placeholder={t('reminders.searchPlacePlaceholder')}
              onTextChange={(text) => {
                setSearchText(text)
                // Typing without picking a suggestion must not leave a stale
                // valid selection in place — manual text entry is not allowed.
                if (value.specificPlace && text !== value.specificPlace.placeName) {
                  onChange({ ...value, specificPlace: undefined })
                }
              }}
              onPlaceSelected={handlePlaceSelected}
            />
            <p className="mt-1 text-xs text-[var(--bp-subtle)]">{t('reminders.searchPlaceManualHint')}</p>
            {!value.specificPlace && !!value.pendingPlaceName && (
              <p className="mt-1 text-xs font-semibold text-[var(--bp-accent)]">{t('reminders.pendingPlaceHelp')}</p>
            )}
          </div>

          <LocationMapPicker
            latitude={value.specificPlace?.latitude}
            longitude={value.specificPlace?.longitude}
            isLocating={isLocating}
            onMapPick={handleMapPick}
            onUseCurrentLocation={handleUseCurrentLocation}
          />

          {!!locationError && <p className="text-xs font-semibold text-red-400">{locationError}</p>}

          {value.specificPlace && (
            <div className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3">
              <p className="mb-1 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
                {t('reminders.placeAddress')}
              </p>
              <p className="py-1 text-base font-semibold text-[var(--bp-text)]">{value.specificPlace.address}</p>
              {value.specificPlace.city && <p className="text-xs text-[var(--bp-subtle)]">{value.specificPlace.city}</p>}
            </div>
          )}
        </>
      )}

      {value.mode === 'general_category' && (
        <PlaceTypeAutocomplete
          value={value.generalCategory?.category}
          customLabel={value.generalCategory?.customLabel}
          onChange={setGeneralCategory}
          onCustomLabelChange={setGeneralCustomLabel}
        />
      )}

      <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.radiusMeters')}
        </span>
        <div className="flex gap-2 pt-1">
          {RADIUS_OPTIONS.map((radius) => {
            const selected = value.radiusMeters === radius
            return (
              <button
                key={radius}
                type="button"
                onClick={() => setRadius(radius)}
                aria-pressed={selected}
                className={`flex-1 rounded-full border px-4 py-2.5 text-center text-xs font-black transition ${
                  selected
                    ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
                    : 'border-[var(--bp-border)] bg-[var(--bp-bg)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
                }`}
              >
                {radius}m
              </button>
            )
          })}
        </div>
      </label>

      <div className="grid grid-cols-2 gap-2">
        {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => {
          const selected = value.trigger === triggerType
          return (
            <button
              key={triggerType}
              type="button"
              onClick={() => setTrigger(triggerType)}
              aria-pressed={selected}
              className={`rounded-full border px-4 py-3 text-xs font-black capitalize transition ${
                selected
                  ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
                  : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
              }`}
            >
              {t(`reminders.${triggerType}`)}
            </button>
          )
        })}
      </div>
    </section>
  )
}
