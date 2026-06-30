import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'

export type ThemeMode = 'dark' | 'light'

type ThemeContextValue = {
  mode: ThemeMode
  isDark: boolean
  toggleTheme: () => void
  setThemeMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'beeplan-web-theme'

function getInitialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'

  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored

  if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'

  return 'dark'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setMode] = useState<ThemeMode>(getInitialMode)

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

  const setThemeMode = (next: ThemeMode) => {
    setMode(next)
    window.localStorage.setItem(STORAGE_KEY, next)
  }

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      isDark: mode === 'dark',
      toggleTheme: () =>
        setMode((current) => {
          const next = current === 'dark' ? 'light' : 'dark'
          window.localStorage.setItem(STORAGE_KEY, next)
          return next
        }),
      setThemeMode,
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
