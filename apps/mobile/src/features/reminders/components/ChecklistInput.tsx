import { Pressable, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme } from '../../../theme/useTheme';
import type { ChecklistItem } from '../types/reminders.types';

type Props = {
  value: ChecklistItem[];
  onChange: (value: ChecklistItem[]) => void;
};

export function ChecklistInput({ value, onChange }: Props) {
  const { formatNumber, t } = useLanguage();
  const { theme } = useTheme();
  const { colors } = theme;

  const addItem = () => {
    onChange([...value, { id: `item-${Date.now()}`, title: '', isDone: false }]);
  };

  const updateItem = (id: string, title: string) => {
    onChange(value.map((item) => (item.id === id ? { ...item, title } : item)));
  };

  const removeItem = (id: string) => {
    onChange(value.filter((item) => item.id !== id));
  };

  return (
    <View>
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xs font-black uppercase tracking-widest" style={{ color: colors.secondaryText }}>
          {t('reminders.checklist')}
        </Text>
        <Pressable
          onPress={addItem}
          accessibilityRole="button"
          className="rounded-full border px-4 py-2 active:opacity-80"
          style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
        >
          <Text className="text-xs font-black" style={{ color: colors.accent }}>{t('reminders.addItem')}</Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {value.map((item, index) => (
          <View key={item.id} className="flex-row items-center gap-2">
            <View className="h-9 w-9 items-center justify-center rounded-full border" style={{ borderColor: colors.border, backgroundColor: colors.input }}>
              <Text className="text-xs font-black" style={{ color: colors.accent }}>{formatNumber(index + 1)}</Text>
            </View>
            <TextInput
              placeholder={t('reminders.checklistItem')}
              placeholderTextColor={colors.placeholder}
              value={item.title}
              onChangeText={(text) => updateItem(item.id, text)}
              className="flex-1 rounded-2xl border px-4 py-3 text-sm"
              style={{ borderColor: colors.border, backgroundColor: colors.input, color: colors.text }}
            />
            <Pressable
              onPress={() => removeItem(item.id)}
              accessibilityRole="button"
              accessibilityLabel={t('reminders.checklistItem')}
              className="px-2 py-2 active:opacity-70"
            >
              <Text className="font-black" style={{ color: colors.secondaryText }}>x</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}
