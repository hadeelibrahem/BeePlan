import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InlineStatusControl, statusNeedsMetadata } from './InlineStatusControl'
import type { TaskStatus } from './TaskStatusWorkflowModal'

function renderControl(status: TaskStatus, props: Partial<Parameters<typeof InlineStatusControl>[0]> = {}) {
  const onSimpleChange = vi.fn()
  const onNeedsMetadata = vi.fn()
  render(
    <InlineStatusControl
      status={status}
      onSimpleChange={onSimpleChange}
      onNeedsMetadata={onNeedsMetadata}
      {...props}
    />,
  )
  return { onSimpleChange, onNeedsMetadata }
}

const btn = (name: TaskStatus) => screen.getByRole('button', { name })

describe('statusNeedsMetadata', () => {
  it('flags Done and Missed as needing metadata, To Do / In Progress as simple', () => {
    expect(statusNeedsMetadata('Done')).toBe(true)
    expect(statusNeedsMetadata('Missed')).toBe(true)
    expect(statusNeedsMetadata('To Do')).toBe(false)
    expect(statusNeedsMetadata('In Progress')).toBe(false)
  })
})

describe('InlineStatusControl', () => {
  it('marks the current status as pressed', () => {
    renderControl('In Progress')
    expect(btn('In Progress')).toHaveAttribute('aria-pressed', 'true')
    expect(btn('To Do')).toHaveAttribute('aria-pressed', 'false')
  })

  it('applies To Do directly (simple, no modal)', async () => {
    const user = userEvent.setup()
    const { onSimpleChange, onNeedsMetadata } = renderControl('In Progress')
    await user.click(btn('To Do'))
    expect(onSimpleChange).toHaveBeenCalledWith('To Do')
    expect(onNeedsMetadata).not.toHaveBeenCalled()
  })

  it('applies In Progress directly (simple, no modal)', async () => {
    const user = userEvent.setup()
    const { onSimpleChange, onNeedsMetadata } = renderControl('To Do')
    await user.click(btn('In Progress'))
    expect(onSimpleChange).toHaveBeenCalledWith('In Progress')
    expect(onNeedsMetadata).not.toHaveBeenCalled()
  })

  it('routes Done to the metadata modal', async () => {
    const user = userEvent.setup()
    const { onSimpleChange, onNeedsMetadata } = renderControl('In Progress')
    await user.click(btn('Done'))
    expect(onNeedsMetadata).toHaveBeenCalledWith('Done')
    expect(onSimpleChange).not.toHaveBeenCalled()
  })

  it('routes Missed to the metadata modal', async () => {
    const user = userEvent.setup()
    const { onSimpleChange, onNeedsMetadata } = renderControl('To Do')
    await user.click(btn('Missed'))
    expect(onNeedsMetadata).toHaveBeenCalledWith('Missed')
    expect(onSimpleChange).not.toHaveBeenCalled()
  })

  it('does nothing when clicking the already-current status', async () => {
    const user = userEvent.setup()
    const { onSimpleChange, onNeedsMetadata } = renderControl('To Do')
    await user.click(btn('To Do'))
    expect(onSimpleChange).not.toHaveBeenCalled()
    expect(onNeedsMetadata).not.toHaveBeenCalled()
  })

  it('blocks starting/completing a dependency-blocked task, but allows To Do and Missed', () => {
    renderControl('To Do', { blocked: true })
    expect(btn('In Progress')).toBeDisabled()
    expect(btn('Done')).toBeDisabled()
    expect(btn('Missed')).toBeEnabled()
  })

  it('disables every option for viewers (permission guard)', () => {
    renderControl('To Do', { disabled: true })
    for (const name of ['To Do', 'In Progress', 'Done', 'Missed'] as TaskStatus[]) {
      expect(btn(name)).toBeDisabled()
    }
  })

  it('disables options while a change is in flight', () => {
    renderControl('To Do', { busy: true })
    expect(btn('In Progress')).toBeDisabled()
    expect(btn('Done')).toBeDisabled()
  })
})
