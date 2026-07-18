import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DangerButton, OutlineButton, PrimaryButton, SecondaryButton } from './Buttons'

describe('shared loading buttons', () => {
  it.each([
    ['primary', PrimaryButton],
    ['secondary', SecondaryButton],
    ['outline', OutlineButton],
    ['danger', DangerButton],
  ] as const)('%s keeps its visible label and disables while loading', (_name, Button) => {
    render(<Button loading>Save changes</Button>)

    const button = screen.getByRole('button', { name: /save changes/i })
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Save changes')
    expect(screen.getByText('Loading')).toHaveClass('sr-only')
  })
})
