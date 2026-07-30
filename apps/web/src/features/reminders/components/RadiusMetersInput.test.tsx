import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RadiusMetersInput } from './RadiusMetersInput'

describe('RadiusMetersInput', () => {
  it('keeps an arbitrary valid integer unchanged', () => {
    const onChange = vi.fn()
    render(<RadiusMetersInput value={100} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('Radius (meters)'), {
      target: { value: '347' },
    })

    expect(onChange).toHaveBeenLastCalledWith(347)
    expect(screen.getByText('m')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['9', '5001', '12.5', '-20'])(
    'shows validation for invalid radius %s',
    (value) => {
      render(<RadiusMetersInput value={100} onChange={vi.fn()} />)

      fireEvent.change(screen.getByLabelText('Radius (meters)'), {
        target: { value },
      })

      expect(screen.getByRole('alert')).toHaveTextContent(/Radius must/)
    },
  )
})
