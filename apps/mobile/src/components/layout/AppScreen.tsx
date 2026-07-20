import type { ReactNode, RefObject } from 'react'
import { KeyboardAvoidingView, Platform, RefreshControl, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/useTheme'

type AppScreenProps = {
  children: ReactNode
  scroll?: boolean
  keyboardAvoiding?: boolean
  fab?: ReactNode
  footer?: ReactNode
  contentClassName?: string
  scrollRef?: RefObject<ScrollView | null>
  refreshing?: boolean
  onRefresh?: () => void
}

// Generous allowance for a fixed footer (BottomActionBar or BottomNavBar), which
// float above content on their own safe-area padding — this just keeps the last
// scrolled card clear of them. insets.bottom is added on top for notched/gesture devices.
const FOOTER_CONTENT_ALLOWANCE = 160
const NO_FOOTER_CONTENT_GAP = 24

export function AppScreen({
  children,
  scroll = true,
  keyboardAvoiding = false,
  fab,
  footer,
  contentClassName = '',
  scrollRef,
  refreshing = false,
  onRefresh,
}: AppScreenProps) {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const bottomPadding = insets.bottom + (footer ? FOOTER_CONTENT_ALLOWANCE : NO_FOOTER_CONTENT_GAP)

  const content = scroll ? (
    <ScrollView
      ref={scrollRef}
      className={`flex-1 px-4 pt-6 ${contentClassName}`}
      contentContainerStyle={{ paddingBottom: bottomPadding }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accent} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 px-4 pt-6 ${contentClassName}`} style={{ paddingBottom: bottomPadding }}>
      {children}
    </View>
  )

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }} edges={['top', 'left', 'right']}>
      {keyboardAvoiding ? (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}

      {fab}
      {footer}
    </SafeAreaView>
  )
}
