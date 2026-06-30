import { Pressable, Text } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { useLanguage } from './LanguageContext';

export function LanguageToggle() {
  const { t, toggleLanguage } = useLanguage();
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={toggleLanguage}
      accessibilityRole="button"
      accessibilityLabel={t('actions.switchLanguage')}
      className="h-10 items-center justify-center rounded-full border px-3 active:opacity-80"
      style={{ borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }}
    >
      <Text className="text-xs font-black" style={{ color: theme.colors.text }}>{t('common.languageToggle')}</Text>
    </Pressable>
  );
}
