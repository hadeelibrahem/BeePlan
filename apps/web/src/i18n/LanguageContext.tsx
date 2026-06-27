import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import ar from './locales/ar.json'
import en from './locales/en.json'

export type Language = 'en' | 'ar'

type TranslationValue = string | TranslationTree

interface TranslationTree {
  [key: string]: TranslationValue
}

type LanguageContextValue = {
  language: Language
  isRTL: boolean
  setLanguage: (language: Language) => void
  toggleLanguage: () => void
  t: (key: string, params?: Record<string, string | number>) => string
  formatNumber: (value: number) => string
  formatPercent: (value: number) => string
}

const dictionaries: Record<Language, TranslationTree> = { en, ar }
const LanguageContext = createContext<LanguageContextValue | null>(null)

function resolveTranslation(dictionary: TranslationTree, key: string) {
  return key.split('.').reduce<TranslationValue | undefined>((current, part) => {
    if (!current || typeof current === 'string') return undefined
    return current[part]
  }, dictionary)
}

export function LanguageProvider({ children }: PropsWithChildren) {
  const [language, setLanguage] = useState<Language>('en')

  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
  }, [language])

  const value = useMemo<LanguageContextValue>(() => {
    const isRTL = language === 'ar'
    const numberFormatter = new Intl.NumberFormat(isRTL ? 'ar' : 'en-US')

    return {
      language,
      isRTL,
      setLanguage,
      toggleLanguage: () => setLanguage((current) => (current === 'ar' ? 'en' : 'ar')),
      t: (key, params) => {
        const raw = resolveTranslation(dictionaries[language], key)
        const fallback = resolveTranslation(dictionaries.en, key)
        const template = typeof raw === 'string' ? raw : typeof fallback === 'string' ? fallback : key

        return Object.entries(params ?? {}).reduce(
          (text, [paramKey, valueParam]) => text.replaceAll(`{{${paramKey}}}`, String(valueParam)),
          template,
        )
      },
      formatNumber: (number) => numberFormatter.format(number),
      formatPercent: (valuePercent) => `${numberFormatter.format(valuePercent)}${isRTL ? '٪' : '%'}`,
    }
  }, [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used inside LanguageProvider')
  }
  return context
}
