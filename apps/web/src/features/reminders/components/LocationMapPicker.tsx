import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { useLanguage } from '../../../i18n/LanguageContext'
import { getTileLayerUrl } from '../services/geoapifyPlacesService'

const DEFAULT_CENTER: [number, number] = [20, 0]
const DEFAULT_ZOOM = 2
const SELECTED_ZOOM = 16

const pinIcon = L.divIcon({
  className: '',
  html:
    '<svg width="32" height="40" viewBox="0 0 32 40" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M16 0C7.16 0 0 7.16 0 16c0 11 16 24 16 24s16-13 16-24C32 7.16 24.84 0 16 0Z" fill="var(--bp-accent)" stroke="var(--bp-accent-text, #1a1a1a)" stroke-width="1"/>' +
    '<circle cx="16" cy="16" r="6" fill="var(--bp-accent-text, #1a1a1a)"/>' +
    '</svg>',
  iconSize: [32, 40],
  iconAnchor: [16, 40],
})

function ClickHandler({ onPick }: { onPick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function RecenterOnChange({ latitude, longitude }: { latitude?: number; longitude?: number }) {
  const map = useMap()

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return
    map.setView([latitude, longitude], Math.max(map.getZoom(), SELECTED_ZOOM))
  }, [latitude, longitude, map])

  return null
}

type Props = {
  latitude?: number
  longitude?: number
  isLocating?: boolean
  onMapPick: (coords: { latitude: number; longitude: number }) => void
  onUseCurrentLocation: () => void
}

export function LocationMapPicker({ latitude, longitude, isLocating, onMapPick, onUseCurrentLocation }: Props) {
  const { t } = useLanguage()
  const hasPoint = latitude !== undefined && longitude !== undefined
  const center: [number, number] = hasPoint ? [latitude as number, longitude as number] : DEFAULT_CENTER

  return (
    <div className="grid gap-3">
      <p className="text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">{t('reminders.mapPicker')}</p>

      <div className="overflow-hidden rounded-2xl border border-[var(--bp-border)]" style={{ height: 280 }}>
        <MapContainer
          center={center}
          zoom={hasPoint ? SELECTED_ZOOM : DEFAULT_ZOOM}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer attribution="&copy; OpenStreetMap contributors, &copy; Geoapify" url={getTileLayerUrl()} />
          <ClickHandler onPick={(lat, lon) => onMapPick({ latitude: lat, longitude: lon })} />
          <RecenterOnChange latitude={latitude} longitude={longitude} />
          {hasPoint && (
            <Marker
              position={center}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const marker = event.target as L.Marker
                  const position = marker.getLatLng()
                  onMapPick({ latitude: position.lat, longitude: position.lng })
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-[var(--bp-subtle)]">{t('reminders.mapPickerHint')}</p>

      <button
        type="button"
        onClick={onUseCurrentLocation}
        disabled={isLocating}
        className="rounded-full border border-[var(--bp-border)] bg-[var(--bp-surface)] px-4 py-2.5 text-xs font-black text-[var(--bp-text)] transition hover:border-[var(--bp-accent)] disabled:opacity-60"
      >
        {isLocating ? t('reminders.locating') : t('reminders.useCurrentLocation')}
      </button>
    </div>
  )
}
