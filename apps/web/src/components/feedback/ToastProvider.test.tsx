import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast } from './ToastProvider'

function Trigger() {
  const { showToast } = useToast()
  return <><button onClick={() => showToast({ tone: 'success', message: 'Task saved.' })}>Success</button><button onClick={() => showToast({ tone: 'error', message: 'Task failed.' })}>Error</button><button onClick={() => showToast({ tone: 'info', message: 'Task deleted.', actionLabel: 'Undo', onAction: undo })}>Undo</button></>
}
const undo = vi.fn()

describe('ToastProvider', () => {
  it('announces success and error feedback through live regions', async () => {
    const user = userEvent.setup(); render(<ToastProvider><Trigger /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: 'Success' }))
    expect(screen.getByRole('status')).toHaveTextContent('Task saved.')
    await user.click(screen.getByRole('button', { name: 'Error' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Task failed.')
  })

  it('supports an optional undo action', async () => {
    undo.mockClear(); const user = userEvent.setup(); render(<ToastProvider><Trigger /></ToastProvider>)
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    await user.click(screen.getAllByRole('button', { name: 'Undo' })[1])
    expect(undo).toHaveBeenCalledTimes(1)
  })
})
