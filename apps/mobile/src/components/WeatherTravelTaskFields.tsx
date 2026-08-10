import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useSavedPlaces } from '../features/context/hooks';
import type { SavedPlace } from '../features/context/types';
import { PlaceAutocomplete } from '../features/reminders/components/PlaceAutocomplete';
import { LocationMapPicker } from '../features/reminders/components/LocationMapPicker';
import type { GeoapifyPlaceSuggestion } from '../features/reminders/services/geoapifyPlacesService';
import type { TaskDestination } from '../lib/tasksApi';
import { useTheme } from '../theme/useTheme';

type Props = {
  accessToken?: string;
  destination: Partial<TaskDestination>;
  enabled: boolean;
  travelMode: 'driving' | 'walking' | 'cycling';
  onDestination: (value: Partial<TaskDestination>) => void;
  onEnabled: (value: boolean) => void;
  onTravelMode: (value: 'driving' | 'walking' | 'cycling') => void;
};

export function WeatherTravelTaskFields({
  accessToken,
  destination,
  enabled,
  onDestination,
  onEnabled,
}: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const { data: savedPlaces = [] } = useSavedPlaces(accessToken);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const selectPlace = (place: Pick<TaskDestination, 'displayName' | 'address' | 'latitude' | 'longitude' | 'savedPlaceId'>) => {
    onDestination({ ...place });
    setPickerVisible(false);
    setSearchText(place.displayName);
    setLocationError('');
  };

  const selectSavedPlace = (place: SavedPlace) =>
    selectPlace({
      displayName: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      savedPlaceId: place.id,
    });

  const selectSearchResult = (place: GeoapifyPlaceSuggestion) =>
    selectPlace({
      displayName: place.placeName || place.label,
      address: [place.address, place.city].filter(Boolean).join(', ') || place.label,
      latitude: place.latitude,
      longitude: place.longitude,
      savedPlaceId: null,
    });

  const useCurrentLocation = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocationError('Location access was denied. You can search for a place instead.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      let displayName = 'Current location';
      let address: string | null = null;
      try {
        const [result] = await Location.reverseGeocodeAsync(position.coords);
        address = result
          ? [result.name, result.street, result.city, result.region, result.country]
              .filter(Boolean)
              .join(', ')
          : null;
        displayName = result?.name || result?.city || displayName;
      } catch {
        // Coordinates are still valid if reverse geocoding is unavailable.
      }
      selectPlace({
        displayName,
        address,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        savedPlaceId: null,
      });
    } catch {
      setLocationError('Current location is unavailable. Search for a place or try again.');
    } finally {
      setLocating(false);
    }
  };

  return (
    <>
      <View className="mt-3 rounded-2xl border p-3" style={{ borderColor: colors.border, backgroundColor: colors.card }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <Text className="font-black" style={{ color: colors.text }}>🐝 Task Assistant</Text>
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
              Uses task context, weather and travel to help you prepare.
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            accessibilityLabel="Enable Task Assistant"
            onPress={() => onEnabled(!enabled)}
            className="h-7 w-12 justify-center rounded-full px-1"
            style={{ backgroundColor: enabled ? colors.accent : colors.border }}
          >
            <View className={`h-5 w-5 rounded-full bg-white ${enabled ? 'self-end' : 'self-start'}`} />
          </Pressable>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={destination.displayName ? 'Change location' : 'Add location'}
        onPress={() => setPickerVisible(true)}
        className="mt-3 flex-row items-center rounded-2xl border p-3 active:opacity-80"
        style={{ borderColor: colors.border, backgroundColor: colors.input }}
      >
        <Text className="mr-3 text-xl">📍</Text>
        <View className="min-w-0 flex-1">
          <Text className="text-xs font-black uppercase tracking-wide" style={{ color: colors.secondaryText }}>Location</Text>
          <Text className="mt-1 text-sm font-bold" style={{ color: colors.text }} numberOfLines={1}>
            {destination.displayName || 'Add location'}
          </Text>
          {destination.address ? <Text className="text-xs" style={{ color: colors.secondaryText }} numberOfLines={1}>{destination.address}</Text> : null}
        </View>
        <Text className="text-lg" style={{ color: colors.secondaryText }}>›</Text>
      </Pressable>

      <Modal visible={pickerVisible} animationType="slide" onRequestClose={() => setPickerVisible(false)}>
        <View className="flex-1" style={{ backgroundColor: colors.background }}>
          <View className="flex-row items-center border-b px-4 py-4" style={{ borderColor: colors.border }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close location picker" onPress={() => setPickerVisible(false)} className="mr-3 p-1">
              <Text className="text-2xl" style={{ color: colors.text }}>‹</Text>
            </Pressable>
            <Text className="text-xl font-black" style={{ color: colors.text }}>Choose Location</Text>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View className="rounded-2xl border px-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
              <PlaceAutocomplete value={searchText} placeholder="Search for a place..." onTextChange={setSearchText} onPlaceSelected={selectSearchResult} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Use current location" onPress={() => void useCurrentLocation()} disabled={locating} className="mt-3 flex-row items-center rounded-2xl border p-4" style={{ borderColor: colors.border, opacity: locating ? 0.6 : 1 }}>
              <Text className="mr-3 text-xl">📍</Text>
              <Text className="font-bold" style={{ color: colors.text }}>{locating ? 'Finding current location...' : 'Use current location'}</Text>
            </Pressable>
            {locationError ? <Text className="mt-2 text-sm" style={{ color: colors.error }}>{locationError}</Text> : null}

            {savedPlaces.length ? <View className="mt-6">
              <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>Saved places</Text>
              {savedPlaces.map((place) => <Pressable key={place.id} accessibilityRole="button" accessibilityLabel={`Select ${place.name}`} onPress={() => selectSavedPlace(place)} className="flex-row items-center border-b py-3" style={{ borderColor: colors.border }}>
                <Text className="mr-3 text-xl">{place.icon || '📍'}</Text>
                <View className="flex-1"><Text className="font-bold" style={{ color: colors.text }}>{place.name}</Text><Text className="text-xs" style={{ color: colors.secondaryText }}>{place.address || `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}</Text></View>
              </Pressable>)}
            </View> : null}

            {destination.displayName ? <Pressable accessibilityRole="button" accessibilityLabel="Remove location" onPress={() => selectPlace({ displayName: '', address: null, latitude: NaN, longitude: NaN, savedPlaceId: null })} className="mt-6 items-center rounded-xl border p-3" style={{ borderColor: colors.border }}><Text className="font-bold" style={{ color: colors.error }}>Remove location</Text></Pressable> : null}
            <View className="mt-4 overflow-hidden rounded-2xl"><LocationMapPicker latitude={Number.isFinite(destination.latitude) ? destination.latitude : undefined} longitude={Number.isFinite(destination.longitude) ? destination.longitude : undefined} isLocating={locating} onMapPick={(coords) => selectPlace({ displayName: 'Pinned location', address: null, ...coords, savedPlaceId: null })} onUseCurrentLocation={() => void useCurrentLocation()} /></View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}
