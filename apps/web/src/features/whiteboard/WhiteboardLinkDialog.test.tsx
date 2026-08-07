import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WhiteboardLinkDialog } from './WhiteboardLinkDialog'

describe('WhiteboardLinkDialog', () => {
  it('does not create a card until the user confirms', () => {
    const onSave = vi.fn()
    render(<WhiteboardLinkDialog open onClose={() => undefined} onSave={onSave} />)
    expect(onSave).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'https://example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSave).toHaveBeenCalledWith('https://example.com/', '')
  })

  it('keeps the optional title and rejects unsafe URLs', () => {
    const onSave = vi.fn()
    render(<WhiteboardLinkDialog open onClose={() => undefined} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'javascript:alert(1)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(onSave).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP or HTTPS')
  })
})
