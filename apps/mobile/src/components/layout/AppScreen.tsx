import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTheme } from '../../theme/useTheme'

type AppScreenProps = {
  children: ReactNode
  scroll?: boolean
  keyboardAvoiding?: boolean
  fab?: ReactNode
  footer?: ReactNode
  contentClassName?: string
}

export function AppScreen({
  children,
  scroll = true,
  keyboardAvoiding = false,
  fab,
  footer,
  contentClassName = '',
}: AppScreenProps) {
  const { theme } = useTheme()
  const content = scroll ? (
    <ScrollView
      className={`flex-1 px-4 pt-6 ${contentClassName}`}
      contentContainerStyle={{ paddingBottom: footer ? 140 : 32 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View className={`flex-1 px-4 pt-6 ${contentClassName}`}>{children}</View>
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
