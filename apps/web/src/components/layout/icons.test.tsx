import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DirectionalChevron } from './icons'

describe('DirectionalChevron', () => {
  it('mirrors forward and back directions for RTL', () => {
    const { container, rerender } = render(<DirectionalChevron direction="forward" isRTL={false} />)
    expect(container.querySelector('path')).toHaveAttribute('d', 'M9 5l7 7-7 7')

    rerender(<DirectionalChevron direction="forward" isRTL />)
    expect(container.querySelector('path')).toHaveAttribute('d', 'M15 5l-7 7 7 7')

    rerender(<DirectionalChevron direction="back" isRTL={false} />)
    expect(container.querySelector('path')).toHaveAttribute('d', 'M15 5l-7 7 7 7')

    rerender(<DirectionalChevron direction="back" isRTL />)
    expect(container.querySelector('path')).toHaveAttribute('d', 'M9 5l7 7-7 7')
  })
})
