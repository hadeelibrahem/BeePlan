import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { autocompletePlaces, getPlaceDetails, type PlaceSuggestion } from '../../../lib/geoapify';
import { useTheme } from '../../../theme/useTheme';

export type PlaceSelection = {
  placeName: string;
  address?: string;
  latitude: number;
  longitude: number;
};

type Props = {
  value: string;
  placeholder?: string;
  onTextChange: (value: string) => void;
  onPlaceSelected: (place: PlaceSelection) => void;
};

const DEBOUNCE_MS = 350;

export function PlacesAutocompleteInput({ value, placeholder, onTextChange, onPlaceSelected }: Props) {
  const { theme } = useTheme();
  const { colors } = theme;
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleTextChange = (text: string) => {
    onTextChange(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!text.trim()) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      autocompletePlaces(text)
        .then((results) => {
          console.log('[PlacesAutocompleteInput] suggestions returned:', results);
          setSuggestions(results);
          setIsOpen(results.length > 0);
        })
        .catch((error: unknown) => {
          console.error(error);
          setSuggestions([]);
          setIsOpen(false);
        });
    }, DEBOUNCE_MS);
  };

  const handleSelect = (suggestion: PlaceSuggestion) => {
    console.log('[PlacesAutocompleteInput] suggestion tapped:', suggestion);
    setIsOpen(false);
    onTextChange(suggestion.label);

    getPlaceDetails(suggestion.placeId)
      .then((details) => {
        console.log('[PlacesAutocompleteInput] place details resolved:', details);
        onPlaceSelected(details);
      })
      .catch((error: unknown) => console.error(error));
  };

  const handleFocus = () => {
    if (suggestions.length > 0) setIsOpen(true);
  };

  return (
    <View>
      <TextInput
        value={value}
        onChangeText={handleTextChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        autoCorrect={false}
        autoCapitalize="none"
        className="py-2 text-base font-semibold"
        style={{ color: colors.text }}
      />
      {isOpen && suggestions.length > 0 && (
        <View
          className="mt-2 overflow-hidden rounded-2xl border"
          style={{
            borderColor: colors.border,
            backgroundColor: colors.card,
            shadowColor: colors.shadow,
            shadowOffset: { height: 8, width: 0 },
            shadowOpacity: 0.2,
            shadowRadius: 16,
            elevation: 4,
          }}
        >
          <ScrollView
            style={{ maxHeight: 220 }}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {suggestions.map((suggestion, index) => (
              <Pressable
                key={suggestion.placeId}
                onPress={() => handleSelect(suggestion)}
                accessibilityRole="button"
                className="px-4 py-3 active:opacity-70"
                style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
              >
                <Text className="text-sm font-semibold" style={{ color: colors.text }}>{suggestion.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
