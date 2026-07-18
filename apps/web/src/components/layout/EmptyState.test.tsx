import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders a first-run action and illustration', async () => {
    const onAction = vi.fn(); const user = userEvent.setup()
    render(<EmptyState illustration={<span>+</span>} variant="first-run" size="lg" title="No tasks yet" description="Start with one task." actionLabel="Create task" onAction={onAction} />)
    expect(screen.getByText('No tasks yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Create task' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('marks filtered results and does not offer a misleading create action', () => {
    const { container } = render(<EmptyState icon={<span>?</span>} variant="filtered" title="No matches" description="Adjust your filters." actionLabel="Create task" onAction={vi.fn()} />)
    expect(container.querySelector('[data-empty-variant="filtered"]')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create task' })).toBeNull()
  })
})
