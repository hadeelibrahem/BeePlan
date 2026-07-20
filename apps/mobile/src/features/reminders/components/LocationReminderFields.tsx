import * as Location from 'expo-location';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { requestForegroundLocationPermission } from '../../../lib/location';
import { useTheme } from '../../../theme/useTheme';
import { reverseGeocode, type GeoapifyPlaceSuggestion } from '../services/geoapifyPlacesService';
import type { GeneralLocationCategory, LocationReminderConfig, LocationReminderMode, TriggerType } from '../types/reminders.types';
import { LocationMapPicker } from './LocationMapPicker';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import { PlaceTypeAutocomplete } from './PlaceTypeAutocomplete';

const MODES: LocationReminderMode[] = ['specific_place', 'general_category'];
const RADIUS_OPTIONS = [100, 250, 500];

type Props = {
  value: LocationReminderConfig;
  onChange: (value: LocationReminderConfig) => void;
};

export function LocationReminderFields({ value, onChange }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const [searchText, setSearchText] = useState(value.specificPlace?.placeName ?? value.pendingPlaceName ?? '');
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  const setMode = (mode: LocationReminderMode) => onChange({ ...value, mode });
  const setTrigger = (trigger: TriggerType) => onChange({ ...value, trigger });
  const setRadius = (radiusMeters: number) => onChange({ ...value, radiusMeters });

  const setGeneralCategory = (category: GeneralLocationCategory) =>
    onChange({ ...value, generalCategory: { category, customLabel: value.generalCategory?.customLabel } });

  const setGeneralCustomLabel = (customLabel: string) =>
    onChange({ ...value, generalCategory: { category: value.generalCategory?.category ?? 'custom', customLabel } });

  const handlePlaceSelected = (place: GeoapifyPlaceSuggestion) => {
    setLocationError('');
    setSearchText(place.placeName);
    onChange({ ...value, specificPlace: { ...place, selectedBy: 'search' } });
  };

  const applyResolvedPoint = (place: GeoapifyPlaceSuggestion, selectedBy: 'map' | 'current_location') => {
    setSearchText(place.placeName);
    onChange({ ...value, specificPlace: { ...place, selectedBy } });
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

  return (
    <View className="gap-4">
      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
          {t('reminders.locationMode')}
        </Text>
        <View className="flex-row gap-2">
          {MODES.map((mode) => {
            const selected = value.mode === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => setMode(mode)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                className="flex-1 rounded-xl border px-3 py-3 active:opacity-80"
                style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
              >
                <Text className="text-sm font-black" style={{ color: colors.text }}>
                  {t(mode === 'specific_place' ? 'reminders.modeSpecific' : 'reminders.modeCategory')}
                </Text>
                <Text className="mt-1 text-xs font-semibold" style={{ color: selected ? colors.accent : colors.secondaryText }}>
                  {t(mode === 'specific_place' ? 'reminders.modeSpecificHint' : 'reminders.modeCategoryHint')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {value.mode === 'specific_place' && (
        <>
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
                // valid selection in place — manual text entry is not allowed.
                if (value.specificPlace && text !== value.specificPlace.placeName) {
                  onChange({ ...value, specificPlace: undefined });
                }
              }}
              onPlaceSelected={handlePlaceSelected}
            />
            {!value.specificPlace && !!value.pendingPlaceName && (
              <Text className="mt-1 text-xs font-semibold" style={{ color: colors.accent }}>
                {t('reminders.pendingPlaceHelp')}
              </Text>
            )}
          </View>

          <LocationMapPicker
            latitude={value.specificPlace?.latitude}
            longitude={value.specificPlace?.longitude}
            isLocating={isLocating}
            onMapPick={handleMapPick}
            onUseCurrentLocation={() => void handleUseCurrentLocation()}
          />

          {!!locationError && (
            <Text className="text-xs font-semibold" style={{ color: colors.error }}>{locationError}</Text>
          )}

          {!!value.specificPlace && (
            <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.placeAddress')}
              </Text>
              <Text className="py-2 text-base font-semibold" style={{ color: colors.text }}>{value.specificPlace.address}</Text>
              {!!value.specificPlace.city && (
                <Text className="text-xs" style={{ color: colors.secondaryText }}>{value.specificPlace.city}</Text>
              )}
            </View>
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

      <View>
        <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
          {t('reminders.radiusMeters')}
        </Text>
        <View className="flex-row gap-2">
          {RADIUS_OPTIONS.map((radius) => {
            const selected = value.radiusMeters === radius;
            return (
              <View key={radius} className="flex-1">
                <Pressable
                  onPress={() => setRadius(radius)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="rounded-full border px-4 py-2.5 active:opacity-80"
                  style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
                >
                  <Text className="text-center text-xs font-black" style={{ color: selected ? colors.accent : colors.text }}>
                    {radius}m
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <View className="flex-row gap-2">
        {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => {
          const selected = value.trigger === triggerType;
          return (
            <Pressable
              key={triggerType}
              onPress={() => setTrigger(triggerType)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="flex-1 rounded-full border px-4 py-3 active:opacity-80"
              style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
            >
              <Text className="text-center text-xs font-black capitalize" style={{ color: selected ? colors.accent : colors.text }}>
                {t(`reminders.${triggerType}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
