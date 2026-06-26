import { useState } from 'react'
import './App.css'
import AuthScreen from './screens/AuthScreen'
import ForgotPasswordScreen from './screens/ForgotPasswordScreen'
import ResetPasswordScreen from './screens/ResetPasswordScreen'

type Screen = 'auth' | 'forgot' | 'reset'

export default function App() {
  const [screen, setScreen] = useState<Screen>('auth')

  if (screen === 'forgot') {
    return <ForgotPasswordScreen onBack={() => setScreen('auth')} onReset={() => setScreen('reset')} />
  }

  if (screen === 'reset') {
    return <ResetPasswordScreen onBack={() => setScreen('auth')} />
  }

  return <AuthScreen onForgot={() => setScreen('forgot')} />
}
