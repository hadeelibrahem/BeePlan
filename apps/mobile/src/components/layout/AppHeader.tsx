import { memo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';
import BeePlanLogo from '../BeePlanLogo';
import { useAuth } from '../../hooks/useAuth';
import { useLanguage } from '../../i18n/LanguageContext';
import { useTheme } from '../../theme/useTheme';
import { MobileIcon } from './MobileIcon';

type AppHeaderProps = {
  subtitle?: string;
  onSignOut?: () => Promise<void> | void;
  onOpenNotifications?: () => void;
  unreadCount?: number;
};

export function getUserInitial(name?: string, email?: string) {
  return (name?.trim() || email?.trim() || '?').charAt(0).toUpperCase();
}

export const AppHeader = memo(function AppHeader({ subtitle, onSignOut, onOpenNotifications, unreadCount = 0 }: AppHeaderProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, toggleLanguage, t } = useLanguage();
  const { colors } = theme;
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const signingOutRef = useRef(false);

  function requestSignOut() {
    setIsAccountOpen(false);
    Alert.alert('Sign out?', 'You will need to sign in again to access your BeePlan account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          if (signingOutRef.current || !onSignOut) return;
          signingOutRef.current = true;
          Promise.resolve(onSignOut())
            .catch((error: unknown) => {
              Alert.alert('Failed to sign out', error instanceof Error ? error.message : 'Could not sign out. Please try again.');
            })
            .finally(() => {
              signingOutRef.current = false;
            });
        },
      },
    ]);
  }

  return (
    <View className="mb-4 flex-row items-center justify-between">
      <View className="flex-1 flex-row items-center gap-3"><BeePlanLogo size={28} iconOnly /><View className="flex-1"><Text className="text-xl font-bold tracking-tight" style={{ color: colors.text }} numberOfLines={1}>{t('common.brand_name')}</Text>{subtitle && <Text className="text-xs" style={{ color: colors.secondaryText }} numberOfLines={1}>{subtitle}</Text>}</View></View>
      <View className="flex-row items-center gap-2">
        {onOpenNotifications ? <Pressable onPress={onOpenNotifications} accessibilityRole="button" accessibilityLabel={unreadCount ? `Open notifications, ${unreadCount} unread` : 'Open notifications'} className="relative h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.surfaceElevated }}><MobileIcon name="notifications" color={colors.text} size={20} />{unreadCount ? <View className="absolute right-0 top-0 min-w-[16px] items-center rounded-full px-1" style={{ backgroundColor: colors.error }}><Text className="text-[10px] font-black" style={{ color: colors.accentText }}>{unreadCount > 99 ? '99+' : unreadCount}</Text></View> : null}</Pressable> : null}
        <Pressable onPress={() => setIsAccountOpen(true)} accessibilityRole="button" accessibilityLabel="Open account menu" accessibilityHint="Shows account options" className="h-10 w-10 items-center justify-center rounded-full active:opacity-90" style={{ backgroundColor: colors.accent }}><Text className="text-sm font-black" style={{ color: colors.accentText }}>{getUserInitial(user?.fullName, user?.email)}</Text></Pressable>
      </View>

      <Modal visible={isAccountOpen} transparent animationType="slide" onRequestClose={() => setIsAccountOpen(false)} accessibilityViewIsModal>
        <Pressable className="flex-1 justify-end bg-black/45" onPress={() => setIsAccountOpen(false)} accessibilityRole="button" accessibilityLabel="Dismiss account menu">
          <Pressable onPress={() => {}} accessibilityRole="menu" className="rounded-t-3xl px-5 pb-10 pt-5" style={{ backgroundColor: colors.surfaceElevated }}>
            <View className="mb-4 items-center"><View className="h-1.5 w-10 rounded-full" style={{ backgroundColor: colors.border }} /></View>
            <Text className="text-lg font-black" style={{ color: colors.text }}>{user?.fullName || 'Account'}</Text>
            {user?.email && <Text className="mb-5 text-sm" style={{ color: colors.secondaryText }}>{user.email}</Text>}
            <Pressable onPress={toggleTheme} accessibilityRole="button" accessibilityLabel={`Switch to ${theme.mode === 'dark' ? 'light' : 'dark'} mode`} className="mb-2 rounded-xl border px-4 py-3" style={{ borderColor: colors.border }}><Text className="font-bold" style={{ color: colors.text }}>Theme: {theme.mode === 'dark' ? 'Dark' : 'Light'}</Text></Pressable>
            <Pressable onPress={toggleLanguage} accessibilityRole="button" accessibilityLabel="Switch language" className="mb-2 rounded-xl border px-4 py-3" style={{ borderColor: colors.border }}><Text className="font-bold" style={{ color: colors.text }}>Language: {language === 'ar' ? 'Arabic' : 'English'}</Text></Pressable>
            <Pressable onPress={requestSignOut} accessibilityRole="button" accessibilityLabel="Sign out" className="mt-2 rounded-xl px-4 py-3" style={{ backgroundColor: colors.error }}><Text className="text-center font-black" style={{ color: colors.accentText }}>Sign out</Text></Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
});
