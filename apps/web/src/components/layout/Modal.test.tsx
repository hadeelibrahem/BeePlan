import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

function renderModal(onClose = vi.fn()) {
  return render(<><button>Opener</button><Modal open title="Example dialog" description="Helpful context" onClose={onClose} footer={<><button>Cancel</button><button>Confirm</button></>}><input aria-label="Name" /></Modal></>)
}

function ControlledModal() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Opener</button><Modal open={open} title="Example dialog" onClose={() => setOpen(false)}><input aria-label="Name" /></Modal></>
}

describe('Modal', () => {
  it('sets dialog semantics and initial focus without a timing workaround', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Example dialog', description: 'Helpful context' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(document.body.style.overflow).toBe('hidden')
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })

  it('wraps forward from the last focusable control to Close dialog', async () => {
    renderModal(); const user = userEvent.setup()
    screen.getByRole('button', { name: 'Confirm' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })

  it('wraps backward from Close dialog to the last focusable control', async () => {
    renderModal(); const user = userEvent.setup()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus()
  })

  it('moves from the close button to an input and Shift+Tab returns to Close dialog', async () => {
    renderModal(); const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })

  it('skips disabled and hidden controls while trapping focus', async () => {
    render(<Modal open title="Example dialog" onClose={vi.fn()}><input aria-label="Name" /><button disabled>Disabled</button><button hidden>Hidden</button><button>Available</button></Modal>); const user = userEvent.setup()
    await user.tab()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Available' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
  })

  it('keeps focus on the close button when it is the only focusable control', async () => {
    render(<Modal open title="Example dialog" onClose={vi.fn()} />); const user = userEvent.setup()
    const close = screen.getByRole('button', { name: 'Close dialog' })
    await user.tab(); expect(close).toHaveFocus()
    await user.tab({ shift: true }); expect(close).toHaveFocus()
  })

  it('closes on Escape and restores focus to the trigger after close', async () => {
    render(<ControlledModal />); const user = userEvent.setup()
    const opener = screen.getByRole('button', { name: 'Opener' })
    await user.click(opener)
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })
})
