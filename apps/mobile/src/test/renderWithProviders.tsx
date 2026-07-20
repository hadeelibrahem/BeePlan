import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react-native'
import type { ContextType, ReactElement, ReactNode } from 'react'
import { AuthContext } from '../providers/AuthProvider'
import { LanguageProvider } from '../i18n/LanguageContext'
import { ThemeProvider } from '../theme/ThemeContext'

export const testUser = { id: 'test-user', fullName: 'Test User', email: 'test@beeplan.app', avatarUrl: null, authProvider: 'email', googleId: null, emailVerified: true, timezone: 'UTC', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

export async function renderWithProviders(ui: ReactElement, options: RenderOptions & { user?: Partial<typeof testUser>; accessToken?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const user = { ...testUser, ...options.user }
  const accessToken = options.accessToken ?? 'test-access-token'
  const auth: NonNullable<ContextType<typeof AuthContext>> = { session: { user, accessToken }, user, accessToken, loading: false, oauthError: '', oauthMessage: '', clearOAuthError: () => {}, signIn: async () => {}, signUp: async () => true, signInWithGoogle: async () => {}, sendPasswordReset: async () => undefined, verifyRecoveryCode: async () => {}, updatePassword: async () => {}, signOut: async () => {} }
  function Providers({ children }: { children: ReactNode }) { return <AuthContext.Provider value={auth}><QueryClientProvider client={queryClient}><ThemeProvider><LanguageProvider>{children}</LanguageProvider></ThemeProvider></QueryClientProvider></AuthContext.Provider> }
  return { ...(await render(ui, { wrapper: Providers })), queryClient, auth }
}
