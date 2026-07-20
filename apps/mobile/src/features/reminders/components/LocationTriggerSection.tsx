import * as Location from 'expo-location';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { requestForegroundLocationPermission } from '../../../lib/location';
import { useTheme } from '../../../theme/useTheme';
import type {
  GeneralLocationCategory,
  LocationTriggerType,
  ReminderLocationTrigger,
  TriggerType,
} from '../types/reminders.types';
import { reverseGeocode, type GeoapifyPlaceSuggestion } from '../services/geoapifyPlacesService';
import { LocationMapPicker } from './LocationMapPicker';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlaceTypeAutocomplete } from './PlaceTypeAutocomplete';

const LOCATION_TRIGGER_TYPES: LocationTriggerType[] = ['none', 'general_location', 'specific_location'];
const RADIUS_OPTIONS = [100, 250, 500];

const LOCATION_TRIGGER_LABEL_KEYS: Record<LocationTriggerType, string> = {
  none: 'reminders.noLocationReminder',
  general_location: 'reminders.generalLocationReminder',
  specific_location: 'reminders.specificLocationReminder',
};

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="rounded-full border px-4 py-2.5 active:opacity-80"
      style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
    >
      <Text className="text-xs font-black" style={{ color: selected ? colors.accent : colors.text }}>{label}</Text>
    </Pressable>
  );
}

type Props = {
  value: ReminderLocationTrigger;
  onChange: (value: ReminderLocationTrigger) => void;
};

export function LocationTriggerSection({ value, onChange }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  const setType = (type: LocationTriggerType) => onChange({ ...value, type });

  const setGeneralCategory = (category: GeneralLocationCategory) =>
    onChange({ ...value, generalLocation: { category, customLabel: value.generalLocation?.customLabel } });

  const setGeneralCustomLabel = (customLabel: string) =>
    onChange({
      ...value,
      generalLocation: { category: value.generalLocation?.category ?? 'custom', customLabel },
    });

  const [searchText, setSearchText] = useState(value.specificLocation?.placeName ?? value.pendingPlaceName ?? '');
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const handlePlaceSelected = (place: GeoapifyPlaceSuggestion) => {
    setLocationError('');
    setSearchText(place.placeName);
    onChange({
      ...value,
      specificLocation: {
        ...place,
        selectedBy: 'search',
        trigger: value.specificLocation?.trigger ?? 'arrive',
        radius: value.specificLocation?.radius ?? 100,
      },
    });
  };

  const applyResolvedPoint = (place: GeoapifyPlaceSuggestion, selectedBy: 'map' | 'current_location') => {
    setSearchText(place.placeName);
    onChange({
      ...value,
      specificLocation: {
        ...place,
        selectedBy,
        trigger: value.specificLocation?.trigger ?? 'arrive',
        radius: value.specificLocation?.radius ?? 100,
      },
    });
  };

  const handleMapPick = (coords: { latitude: number; longitude: number }) => {
    setLocationError('');
    reverseGeocode(coords.latitude, coords.longitude)
      .then((place) => applyResolvedPoint(place, 'map'))
      .catch((error: unknown) => {
        console.error(error);
        setLocationError(error instanceof Error ? error.message : 'Failed to resolve the selected point.');
      });
  };

  const handleUseCurrentLocation = async () => {
    setLocationError('');
    setIsLocating(true);
    try {
      const granted = await requestForegroundLocationPermission();

      if (!granted) {
        setLocationError('Location permission was denied.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({});
      const place = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      applyResolvedPoint(place, 'current_location');
    } catch (error) {
      console.error(error);
      setLocationError(error instanceof Error ? error.message : 'Failed to resolve your location.');
    } finally {
      setIsLocating(false);
    }
  };

  const setSpecificTrigger = (trigger: TriggerType) =>
    value.specificLocation &&
    onChange({ ...value, specificLocation: { ...value.specificLocation, trigger } });

  const setSpecificRadius = (radius: number) =>
    value.specificLocation &&
    onChange({ ...value, specificLocation: { ...value.specificLocation, radius } });

  return (
    <View className="gap-4">
      <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.locationTrigger')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {LOCATION_TRIGGER_TYPES.map((type) => (
          <Chip key={type} label={t(LOCATION_TRIGGER_LABEL_KEYS[type])} selected={value.type === type} onPress={() => setType(type)} />
        ))}
      </View>

      {value.type === 'general_location' && (
        <PlaceTypeAutocomplete
          value={value.generalLocation?.category}
          customLabel={value.generalLocation?.customLabel}
          onChange={setGeneralCategory}
          onCustomLabelChange={setGeneralCustomLabel}
        />
      )}

      {value.type === 'specific_location' && (
        <View className="gap-4">
          <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
            <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.searchPlace')}
            </Text>
            <PlaceAutocomplete
              value={searchText}
              placeholder={t('reminders.searchPlacePlaceholder')}
              onTextChange={(text) => {
                setSearchText(text);
                // Typing without picking a suggestion must not leave a stale
                // valid selection in place - manual text entry is not allowed.
                if (value.specificLocation && text !== value.specificLocation.placeName) {
                  onChange({ ...value, specificLocation: undefined });
                }
              }}
              onPlaceSelected={handlePlaceSelected}
            />
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
              {t('reminders.searchPlaceManualHint')}
            </Text>
            {!value.specificLocation && !!value.pendingPlaceName && (
              <Text className="mt-1 text-xs font-semibold" style={{ color: colors.accent }}>
                {t('reminders.pendingPlaceHelp')}
              </Text>
            )}
          </View>

          <LocationMapPicker
            latitude={value.specificLocation?.latitude}
            longitude={value.specificLocation?.longitude}
            isLocating={isLocating}
            onMapPick={handleMapPick}
            onUseCurrentLocation={() => void handleUseCurrentLocation()}
          />

          {!!locationError && (
            <Text className="text-xs font-semibold" style={{ color: colors.error }}>{locationError}</Text>
          )}

          {!!value.specificLocation && (
            <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.placeAddress')}
              </Text>
              <Text className="py-1 text-base font-semibold" style={{ color: colors.text }}>{value.specificLocation.address}</Text>
              {!!value.specificLocation.city && (
                <Text className="text-xs" style={{ color: colors.secondaryText }}>{value.specificLocation.city}</Text>
              )}
            </View>
          )}

          <View className="flex-row gap-2">
            {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => (
              <View key={triggerType} className="flex-1">
                <Chip
                  label={t(`reminders.${triggerType}`)}
                  selected={(value.specificLocation?.trigger ?? 'arrive') === triggerType}
                  onPress={() => setSpecificTrigger(triggerType)}
                />
              </View>
            ))}
          </View>

          <View>
            <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.radiusMeters')}
            </Text>
            <View className="flex-row gap-2">
              {RADIUS_OPTIONS.map((radius) => (
                <View key={radius} className="flex-1">
                  <Chip
                    label={`${radius}m`}
                    selected={(value.specificLocation?.radius ?? 100) === radius}
                    onPress={() => setSpecificRadius(radius)}
                  />
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
