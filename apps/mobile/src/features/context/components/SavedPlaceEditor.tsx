import { useState } from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { InputField, PrimaryButton, SecondaryButton } from '../../../components/layout';
import { useTheme } from '../../../theme/useTheme';
import { LocationMapPicker } from '../../reminders/components/LocationMapPicker';
import { PlaceAutocomplete } from '../../reminders/components/PlaceAutocomplete';
import type { SavedPlace, SavedPlaceInput } from '../types';
import { parseAliases, validateSavedPlace } from '../formLogic';

type Props = {
  visible: boolean;
  initial?: SavedPlace | null;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (input: SavedPlaceInput) => void;
};

export function SavedPlaceEditor({ visible, initial, saving, onClose, onSubmit }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [address, setAddress] = useState(initial?.address ?? '');
  const [latitude, setLatitude] = useState<number | undefined>(initial?.latitude);
  const [longitude, setLongitude] = useState<number | undefined>(initial?.longitude);
  const [radius, setRadius] = useState(String(initial?.radiusMeters ?? 150));
  const [aliasText, setAliasText] = useState((initial?.aliases ?? []).join(', '));
  const [isLocating, setIsLocating] = useState(false);
  const [error, setError] = useState('');

  const handleUseCurrentLocation = async () => {
    try {
      setIsLocating(true);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission is needed to use your current position.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      setLatitude(position.coords.latitude);
      setLongitude(position.coords.longitude);
    } catch {
      setError('Could not get your current location.');
    } finally {
      setIsLocating(false);
    }
  };

  const handleSubmit = () => {
    if (latitude === undefined || longitude === undefined) {
      return setError('Pick a location on the map or search for an address.');
    }
    const input: SavedPlaceInput = {
      name: name.trim(),
      icon: icon.trim() || null,
      category: category.trim() || null,
      address: address.trim() || null,
      latitude,
      longitude,
      radiusMeters: Number(radius),
      aliases: parseAliases(aliasText),
    };
    const validationError = validateSavedPlace(input);
    if (validationError) return setError(validationError);
    setError('');
    onSubmit(input);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Text className="mb-1 text-xl font-black" style={{ color: colors.text }}>
            {initial ? 'Edit saved place' : 'Add saved place'}
          </Text>
          <Text className="mb-4 text-xs" style={{ color: colors.secondaryText }}>
            Teach BeePlan a permanent place. The AI resolves any of its aliases to this exact location.
          </Text>

          <View className="flex-row gap-3">
            <View style={{ width: 90 }}>
              <InputField label="Icon" value={icon} onChangeText={setIcon} placeholder="🏠" />
            </View>
            <View className="flex-1">
              <InputField label="Name" value={name} onChangeText={setName} placeholder="Home" />
            </View>
          </View>

          <InputField
            label="Category (optional)"
            value={category}
            onChangeText={setCategory}
            placeholder="home, work, university, gym…"
            autoCapitalize="none"
          />

          <Text className="mb-1 mt-3 text-xs font-bold" style={{ color: colors.secondaryText }}>
            Search address
          </Text>
          <View
            className="rounded-xl px-3"
            style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}
          >
            <PlaceAutocomplete
              value={address}
              placeholder="Search for a place or address"
              onTextChange={setAddress}
              onPlaceSelected={(place) => {
                setAddress(place.address || place.label);
                setLatitude(place.latitude);
                setLongitude(place.longitude);
              }}
            />
          </View>

          <View className="mt-3" style={{ height: 220 }}>
            <LocationMapPicker
              latitude={latitude}
              longitude={longitude}
              isLocating={isLocating}
              onMapPick={({ latitude: lat, longitude: lon }) => {
                setLatitude(lat);
                setLongitude(lon);
              }}
              onUseCurrentLocation={handleUseCurrentLocation}
            />
          </View>

          <View className="mt-3">
            <InputField
              label="Radius (meters)"
              value={radius}
              onChangeText={setRadius}
              placeholder="150"
              keyboardType="number-pad"
            />
          </View>

          <InputField
            label="Aliases (comma-separated)"
            value={aliasText}
            onChangeText={setAliasText}
            placeholder="home, house, البيت, الدار"
            autoCapitalize="none"
          />
          <Text className="mt-1 text-[11px]" style={{ color: colors.secondaryText }}>
            Natural-language names the AI resolves to this place — English or Arabic.
          </Text>

          {error ? (
            <Text className="mt-3 text-sm font-semibold" style={{ color: colors.error }}>
              {error}
            </Text>
          ) : null}

          <View className="mt-5 flex-row gap-3">
            <View className="flex-1">
              <SecondaryButton onPress={onClose} fullWidth>
                Cancel
              </SecondaryButton>
            </View>
            <View className="flex-1">
              <PrimaryButton onPress={handleSubmit} loading={saving} fullWidth>
                {initial ? 'Save' : 'Add place'}
              </PrimaryButton>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}
