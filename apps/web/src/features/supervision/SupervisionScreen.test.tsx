import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../i18n/LanguageContext'
import { ThemeProvider } from '../../theme/ThemeContext'
import { AuthProvider } from '../../providers/AuthProvider'
import { supervisionApi } from './api'
import { canCreateRestriction, identityLabel, initials, remainingMinutes } from './SupervisionScreen'
import { SupervisionScreen } from './SupervisionScreen'

describe('Supervision safe identity presentation', () => {
  it('localizes the empty Supervision screen in English and Arabic', async () => {
    const relationships = vi.spyOn(supervisionApi, 'relationships').mockResolvedValue([])
    window.localStorage.setItem('beeplan.language-preference', 'en')
    const english = render(<AuthProvider><ThemeProvider><LanguageProvider><SupervisionScreen accessToken="token" /></LanguageProvider></ThemeProvider></AuthProvider>)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Manage progress and restrictions' })).toBeInTheDocument())
    expect(screen.getByText('No supervised people yet')).toBeInTheDocument()
    english.unmount()

    window.localStorage.setItem('beeplan.language-preference', 'ar')
    const arabic = render(<AuthProvider><ThemeProvider><LanguageProvider><SupervisionScreen accessToken="token" /></LanguageProvider></ThemeProvider></AuthProvider>)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'إدارة التقدم والقيود' })).toBeInTheDocument())
    expect(screen.getByText('لا يوجد أشخاص تحت الإشراف حتى الآن')).toBeInTheDocument()
    expect(screen.queryByText('Manage progress and restrictions')).not.toBeInTheDocument()

    arabic.unmount()
    relationships.mockRestore()
    window.localStorage.removeItem('beeplan.language-preference')
  })

  it('prefers a safe display name', () => expect(identityLabel({ id:'1',displayName:'Hadeel Ibrahim',username:'hadeel',avatarUrl:null })).toBe('Hadeel Ibrahim'))
  it('falls back to public username', () => expect(identityLabel({ id:'1',displayName:' ',username:'hadeel',avatarUrl:null })).toBe('@hadeel'))
  it('uses safe initials without exposing the id', () => expect(initials({ id:'private-uuid',displayName:'Hadeel Ibrahim',username:null,avatarUrl:null })).toBe('HI'))
  it('derives remaining effort only from safe projected minutes', () => { expect(remainingMinutes(120,45)).toBe(75); expect(remainingMinutes(30,50)).toBe(0) })
  it('requires an eligible task for task-linked restrictions and approved apps for every restriction', () => {
    expect(canCreateRestriction('task_or_time', '', ['app-1'])).toBe(false)
    expect(canCreateRestriction('task', 'task-1', [])).toBe(false)
    expect(canCreateRestriction('time', '', ['app-1'])).toBe(true)
    expect(canCreateRestriction('task_or_time', 'task-1', ['app-1'])).toBe(true)
  })
})
