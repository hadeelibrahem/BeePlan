import { ArrowRight, Dices } from 'lucide-react-native'
import { Pressable, Text, View } from 'react-native'
import { SectionCard } from './layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/useTheme'

export function RandomStartSheet({ onOpen }: { onOpen: () => void }) {
  const { language, isRTL } = useLanguage(); const { colors } = useTheme().theme
  return <SectionCard><Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={language === 'ar' ? 'افتح البدء العشوائي' : 'Open Random Start'} className="flex-row items-center gap-3">
    <View className="h-11 w-11 items-center justify-center rounded-2xl" style={{ backgroundColor: colors.accentSoft }}><Dices size={21} color={colors.accent}/></View>
    <View className="flex-1"><Text className="text-base font-black" style={{ color: colors.text }}>{language === 'ar' ? 'مش عارف شو تعمل بعدين؟' : "Can't decide what's next?"}</Text><Text className="mt-1 text-sm" style={{ color: colors.secondaryText }}>{language === 'ar' ? 'دع العجلة تختار مهمتك التالية.' : 'Let the wheel choose your next task.'}</Text></View>
    <ArrowRight size={18} color={colors.accent} style={{ transform: [{ rotate: isRTL ? '180deg' : '0deg' }] }}/>
  </Pressable></SectionCard>
}
