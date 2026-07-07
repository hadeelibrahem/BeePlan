import { Modal, Pressable, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/useTheme'

type AddTaskSheetProps = {
  visible: boolean
  onClose: () => void
  onSelectManual: () => void
  onSelectAi: () => void
}

export function AddTaskSheet({ visible, onClose, onSelectManual, onSelectAi }: AddTaskSheetProps) {
  const { theme } = useTheme()
  const { colors } = theme
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
        <Pressable
          className="flex-1"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close add task sheet"
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
              Add Task
            </Text>
            <Text className="mt-2 text-center text-sm" style={{ color: colors.secondaryText }}>
              How would you like to create it?
            </Text>
          </View>

          <Pressable
            onPress={onSelectManual}
            accessibilityRole="button"
            accessibilityLabel="Manual Task"
            className="mb-3 rounded-2xl border px-4 py-4 active:opacity-80"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <Text className="font-bold" style={{ color: colors.text }}>
              Manual Task
            </Text>
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
              Fill in the task details yourself.
            </Text>
          </Pressable>

          <Pressable
            onPress={onSelectAi}
            accessibilityRole="button"
            accessibilityLabel="AI Plan Task"
            className="mb-3 rounded-2xl border px-4 py-4 active:opacity-80"
            style={{ borderColor: colors.accent, backgroundColor: colors.accentSoft }}
          >
            <Text className="font-bold" style={{ color: colors.accent }}>
              AI Plan Task
            </Text>
            <Text className="mt-1 text-xs" style={{ color: colors.secondaryText }}>
              Describe a big goal and let AI build subtasks, focus sessions, and reminders.
            </Text>
          </Pressable>

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="items-center rounded-2xl py-3.5 active:opacity-70"
            style={{ backgroundColor: colors.border }}
          >
            <Text className="font-bold" style={{ color: colors.text }}>
              Cancel
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  )
}
