import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WhiteboardToolbar } from './WhiteboardToolbar'

function makeEditor() {
  let tool = 'select'
  let listener: (() => void) | undefined
  return {
    getCurrentToolId: vi.fn(() => tool),
    setCurrentTool: vi.fn((next: string) => { tool = next; listener?.() }),
    setStyleForNextShapes: vi.fn(),
    store: { listen: vi.fn((next: () => void) => { listener = next; return () => { listener = undefined } }) },
  } as never
}

describe('WhiteboardToolbar', () => {
  it('disables editor tools until an editor is mounted', () => {
    render(<WhiteboardToolbar editor={null} />)
    expect(screen.getByRole('button', { name: 'Select' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Draw' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Text' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Shapes' })).toBeDisabled()
  })

  it('activates select, draw, text, and geometry tools', () => {
    const editor = makeEditor()
    render(<WhiteboardToolbar editor={editor} />)
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }))
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    fireEvent.click(screen.getByRole('button', { name: 'Shapes' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rectangle' }))
    fireEvent.click(screen.getByRole('button', { name: 'Shapes' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Arrow' }))
    expect(editor.setCurrentTool).toHaveBeenNthCalledWith(1, 'draw')
    expect(editor.setCurrentTool).toHaveBeenNthCalledWith(2, 'text')
    expect(editor.setCurrentTool).toHaveBeenNthCalledWith(3, 'geo')
    expect(editor.setCurrentTool).toHaveBeenNthCalledWith(4, 'arrow')
    expect(editor.setStyleForNextShapes).toHaveBeenCalledOnce()
  })

  it('keeps Task as the picker action and follows editor active-tool changes', () => {
    const editor = makeEditor()
    const onTaskClick = vi.fn()
    render(<WhiteboardToolbar editor={editor} onTaskClick={onTaskClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Task' }))
    expect(onTaskClick).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps Upload disabled before mount and forwards selected files after mount', () => {
    const onUpload = vi.fn()
    const { rerender, container } = render(<WhiteboardToolbar editor={null} onUpload={onUpload} />)
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
    const editor = makeEditor()
    rerender(<WhiteboardToolbar editor={editor} onUpload={onUpload} />)
    const file = new File(['content'], 'brief.txt', { type: 'text/plain' })
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(onUpload).toHaveBeenCalledWith([file])
  })

  it('opens the real file input and forwards a selected file through onChange', () => {
    const onUpload = vi.fn()
    const editor = makeEditor()
    const { container } = render(<WhiteboardToolbar editor={editor} onUpload={onUpload} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(click).toHaveBeenCalledOnce()
    const file = new File(['png'], 'image.png', { type: 'image/png' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(onUpload).toHaveBeenCalledWith([file])
    expect(input.value).toBe('')
  })

  it('opens the Link action through its callback', () => {
    const onLinkClick = vi.fn()
    render(<WhiteboardToolbar editor={makeEditor()} onLinkClick={onLinkClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'Link' }))
    expect(onLinkClick).toHaveBeenCalledOnce()
  })
})
