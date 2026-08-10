import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWhiteboard } from './useWhiteboard'

const api = vi.hoisted(() => ({
  getWhiteboard: vi.fn(),
  getWhiteboardAccess: vi.fn(),
  openWhiteboard: vi.fn(),
  updateWhiteboard: vi.fn(),
}))
vi.mock('../api/whiteboardApi', () => api)

const board = { id: 'board-1', name: 'Shared', snapshot: { document: { store: {} } }, assetReferences: {}, camera: { x: 0, y: 0, zoom: 1 }, createdAt: '2026-08-06T00:00:00.000Z', updatedAt: '2026-08-06T00:00:00.000Z', accessRole: 'editor', isShared: true, previewUrl: null, isPinned: false, isArchived: false, lastOpenedAt: null }

describe('useWhiteboard background access checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.getWhiteboard.mockResolvedValue(board)
    api.openWhiteboard.mockResolvedValue(board)
    api.getWhiteboardAccess.mockResolvedValue({ boardId: 'board-1', accessRole: 'editor', updatedAt: '2026-08-06T00:01:00.000Z' })
  })

  it('checks access without fetching or replacing the full snapshot', async () => {
    const { result } = renderHook(() => useWhiteboard('token', 'board-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(api.getWhiteboard).toHaveBeenCalledOnce()

    await act(async () => { await result.current.checkAccess() })

    expect(api.getWhiteboardAccess).toHaveBeenCalledWith('token', 'board-1')
    expect(api.getWhiteboard).toHaveBeenCalledOnce()
    expect(result.current.remoteChanged).toBe(true)
    expect(result.current.board?.snapshot).toEqual(board.snapshot)
  })
})
