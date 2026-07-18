import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
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
  afterEach(() => vi.clearAllMocks())

  it('loads an existing plan passively and never generates on mount when no plan exists', async () => {
    getDailyPlanAcceptanceMock.mockResolvedValue(null)
    getPlannerPreferencesMock.mockRejectedValue(new Error('optional'))

    renderPlanner()

    await waitFor(() => expect(getDailyPlanAcceptanceMock).toHaveBeenCalledTimes(1))
    expect(generateDailyPlanMock).not.toHaveBeenCalled()
  })
})
