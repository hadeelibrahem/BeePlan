import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useLanguage } from './LanguageContext';

export function LanguageToggle() {
  const { t, toggleLanguage } = useLanguage();
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={toggleLanguage}
      accessibilityRole="button"
      accessibilityLabel={t('actions.switchLanguage')}
      style={[
        styles.button,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.text, { color: theme.colors.text }]}>{t('common.languageToggle')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: '900',
  },
});
