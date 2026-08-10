import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { VoiceRecorder } from './VoiceRecorder'
describe('Time Capsule web voice recorder', () => {
  it('explains unsupported recording instead of failing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    render(<VoiceRecorder onRecorded={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: 'Record voice' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('not supported')
  })
})
