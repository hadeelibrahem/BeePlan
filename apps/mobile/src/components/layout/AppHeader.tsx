import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import BeePlanLogo from '../BeePlanLogo'
import { useLanguage } from '../../i18n/LanguageContext'
import { LanguageToggle } from '../../i18n/LanguageToggle'
import { useTheme } from '../../theme/useTheme'

type AppHeaderProps = {
  subtitle?: string
  onProfilePress?: () => void
  profileInitial?: string
}

export const AppHeader = memo(function AppHeader({ subtitle, onProfilePress, profileInitial = 'F' }: AppHeaderProps) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useLanguage()
  const { colors } = theme

  return (
    <View className="mb-5 flex-row items-center justify-between">
      <View className="flex-1 flex-row items-center gap-3">
        <BeePlanLogo size={28} iconOnly />

        <View className="flex-1">
          <Text className="text-xl font-bold tracking-tight" style={{ color: colors.text }} numberOfLines={1}>
            {t('common.brand_name')}
          </Text>
          {subtitle && (
            <Text className="text-xs" style={{ color: colors.secondaryText }} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
      </View>

      <View className="flex-row items-center gap-2">
        <LanguageToggle />

        <Pressable
          onPress={toggleTheme}
          accessibilityRole="switch"
          accessibilityState={{ checked: theme.mode === 'light' }}
          accessibilityLabel={`Switch to ${theme.mode === 'dark' ? 'light' : 'dark'} mode`}
          className="h-10 w-10 items-center justify-center rounded-full border active:opacity-70"
          style={{ borderColor: colors.border, backgroundColor: colors.surfaceElevated }}
        >
          <Text className="text-base font-black" style={{ color: colors.text }}>{theme.mode === 'light' ? '☀' : '☾'}</Text>
        </Pressable>

        {onProfilePress && (
          <Pressable
            onPress={onProfilePress}
            accessibilityRole="button"
            accessibilityLabel="Profile"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-90"
            style={{ backgroundColor: colors.accent }}
          >
            <Text className="text-sm font-black" style={{ color: colors.accentText }}>{profileInitial}</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
})
