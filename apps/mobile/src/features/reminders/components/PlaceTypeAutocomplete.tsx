import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { GeneralLocationCategory } from '../types/reminders.types';

const PLACE_TYPES: GeneralLocationCategory[] = [
  'home',
  'work',
  'university',
  'school',
  'gym',
  'pharmacy',
  'grocery_store',
  'coffee_shop',
  'restaurant',
  'hospital',
  'airport',
  'bank',
  'atm',
  'parking',
  'gas_station',
  'mosque',
  'library',
  'custom',
];

type Props = {
  value?: GeneralLocationCategory;
  customLabel?: string;
  onChange: (category: GeneralLocationCategory) => void;
  onCustomLabelChange: (label: string) => void;
};

export function PlaceTypeAutocomplete({ value, customLabel, onChange, onCustomLabelChange }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selectedLabel = value ? t(`reminders.generalLocationCategory.${value}`) : '';
  const displayValue = isOpen ? query : selectedLabel;

  const filteredTypes = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return PLACE_TYPES;
    return PLACE_TYPES.filter((type) => t(`reminders.generalLocationCategory.${type}`).toLowerCase().includes(normalized));
  }, [query, t]);

  const openDropdown = () => {
    setQuery('');
    setIsOpen(true);
  };

  const handleChangeText = (text: string) => {
    setQuery(text);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelect = (type: GeneralLocationCategory) => {
    onChange(type);
    setQuery('');
    setIsOpen(false);
  };

  return (
    <View>
      <Text className="mb-2 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.placeType')}
      </Text>
      <View className="rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
        <TextInput
          value={displayValue}
          onChangeText={handleChangeText}
          onFocus={openDropdown}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Escape') {
              setIsOpen(false);
              setQuery('');
            }
          }}
          placeholder={t('reminders.placeTypePlaceholder')}
          placeholderTextColor={colors.placeholder}
          autoCorrect={false}
          autoCapitalize="none"
          className="py-2 text-base font-semibold"
          style={{ color: colors.text }}
        />
      </View>

      {isOpen && (
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
          <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator>
            {filteredTypes.length === 0 ? (
              <View className="px-4 py-3">
                <Text className="text-sm" style={{ color: colors.secondaryText }}>
                  {t('reminders.placeTypeNoResults')}
                </Text>
              </View>
            ) : (
              filteredTypes.map((type, index) => {
                const selected = value === type;
                return (
                  <Pressable
                    key={type}
                    onPress={() => handleSelect(type)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    className="px-4 py-3 active:opacity-70"
                    style={index > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined}
                  >
                    <Text className="text-sm font-semibold" style={{ color: selected ? colors.accent : colors.text }}>
                      {t(`reminders.generalLocationCategory.${type}`)}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      )}

      {value === 'custom' && (
        <View className="mt-3 rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
          <Text className="mb-1 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
            {t('reminders.customPlaceType')}
          </Text>
          <TextInput
            value={customLabel ?? ''}
            onChangeText={onCustomLabelChange}
            placeholder={t('reminders.customLabelPlaceholder')}
            placeholderTextColor={colors.placeholder}
            className="py-2 text-base font-semibold"
            style={{ color: colors.text }}
          />
        </View>
      )}
    </View>
  );
}
