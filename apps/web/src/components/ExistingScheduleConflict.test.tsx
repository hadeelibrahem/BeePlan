import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExistingScheduleConflict } from './ExistingScheduleConflict'

const plan = {
  date: '2026-07-29',
  generatedAt: new Date().toISOString(),
  source: 'fallback',
  workingHours: { start: '08:00', end: '21:00' },
  summary: '',
  sections: { morning: [], afternoon: [], evening: [], night: [] },
  unscheduled: [],
  capacity: { availableMinutes: 0, requestedMinutes: 0, scheduledMinutes: 0, postponedMinutes: 0, scheduledTaskCount: 0, postponedTaskCount: 0, freeMinutes: 0, maxDailyWorkMinutes: 0, emergencyBufferMinutes: 0 },
  conflicts: [{
    id: 'task:10:00-11:00:commitment:10:30-11:30',
    task: { itemId: 'item', taskId: '11111111-1111-1111-1111-111111111111', title: 'Existing task', startTime: '10:00', endTime: '11:00', durationMinutes: 60, isFocusTask: false },
    commitment: { id: '22222222-2222-2222-2222-222222222222', title: 'Fixed class', startTime: '10:30', endTime: '11:30' },
    conflictMinutes: 30,
  }],
}

afterEach(() => vi.unstubAllGlobals())

describe('ExistingScheduleConflict', () => {
  it('detects and prompts for an existing conflict on screen load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ date: plan.date, plan, acceptedAt: new Date().toISOString() }), { status: 200 })))
    render(<ExistingScheduleConflict accessToken="token" date={plan.date} />)
    expect(await screen.findByRole('dialog', { name: 'Schedule Conflict' })).toBeInTheDocument()
    expect(screen.getByText('Existing task')).toBeInTheDocument()
    expect(screen.getByText('Fixed class')).toBeInTheDocument()
  })

  it('keeps a persistent unresolved warning after dismissing the modal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ date: plan.date, plan, acceptedAt: new Date().toISOString() }), { status: 200 })))
    render(<ExistingScheduleConflict accessToken="token" date={plan.date} taskId="11111111-1111-1111-1111-111111111111" />)
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('alert')).toHaveTextContent('Unresolved Schedule Conflict')
    expect(screen.getByRole('button', { name: 'Resolve now' })).toBeInTheDocument()
  })
})
