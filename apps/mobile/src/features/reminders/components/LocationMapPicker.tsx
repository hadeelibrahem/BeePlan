import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { getTileLayerUrl, reverseGeocode } from '../services/geoapifyPlacesService';

const MAP_HEIGHT = 280;
const DEFAULT_REGION = { latitude: 32.2211, longitude: 35.2544, zoom: 13 };

type Coordinates = { latitude: number; longitude: number };

type Props = {
  latitude?: number;
  longitude?: number;
  isLocating?: boolean;
  onMapPick: (coords: Coordinates) => void;
  onUseCurrentLocation: () => void;
};

function createMapHtml(tileUrl: string, initial: Coordinates) {
  const tileUrlJson = JSON.stringify(tileUrl);
  const initialJson = JSON.stringify(initial);

  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0;background:#f2f3ed} .leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function () {
  const initial = ${initialJson};
  const map = L.map('map', { zoomControl: true }).setView([initial.latitude, initial.longitude], ${DEFAULT_REGION.zoom});
  L.tileLayer(${tileUrlJson}, { maxZoom: 19, attribution: '© Geoapify © OpenStreetMap contributors' }).addTo(map);
  let marker = null;
  function select(latitude, longitude) {
    if (marker) marker.setLatLng([latitude, longitude]);
    else marker = L.marker([latitude, longitude], { draggable: true }).addTo(map);
    marker.on('dragend', function () {
      const point = marker.getLatLng();
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'location', latitude: point.lat, longitude: point.lng }));
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'location', latitude: latitude, longitude: longitude }));
  }
  if (Number.isFinite(initial.latitude) && Number.isFinite(initial.longitude)) select(initial.latitude, initial.longitude);
  map.on('click', function (event) { select(event.latlng.lat, event.latlng.lng); });
})();
</script></body></html>`;
}

export function LocationMapPicker({ latitude, longitude, isLocating, onMapPick, onUseCurrentLocation }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const [mapRequested, setMapRequested] = useState(false);
  const [selected, setSelected] = useState<Coordinates | null>(
    Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude: latitude as number, longitude: longitude as number } : null,
  );
  const [selectedLabel, setSelectedLabel] = useState('');
  const [mapError, setMapError] = useState('');
  const tileUrl = useMemo(() => {
    try {
      return getTileLayerUrl();
    } catch {
      return null;
    }
  }, []);
  const initial = selected ?? { latitude: DEFAULT_REGION.latitude, longitude: DEFAULT_REGION.longitude };
  const mapHtml = useMemo(() => (tileUrl ? createMapHtml(tileUrl, initial) : null), [initial, tileUrl]);

  const handleMessage = async (event: WebViewMessageEvent) => {
    try {
      const message: unknown = JSON.parse(event.nativeEvent.data);
      if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'location') return;
      if (!('latitude' in message) || !('longitude' in message)) return;
      const next = { latitude: Number(message.latitude), longitude: Number(message.longitude) };
      if (!Number.isFinite(next.latitude) || !Number.isFinite(next.longitude) || Math.abs(next.latitude) > 90 || Math.abs(next.longitude) > 180) return;
      setSelected(next);
      setSelectedLabel('Selected location');
      setMapError('');
      try {
        const place = await reverseGeocode(next.latitude, next.longitude);
        setSelectedLabel([place.placeName, place.city || place.address].filter(Boolean).join(', ') || 'Selected location');
      } catch {
        setSelectedLabel(`Selected location · ${next.latitude.toFixed(4)}, ${next.longitude.toFixed(4)}`);
      }
    } catch {
      setMapError('Map is temporarily unavailable. You can still use current location or a saved place.');
    }
  };

  const confirmLocation = () => {
    if (!selected) return;
    onMapPick(selected);
    setMapRequested(false);
  };

  return (
    <View className="gap-3">
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.mapPicker')}
      </Text>

      {!mapRequested ? (
        <Pressable
          onPress={() => {
            setMapError('');
            setMapRequested(true);
          }}
          accessibilityRole="button"
          className="rounded-2xl border p-4 active:opacity-80"
          style={{ borderColor: colors.border, backgroundColor: colors.input }}
        >
          <Text className="font-black" style={{ color: colors.text }}>Choose on map</Text>
          <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>Open the Geoapify map to select a pin.</Text>
        </Pressable>
      ) : !mapHtml ? (
        <View className="rounded-2xl border p-4" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
          <Text className="font-black" style={{ color: colors.text }}>Map is temporarily unavailable.</Text>
          <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>You can still use current location or a saved place.</Text>
        </View>
      ) : (
        <>
          <View className="overflow-hidden rounded-2xl border" style={{ borderColor: colors.border, height: MAP_HEIGHT }}>
            <WebView
              source={{ html: mapHtml, baseUrl: 'about:blank' }}
              originWhitelist={['about:blank']}
              javaScriptEnabled
              domStorageEnabled={false}
              onMessage={(event) => void handleMessage(event)}
              onError={() => setMapError('Map is temporarily unavailable. You can still use current location or a saved place.')}
              onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
              accessibilityLabel="Geoapify map"
            />
          </View>
          {selectedLabel ? <Text className="text-sm font-bold" style={{ color: colors.text }}>{selectedLabel}</Text> : null}
          {mapError ? <Text className="text-xs" style={{ color: colors.error }}>{mapError}</Text> : null}
          <Pressable
            onPress={confirmLocation}
            disabled={!selected}
            accessibilityRole="button"
            className="rounded-full border px-4 py-3 active:opacity-80"
            style={{ borderColor: colors.border, backgroundColor: colors.accent, opacity: selected ? 1 : 0.5 }}
          >
            <Text className="text-center text-xs font-black" style={{ color: colors.accentInk }}>Confirm Location</Text>
          </Pressable>
        </>
      )}

      <Text className="text-xs" style={{ color: colors.secondaryText }}>{t('reminders.mapPickerHint')}</Text>
      <Pressable
        onPress={onUseCurrentLocation}
        disabled={isLocating}
        accessibilityRole="button"
        className="rounded-full border px-4 py-2.5 active:opacity-80"
        style={{ borderColor: colors.border, backgroundColor: colors.input, opacity: isLocating ? 0.6 : 1 }}
      >
        <Text className="text-center text-xs font-black" style={{ color: colors.text }}>
          {isLocating ? t('reminders.locating') : t('reminders.useCurrentLocation')}
        </Text>
      </Pressable>
    </View>
  );
}
