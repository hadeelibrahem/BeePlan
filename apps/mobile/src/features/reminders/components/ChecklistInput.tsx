import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useTheme, type AppTheme } from '../../../theme/ThemeContext';
import type { ChecklistItem } from '../types/reminders.types';

type Props = {
  value: ChecklistItem[];
  onChange: (value: ChecklistItem[]) => void;
};

export function ChecklistInput({ value, onChange }: Props) {
  const { theme } = useTheme();
  const { formatNumber, t } = useLanguage();
  const styles = createStyles(theme);

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
        <Text className="text-xs font-black uppercase tracking-widest" style={styles.label}>
          {t('reminders.checklist')}
        </Text>
        <Pressable
          onPress={addItem}
          accessibilityRole="button"
          className="rounded-full border px-4 py-2"
          style={styles.addButton}
        >
          <Text className="text-xs font-black" style={styles.accentText}>{t('reminders.addItem')}</Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {value.map((item, index) => (
          <View key={item.id} className="flex-row items-center gap-2">
            <View className="h-9 w-9 items-center justify-center rounded-full border" style={styles.indexBubble}>
              <Text className="text-xs font-black" style={styles.accentText}>{formatNumber(index + 1)}</Text>
            </View>
            <TextInput
              placeholder={t('reminders.checklistItem')}
              placeholderTextColor={theme.colors.textSubtle}
              value={item.title}
              onChangeText={(text) => updateItem(item.id, text)}
              className="flex-1 rounded-2xl border px-4 py-3"
              style={styles.input}
            />
            <Pressable
              onPress={() => removeItem(item.id)}
              accessibilityRole="button"
              accessibilityLabel={t('reminders.checklistItem')}
              className="px-2 py-2"
            >
              <Text className="font-black" style={styles.label}>x</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

function createStyles(theme: AppTheme) {
  return StyleSheet.create({
    label: {
      color: theme.colors.textSubtle,
    },
    accentText: {
      color: theme.colors.accent,
    },
    addButton: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    indexBubble: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    input: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
  });
}
