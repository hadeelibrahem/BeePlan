import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { searchPlacesByCategory, type NearbyPlace } from '../../../lib/geoapify';
import { useTheme } from '../../../theme/useTheme';
import { PLACE_CATEGORIES } from '../constants/placeCategories';
import type { LocationMode, Reminder, TriggerType } from '../types/reminders.types';
import { PlacesAutocompleteInput, type PlaceSelection } from './PlacesAutocompleteInput';

type LocationValue = NonNullable<Reminder['location']>;

type Props = {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
};

const MODES: LocationMode[] = ['specific', 'category'];

export function LocationReminderFields({ value, onChange }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);

  useEffect(() => {
    if (value.mode !== 'category' || !value.category) {
      setNearbyPlaces([]);
      return;
    }

    let cancelled = false;
    const category = value.category;
    const radiusMeters = value.radiusMeters;

    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (status !== 'granted') {
          if (!cancelled) setNearbyPlaces([]);
          return;
        }

        const position = await Location.getCurrentPositionAsync({});
        const places = await searchPlacesByCategory(
          category,
          position.coords.latitude,
          position.coords.longitude,
          radiusMeters,
        );

        if (!cancelled) setNearbyPlaces(places);
      } catch (error) {
        console.error(error);
        if (!cancelled) setNearbyPlaces([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value.mode, value.category, value.radiusMeters]);

  const setMode = (mode: LocationMode) => onChange({ ...value, mode });
  const setRadius = (radiusMeters: number) => onChange({ ...value, radiusMeters });
  const setTriggerType = (triggerType: TriggerType) => onChange({ ...value, triggerType });

  const setPlaceText = (placeName: string) =>
    onChange({
      ...value,
      placeName,
      address: undefined,
      latitude: undefined,
      longitude: undefined,
    });

  const setPlaceSelection = (place: PlaceSelection) => {
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);

    console.log('[LocationReminderFields] updating location state with selected place:', {
      placeName: place.placeName,
      address: place.address,
      latitude,
      longitude,
    });

    onChange({
      ...value,
      mode: 'specific',
      placeName: place.placeName,
      address: place.address,
      latitude,
      longitude,
    });
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
                  {t(mode === 'specific' ? 'reminders.modeSpecific' : 'reminders.modeCategory')}
                </Text>
                <Text className="mt-1 text-xs font-semibold" style={{ color: selected ? colors.accent : colors.secondaryText }}>
                  {t(mode === 'specific' ? 'reminders.modeSpecificHint' : 'reminders.modeCategoryHint')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {value.mode === 'specific' && (
        <>
          <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
            <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
              {t('reminders.searchPlace')}
            </Text>
            <PlacesAutocompleteInput
              value={value.placeName ?? ''}
              placeholder={t('reminders.searchPlacePlaceholder')}
              onTextChange={setPlaceText}
              onPlaceSelected={setPlaceSelection}
            />
          </View>
          {!!value.address && (
            <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.placeAddress')}
              </Text>
              <Text className="py-2 text-base font-semibold" style={{ color: colors.text }}>{value.address}</Text>
            </View>
          )}
        </>
      )}

      {value.mode === 'category' && (
        <View>
          <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
            {t('reminders.placeCategory')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PLACE_CATEGORIES.map((category) => {
              const selected = value.category === category;
              return (
                <Pressable
                  key={category}
                  onPress={() => onChange({ ...value, category })}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="rounded-full border px-4 py-2.5 active:opacity-80"
                  style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
                >
                  <Text className="text-xs font-black capitalize" style={{ color: selected ? colors.accent : colors.text }}>
                    {t(`reminders.category.${category}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {nearbyPlaces.length > 0 && (
            <View className="mt-4 rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.surface }}>
              <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
                {t('reminders.nearbyExamples')}
              </Text>
              <View className="gap-1 py-1">
                {nearbyPlaces.map((place, index) => (
                  <Text key={`${place.name}-${index}`} className="text-sm font-semibold" style={{ color: colors.text }}>
                    {place.name}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>
      )}

      <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
        <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
          {t('reminders.radiusMeters')}
        </Text>
        <TextInput
          keyboardType="numeric"
          value={String(value.radiusMeters)}
          onChangeText={(text) => setRadius(Number(text) || 0)}
          className="py-2 text-base font-semibold"
          style={{ color: colors.text }}
        />
      </View>

      <View className="flex-row gap-2">
        {(['arrive', 'leave'] as TriggerType[]).map((triggerType) => {
          const selected = value.triggerType === triggerType;
          return (
            <Pressable
              key={triggerType}
              onPress={() => setTriggerType(triggerType)}
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
