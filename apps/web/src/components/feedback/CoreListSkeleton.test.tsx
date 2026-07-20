import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CoreListSkeleton } from './CoreListSkeleton'

describe('CoreListSkeleton', () => {
  it('renders decorative rows matching the requested list density', () => {
    const { container } = render(<CoreListSkeleton variant="tasks" rows={3} />)
    expect(container.querySelector('[aria-hidden="true"]')?.children).toHaveLength(3)
    expect(screen.queryByRole('status')).toBeNull()
  })
})
