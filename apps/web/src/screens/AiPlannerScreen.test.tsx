import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AiPlannerScreen from './AiPlannerScreen'
import { LanguageProvider } from '../i18n/LanguageContext'
import { AuthProvider } from '../providers/AuthProvider'
import { ThemeProvider } from '../theme/ThemeContext'
import * as plannerApi from '../lib/plannerApi'

vi.mock('../lib/plannerApi', async () => {
  const actual = await vi.importActual<typeof import('../lib/plannerApi')>('../lib/plannerApi')
  return { ...actual, getDailyPlanAcceptance: vi.fn(), getPlannerPreferences: vi.fn(), generateDailyPlan: vi.fn() }
})

const getDailyPlanAcceptanceMock = vi.mocked(plannerApi.getDailyPlanAcceptance)
const getPlannerPreferencesMock = vi.mocked(plannerApi.getPlannerPreferences)
const generateDailyPlanMock = vi.mocked(plannerApi.generateDailyPlan)

function renderPlanner(accessToken = 'planner-test-token') {
  return render(
    <AuthProvider>
      <ThemeProvider>
        <LanguageProvider>
          <AiPlannerScreen accessToken={accessToken} />
        </LanguageProvider>
      </ThemeProvider>
    </AuthProvider>,
  )
}

describe('AiPlannerScreen passive loading', () => {
  afterEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
  })

  it('loads an existing plan passively and never generates on mount when no plan exists', async () => {
    getDailyPlanAcceptanceMock.mockResolvedValue(null)
    getPlannerPreferencesMock.mockRejectedValue(new Error('optional'))

    renderPlanner()

    await waitFor(() => expect(getDailyPlanAcceptanceMock).toHaveBeenCalledTimes(1))
    expect(generateDailyPlanMock).not.toHaveBeenCalled()
  })

  it('renders schedule counts, free time, badges, ranges, actions, and explanation wrappers in Arabic', async () => {
    window.localStorage.setItem('beeplan.language-preference', 'ar')
    getPlannerPreferencesMock.mockRejectedValue(new Error('optional'))
    getDailyPlanAcceptanceMock.mockResolvedValue({
      date: '2026-08-20',
      acceptedAt: '2026-08-20T08:00:00.000Z',
      plan: {
        date: '2026-08-20',
        generatedAt: '2026-08-20T08:00:00.000Z',
        source: 'fallback',
        workingHours: { start: '09:00', end: '17:00' },
        summary: 'User-visible plan summary',
        sections: {
          morning: [
            { id: 'task-1', type: 'task', taskId: 'task-1', title: 'User task one', startTime: '09:00', endTime: '09:30', durationMinutes: 30, priority: 'high', rationale: 'Due today', isFocusTask: true, locked: true, selectionSource: 'user' },
            { id: 'task-2', type: 'task', taskId: 'task-2', title: 'User task two', startTime: '10:00', endTime: '10:30', durationMinutes: 30, priority: 'medium' },
          ],
          afternoon: [], evening: [], night: [],
        },
        unscheduled: [], conflicts: [],
        capacity: { availableMinutes: 480, requestedMinutes: 60, scheduledMinutes: 60, postponedMinutes: 0, scheduledTaskCount: 2, postponedTaskCount: 0, freeMinutes: 420, maxDailyWorkMinutes: 480, emergencyBufferMinutes: 30 },
      },
    })

    renderPlanner()

    expect(await screen.findByText('User task one')).toBeTruthy()
    expect(document.body.textContent).toContain('مهمتان')
    expect(document.body.textContent).toMatch(/(?:٣٠|30) دقيقة متاحة/)
    expect(screen.getByText('مستحقة اليوم')).toBeTruthy()
    expect(screen.getByText('اخترتها أنت')).toBeTruthy()
    expect(screen.getByText('إلغاء التثبيت')).toBeTruthy()
    expect(document.body.textContent).toContain('إلى')
    fireEvent.click(screen.getByText('لماذا؟'))
    expect(screen.getByText('جُدولت هنا لأن')).toBeTruthy()
  })

  it('renders planner preferences and validation copy in Arabic', async () => {
    window.localStorage.setItem('beeplan.language-preference', 'ar')
    getDailyPlanAcceptanceMock.mockResolvedValue(null)
    getPlannerPreferencesMock.mockResolvedValue({
      focusStartTime: '10:00', focusEndTime: '09:00', workBlockMinutes: 25, breakMinutes: 5,
      energy: { morning: 'high', afternoon: 'medium', evening: 'low', night: 'low' },
      scheduleHardTasksInFocus: true, finishStartedFirst: true, groupSimilarTasks: false,
      bufferBeforeMeetings: true, bufferMinutes: 10, maxDailyWorkMinutes: 480,
      emergencyBufferMinutes: 30, sleep: { start: '23:00', end: '07:00' },
      lunch: { start: '12:00', end: '13:00', label: 'Lunch' }, unavailableHours: [], note: '',
    })

    renderPlanner()

    expect(await screen.findByText('تفضيلات تخطيط الذكاء الاصطناعي')).toBeTruthy()
    expect(screen.getByText('ساعات التركيز')).toBeTruthy()
    expect(screen.getByText('بومودورو')).toBeTruthy()
    expect(screen.getByText('يجب أن يسبق وقت البدء وقت الانتهاء.')).toBeTruthy()
    expect(screen.getByText('حفظ التفضيلات')).toBeTruthy()
  })
})
