import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom'
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard'

function Form({
  dirty,
  confirm,
  saveFirst = false,
}: {
  dirty: boolean
  confirm: (message: string) => boolean
  saveFirst?: boolean
}) {
  const { markSaved } = useUnsavedChangesGuard(dirty, { confirm })
  const navigate = useNavigate()
  return (
    <div>
      <p>Form page</p>
      <button
        type="button"
        onClick={() => {
          if (saveFirst) markSaved()
          navigate('/other')
        }}
      >
        Leave
      </button>
    </div>
  )
}

function renderWithRouter(element: React.ReactNode) {
  const router = createMemoryRouter(
    [
      { path: '/', element },
      { path: '/other', element: <p>Other page</p> },
    ],
    { initialEntries: ['/'] },
  )
  render(<RouterProvider router={router} />)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useUnsavedChangesGuard — in-app route changes', () => {
  it('does not warn when the form is clean', async () => {
    const confirm = vi.fn().mockReturnValue(true)
    const user = userEvent.setup()
    renderWithRouter(<Form dirty={false} confirm={confirm} />)

    await user.click(screen.getByRole('button', { name: /leave/i }))

    expect(await screen.findByText('Other page')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })

  it('warns and proceeds when the user confirms leaving a dirty form', async () => {
    const confirm = vi.fn().mockReturnValue(true)
    const user = userEvent.setup()
    renderWithRouter(<Form dirty confirm={confirm} />)

    await user.click(screen.getByRole('button', { name: /leave/i }))

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Other page')).toBeInTheDocument()
  })

  it('warns and stays put when the user cancels leaving a dirty form', async () => {
    const confirm = vi.fn().mockReturnValue(false)
    const user = userEvent.setup()
    renderWithRouter(<Form dirty confirm={confirm} />)

    await user.click(screen.getByRole('button', { name: /leave/i }))

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1))
    expect(screen.getByText('Form page')).toBeInTheDocument()
    expect(screen.queryByText('Other page')).toBeNull()
  })

  it('does not warn after a successful save (markSaved)', async () => {
    const confirm = vi.fn().mockReturnValue(true)
    const user = userEvent.setup()
    renderWithRouter(<Form dirty confirm={confirm} saveFirst />)

    await user.click(screen.getByRole('button', { name: /leave/i }))

    expect(await screen.findByText('Other page')).toBeInTheDocument()
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('useUnsavedChangesGuard — tab close (beforeunload)', () => {
  function dispatchBeforeUnload() {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event
  }

  it('blocks unload while dirty', () => {
    renderWithRouter(<Form dirty confirm={vi.fn()} />)
    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(true)
  })

  it('allows unload when clean', () => {
    renderWithRouter(<Form dirty={false} confirm={vi.fn()} />)
    const event = dispatchBeforeUnload()
    expect(event.defaultPrevented).toBe(false)
  })
})
