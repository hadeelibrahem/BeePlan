import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/useTheme'
import { useLanguage } from '../i18n/LanguageContext'

type AddTaskSheetProps = {
  visible: boolean
  onClose: () => void
  onSelectManual: () => void
  onSelectAi: () => void
}

export function AddTaskSheet({ visible, onClose, onSelectManual, onSelectAi }: AddTaskSheetProps) {
  const { theme } = useTheme()
  const { colors } = theme
  const { t } = useLanguage()
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('shell.closeAddTask')}
        />

        <View
          className="rounded-t-[28px] border px-5 pt-3"
          style={{
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
            paddingBottom: insets.bottom + 20,
            shadowColor: theme.cardShadow.color,
            shadowOpacity: theme.cardShadow.opacity,
            shadowRadius: theme.cardShadow.radius,
            elevation: theme.cardShadow.elevation,
          }}
        >
          <View className="mx-auto mb-5 h-1.5 w-14 rounded-full" style={{ backgroundColor: colors.border }} />

          <View className="mb-5 items-center">
            <Text className="text-2xl font-black" style={{ color: colors.text }}>
              {t('shell.addTask')}
            </Text>
            <Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
              {t('shell.createHow')}
            </Text>
          </View>

          <Pressable
            onPress={onSelectManual}
            accessibilityRole="button"
            accessibilityLabel={t('shell.manualTask')}
            className="mb-3 rounded-2xl border px-4 py-4 active:opacity-80"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <Text className="font-bold" style={{ color: colors.text }}>
              {t('shell.manualTask')}
            </Text>
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
              {t('shell.manualTaskHelp')}
            </Text>
          </Pressable>

          <Pressable
            onPress={onSelectAi}
            accessibilityRole="button"
            accessibilityLabel={t('shell.aiPlanTask')}
            className="mb-3 rounded-2xl border px-4 py-4 active:opacity-80"
            style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
          >
            <Text className="font-bold" style={{ color: colors.accentInk }}>
              {t('shell.aiPlanTask')}
            </Text>
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
              {t('shell.aiPlanTaskHelp')}
            </Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            className="items-center rounded-2xl py-3.5 active:opacity-70"
            style={{ backgroundColor: colors.border }}
          >
            <Text className="font-bold" style={{ color: colors.text }}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
