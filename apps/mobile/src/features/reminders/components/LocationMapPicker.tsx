import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import MapView, { Marker, UrlTile, type MapPressEvent, type Region } from 'react-native-maps';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import { getTileLayerUrl } from '../services/geoapifyPlacesService';

const MAP_HEIGHT = 240;
const DEFAULT_REGION: Region = { latitude: 20, longitude: 0, latitudeDelta: 90, longitudeDelta: 90 };
const SELECTED_DELTA = 0.01;

type Props = {
  latitude?: number;
  longitude?: number;
  isLocating?: boolean;
  onMapPick: (coords: { latitude: number; longitude: number }) => void;
  onUseCurrentLocation: () => void;
};

export function LocationMapPicker({ latitude, longitude, isLocating, onMapPick, onUseCurrentLocation }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const mapRef = useRef<MapView>(null);
  const hasPoint = latitude !== undefined && longitude !== undefined;

  useEffect(() => {
    if (latitude === undefined || longitude === undefined) return;
    mapRef.current?.animateToRegion(
      { latitude, longitude, latitudeDelta: SELECTED_DELTA, longitudeDelta: SELECTED_DELTA },
      400,
    );
  }, [latitude, longitude]);

  const handlePress = (event: MapPressEvent) => {
    const { latitude: pickedLat, longitude: pickedLon } = event.nativeEvent.coordinate;
    onMapPick({ latitude: pickedLat, longitude: pickedLon });
  };

  return (
    <View className="gap-3">
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.mapPicker')}
      </Text>

      <View className="overflow-hidden rounded-2xl border" style={{ borderColor: colors.border, height: MAP_HEIGHT }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          mapType="none"
          initialRegion={
            hasPoint
              ? { latitude: latitude as number, longitude: longitude as number, latitudeDelta: SELECTED_DELTA, longitudeDelta: SELECTED_DELTA }
              : DEFAULT_REGION
          }
          onPress={handlePress}
        >
          <UrlTile urlTemplate={getTileLayerUrl()} maximumZ={19} flipY={false} />
          {hasPoint && (
            <Marker
              coordinate={{ latitude: latitude as number, longitude: longitude as number }}
              draggable
              onDragEnd={(event) => {
                const { latitude: draggedLat, longitude: draggedLon } = event.nativeEvent.coordinate;
                onMapPick({ latitude: draggedLat, longitude: draggedLon });
              }}
              pinColor={colors.accent}
            />
          )}
        </MapView>
      </View>

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
