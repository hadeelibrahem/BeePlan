import { useEffect, useState } from 'react'
import { useLanguage } from '../../../i18n/LanguageContext'
import { searchPlacesByCategory, type NearbyPlace } from '../../../lib/geoapify'
import { PLACE_CATEGORIES } from '../constants/placeCategories'
import type { LocationMode, Reminder, TriggerType } from '../types/reminders.types'
import { PlacesAutocompleteInput, type PlaceSelection } from './PlacesAutocompleteInput'

type LocationValue = NonNullable<Reminder['location']>

type Props = {
  value: LocationValue
  onChange: (value: LocationValue) => void
}

const MODES: LocationMode[] = ['specific', 'category']

export function LocationReminderFields({ value, onChange }: Props) {
  const { t } = useLanguage()
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([])

  useEffect(() => {
    if (value.mode !== 'category' || !value.category || !navigator.geolocation) {
      setNearbyPlaces([])
      return
    }

    let cancelled = false
    const category = value.category
    const radiusMeters = value.radiusMeters

    navigator.geolocation.getCurrentPosition(
      (position) => {
        searchPlacesByCategory(category, position.coords.latitude, position.coords.longitude, radiusMeters)
          .then((places) => {
            if (!cancelled) setNearbyPlaces(places)
          })
          .catch((error: unknown) => {
            console.error(error)
            if (!cancelled) setNearbyPlaces([])
          })
      },
      () => setNearbyPlaces([]),
      { timeout: 5000 },
    )

    return () => {
      cancelled = true
    }
  }, [value.mode, value.category, value.radiusMeters])

  const setMode = (mode: LocationMode) => onChange({ ...value, mode })
  const setRadius = (radiusMeters: number) => onChange({ ...value, radiusMeters })
  const setTriggerType = (triggerType: TriggerType) => onChange({ ...value, triggerType })

  const setPlaceText = (placeName: string) =>
    onChange({
      ...value,
      placeName,
      address: undefined,
      latitude: undefined,
      longitude: undefined,
    })

  const setPlaceSelection = (place: PlaceSelection) =>
    onChange({
      ...value,
      placeName: place.placeName,
      address: place.address,
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
    })

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
                  {t(mode === 'specific' ? 'reminders.modeSpecific' : 'reminders.modeCategory')}
                </span>
                <span className={`mt-1 block text-xs font-semibold ${selected ? 'text-[var(--bp-accent)]' : 'text-[var(--bp-subtle)]'}`}>
                  {t(mode === 'specific' ? 'reminders.modeSpecificHint' : 'reminders.modeCategoryHint')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {value.mode === 'specific' && (
        <>
          <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
            <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
              {t('reminders.searchPlace')}
            </span>
            <PlacesAutocompleteInput
              value={value.placeName ?? ''}
              placeholder={t('reminders.searchPlacePlaceholder')}
              onTextChange={setPlaceText}
              onPlaceSelected={setPlaceSelection}
              className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none placeholder:text-[var(--bp-placeholder)]"
            />
          </label>
          {value.address && (
            <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 opacity-80">
              <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
                {t('reminders.placeAddress')}
              </span>
              <span className="block py-2 text-base font-semibold text-[var(--bp-text)]">{value.address}</span>
            </label>
          )}
        </>
      )}

      {value.mode === 'category' && (
        <div>
          <p className="mb-2 text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
            {t('reminders.placeCategory')}
          </p>
          <div className="flex flex-wrap gap-2">
            {PLACE_CATEGORIES.map((category) => {
              const selected = value.category === category
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => onChange({ ...value, category })}
                  aria-pressed={selected}
                  className={`rounded-full border px-4 py-2.5 text-xs font-black capitalize transition ${
                    selected
                      ? 'border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-[var(--bp-accent)]'
                      : 'border-[var(--bp-border)] bg-[var(--bp-surface)] text-[var(--bp-text)] hover:border-[var(--bp-accent)]'
                  }`}
                >
                  {t(`reminders.category.${category}`)}
                </button>
              )
            })}
          </div>
          {nearbyPlaces.length > 0 && (
            <label className="mt-4 block rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 opacity-80">
              <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
                {t('reminders.nearbyExamples')}
              </span>
              <div className="grid gap-1 py-1">
                {nearbyPlaces.map((place, index) => (
                  <span key={`${place.name}-${index}`} className="block text-sm font-semibold text-[var(--bp-text)]">
                    {place.name}
                  </span>
                ))}
              </div>
            </label>
          )}
        </div>
      )}

      <label className="rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-3 transition focus-within:border-[var(--bp-accent)]">
        <span className="mb-1 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
          {t('reminders.radiusMeters')}
        </span>
        <input
          type="number"
          min={1}
          value={value.radiusMeters}
          onChange={(event) => setRadius(Number(event.target.value) || 0)}
          className="w-full bg-transparent py-2 text-base font-semibold text-[var(--bp-text)] outline-none"
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => {
          const selected = value.triggerType === triggerType
          return (
            <button
              key={triggerType}
              type="button"
              onClick={() => setTriggerType(triggerType)}
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
