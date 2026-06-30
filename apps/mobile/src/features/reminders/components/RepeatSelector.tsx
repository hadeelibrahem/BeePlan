import { Pressable, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { RepeatFrequency, RepeatRule } from '../types/reminders.types';

const FREQUENCIES: RepeatFrequency[] = ['none', 'daily', 'weekly', 'monthly'];

type Props = {
  value: RepeatRule;
  onChange: (value: RepeatRule) => void;
};

export function RepeatSelector({ value, onChange }: Props) {
  const { t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  return (
    <View>
      <Text className="mb-3 text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
        {t('reminders.repeat')}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {FREQUENCIES.map((frequency) => {
          const selected = value.frequency === frequency;
          return (
            <Pressable
              key={frequency}
              onPress={() => onChange({ ...value, frequency })}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="rounded-full border px-4 py-2.5 active:opacity-80"
              style={{ borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accentSoft : colors.input }}
            >
              <Text className="text-xs font-black capitalize" style={{ color: selected ? colors.accent : colors.text }}>
                {frequency}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {value.frequency !== 'none' && (
        <View className="mt-3 rounded-2xl border px-4 py-3" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
          <Text className="mb-1 text-xs font-bold" style={{ color: colors.secondaryText }}>{t('reminders.every')}</Text>
          <TextInput
            keyboardType="numeric"
            value={String(value.interval)}
            onChangeText={(text) => onChange({ ...value, interval: Number(text) || 1 })}
            className="text-base font-bold"
            style={{ color: colors.text }}
          />
        </View>
      )}
    </View>
  );
}
