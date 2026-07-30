import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleConflictModal } from './ScheduleConflictModal'

const conflict = {
  id: 'task-1:commitment-1',
  task: {
    itemId: 'task-1',
    taskId: 'task-1',
    title: 'Write report',
    startTime: '10:15',
    endTime: '10:45',
    durationMinutes: 30,
    isFocusTask: true,
  },
  commitment: {
    id: 'commitment-1',
    title: 'Class',
    startTime: '10:00',
    endTime: '11:00',
  },
  conflictMinutes: 30,
}

describe('ScheduleConflictModal', () => {
  it('shows both blocks, conflict duration, changed preview, and focuses the recommended action', () => {
    render(<ScheduleConflictModal conflict={conflict} oldTime={{ startTime: '09:00', endTime: '09:30' }} onKeepCommitment={vi.fn()} onKeepTask={vi.fn()} onManual={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Schedule Conflict' })).toHaveAccessibleDescription('This task overlaps with your fixed commitment.')
    expect(screen.getByText('Write report')).toBeInTheDocument()
    expect(screen.getByText('Class')).toBeInTheDocument()
    expect(screen.getByText('Conflict duration: 30 minutes')).toBeInTheDocument()
    expect(screen.getByText(/09:00.09:30/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep Commitment (Recommended)' })).toHaveFocus()
  })

  it('exposes Keep Commitment, Keep Task, manual reschedule, and cancel actions', async () => {
    const handlers = [vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    render(<ScheduleConflictModal conflict={conflict} onKeepCommitment={handlers[0]} onKeepTask={handlers[1]} onManual={handlers[2]} onCancel={handlers[3]} />)
    const user = userEvent.setup()

    for (const [index, name] of ['Keep Commitment (Recommended)', 'Keep Task', 'Reschedule Manually', 'Cancel'].entries()) {
      await user.click(screen.getByRole('button', { name }))
      expect(handlers[index]).toHaveBeenCalledOnce()
    }
  })

  it('cancels from the keyboard with Escape', async () => {
    const onCancel = vi.fn()
    render(<ScheduleConflictModal conflict={conflict} onKeepCommitment={vi.fn()} onKeepTask={vi.fn()} onManual={vi.fn()} onCancel={onCancel} />)
    await userEvent.setup().keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('exposes postpone and cancel-task resolution actions when scheduled conflicts already exist', async () => {
    const onPostponeTask = vi.fn()
    const onCancelTask = vi.fn()
    render(<ScheduleConflictModal conflict={conflict} onKeepCommitment={vi.fn()} onKeepTask={vi.fn()} onManual={vi.fn()} onPostponeTask={onPostponeTask} onCancelTask={onCancelTask} onCancel={vi.fn()} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Postpone Task' }))
    await user.click(screen.getByRole('button', { name: 'Cancel Task' }))
    expect(onPostponeTask).toHaveBeenCalledOnce()
    expect(onCancelTask).toHaveBeenCalledOnce()
  })
})
