import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

function renderModal(onClose = vi.fn()) {
  return render(<><button>Opener</button><Modal open title="Example dialog" description="Helpful context" onClose={onClose} footer={<><button>Cancel</button><button>Confirm</button></>}><input aria-label="Name" /></Modal></>)
}

describe('Modal', () => {
  it('sets dialog semantics, locks scroll, and returns focus when closed', async () => {
    const onClose = vi.fn(); const { unmount } = renderModal(onClose)
    const dialog = screen.getByRole('dialog', { name: 'Example dialog', description: 'Helpful context' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape and traps Tab at the dialog boundary', async () => {
    const onClose = vi.fn(); renderModal(onClose); const user = userEvent.setup()
    const buttons = screen.getAllByRole('button')
    const last = buttons[buttons.length - 1]; last.focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
