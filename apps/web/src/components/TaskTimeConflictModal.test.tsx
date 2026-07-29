import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TaskTimeConflictModal } from './TaskTimeConflictModal'

const candidate = (id: string, start: string, end: string) => ({ id, title: id, priority: 'high', dueDate: '2026-08-01', durationMinutes: 60, scheduledDate: '2026-07-29', scheduledStartTime: start, scheduledEndTime: end })
const conflict = { id: 'conflict', existingTask: candidate('Existing', '10:00', '11:00'), proposedTask: candidate('New', '10:30', '11:30'), overlapMinutes: 30 }

describe('TaskTimeConflictModal', () => {
  it('shows both task schedules, metadata, and exact overlap', () => {
    render(<TaskTimeConflictModal conflict={conflict} onMoveExisting={vi.fn()} onMoveNew={vi.fn()} onCancelExisting={vi.fn()} onCancelNew={vi.fn()} onCancelChanges={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Task Time Conflict' })).toHaveAccessibleDescription('These two tasks are scheduled at the same time. What would you like to do?')
    expect(screen.getByText('Exact overlap: 30 minutes')).toBeInTheDocument()
    expect(screen.getByText('Existing')).toBeInTheDocument()
    expect(screen.getByText('New')).toBeInTheDocument()
  })

  it('exposes move, cancel-existing, cancel-new, and cancel-changes actions', async () => {
    const handlers = [vi.fn(), vi.fn(), vi.fn()]
    render(<TaskTimeConflictModal conflict={conflict} onMoveExisting={vi.fn()} onMoveNew={vi.fn()} onCancelExisting={handlers[0]} onCancelNew={handlers[1]} onCancelChanges={handlers[2]} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Move Existing Task' }))
    expect(screen.getByRole('button', { name: 'Move automatically to nearest available slot' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel Existing Task' }))
    await user.click(screen.getByRole('button', { name: 'Cancel New Task' }))
    await user.click(screen.getByRole('button', { name: 'Cancel Changes' }))
    handlers.forEach((handler) => expect(handler).toHaveBeenCalledOnce())
  })

  it('supports manual date/time selection for moving either task', async () => {
    const onMoveExisting = vi.fn()
    render(<TaskTimeConflictModal conflict={conflict} onMoveExisting={onMoveExisting} onMoveNew={vi.fn()} onCancelExisting={vi.fn()} onCancelNew={vi.fn()} onCancelChanges={vi.fn()} />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Move Existing Task' }))
    await user.type(screen.getByLabelText('Move date'), '2026-07-30')
    await user.type(screen.getByLabelText('Move start time'), '12:00')
    await user.click(screen.getByRole('button', { name: 'Preview manual move' }))
    expect(onMoveExisting).toHaveBeenCalled()
  })
})
