import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

export type ThemeMode = 'dark' | 'light'

type ThemeContextValue = {
  mode: ThemeMode
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>('dark')

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.colorScheme = mode

    let metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta')
      metaThemeColor.name = 'theme-color'
      document.head.append(metaThemeColor)
    }
    metaThemeColor.content = mode === 'dark' ? '#2b323f' : '#ffffff'
  }, [mode])

  const value = useMemo(
    () => ({
      mode,
      toggleTheme: () => setMode((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [mode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return context
}
