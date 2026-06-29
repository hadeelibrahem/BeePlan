import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import { autocompletePlaces, getPlaceDetails, type PlaceSuggestion } from '../../../lib/geoapify';

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
  const styles = createStyles(theme);
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
        placeholderTextColor={theme.colors.textSubtle}
        autoCorrect={false}
        autoCapitalize="none"
        className="py-2 text-base font-semibold"
        style={styles.input}
      />
      {isOpen && suggestions.length > 0 && (
        <View className="mt-2 overflow-hidden rounded-2xl border" style={styles.dropdown}>
          <ScrollView
            style={styles.dropdownScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {suggestions.map((suggestion, index) => (
              <Pressable
                key={suggestion.placeId}
                onPress={() => handleSelect(suggestion)}
                accessibilityRole="button"
                className="px-4 py-3"
                style={[styles.suggestionItem, index > 0 ? styles.suggestionDivider : null]}
              >
                <Text className="text-sm font-semibold" style={styles.suggestionText}>
                  {suggestion.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    input: {
      color: theme.colors.text,
    },
    dropdown: {
      backgroundColor: theme.colors.surfaceElevated,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.shadow,
      shadowOffset: { height: 8, width: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 16,
      elevation: 4,
    },
    dropdownScroll: {
      maxHeight: 220,
    },
    suggestionItem: {
      backgroundColor: 'transparent',
    },
    suggestionDivider: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    suggestionText: {
      color: theme.colors.text,
    },
  });
}
