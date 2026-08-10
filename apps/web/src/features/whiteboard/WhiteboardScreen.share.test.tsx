import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

let WhiteboardScreen: typeof import('./WhiteboardScreen').WhiteboardScreen

const state = vi.hoisted(() => ({
  board: { id: 'board-1', accessRole: 'owner' as 'owner' | 'editor' | 'viewer', assetReferences: {} },
  members: [{ id: 'member-1', fullName: 'Editor User', email: 'editor@example.com', role: 'editor' }],
}))

const api = vi.hoisted(() => ({
  listWhiteboardMembers: vi.fn(),
  listWhiteboardBoardInvitations: vi.fn(),
  createWhiteboardInvitation: vi.fn(),
  updateWhiteboardMember: vi.fn(),
  removeWhiteboardMember: vi.fn(),
  revokeWhiteboardInvitation: vi.fn(),
}))

vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ accessToken: 'token' }) }))
vi.mock('./hooks/useWhiteboard', () => ({
  useWhiteboard: () => ({ board: state.board, loading: false, error: null, retry: vi.fn(), save: vi.fn(), retryKey: 0 }),
}))
vi.mock('./hooks/useWhiteboardAutosave', () => ({
  useWhiteboardAutosave: () => ({ status: 'saved', schedule: vi.fn(), retry: vi.fn() }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), setQueriesData: vi.fn(), invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn() }),
}))
vi.mock('../../lib/tasksApi', () => ({ getTasks: vi.fn(), changeTaskStatus: vi.fn() }))
vi.mock('./api/whiteboardApi', () => api)
vi.mock('./WhiteboardCanvas', () => ({ WhiteboardCanvas: ({ onRestored }: { onRestored?: (editor: null) => void }) => { onRestored?.(null); return <div data-testid="whiteboard-canvas" /> } }))
vi.mock('./WhiteboardToolbar', () => ({ WhiteboardToolbar: () => <div data-testid="whiteboard-toolbar" /> }))
vi.mock('./WhiteboardAdvancedControls', () => ({ WhiteboardAdvancedControls: () => null }))
vi.mock('./WhiteboardTaskPicker', () => ({ WhiteboardTaskPicker: () => null }))
vi.mock('./WhiteboardLinkDialog', () => ({ WhiteboardLinkDialog: () => null }))
vi.mock('./WhiteboardTaskContext', () => ({ WhiteboardTaskProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('./WhiteboardAssetContext', () => ({ WhiteboardAssetProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('./WhiteboardLinkContext', () => ({ WhiteboardLinkProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))

describe('WhiteboardScreen collaboration header', () => {
  beforeAll(async () => {
    Object.defineProperty(globalThis, 'CSS', { configurable: true, value: { supports: () => false } })
    WhiteboardScreen = (await import('./WhiteboardScreen')).WhiteboardScreen
  }, 30_000)

  beforeEach(() => {
    vi.clearAllMocks()
    state.board.accessRole = 'owner'
    api.listWhiteboardMembers.mockResolvedValue(state.members)
    api.listWhiteboardBoardInvitations.mockResolvedValue([])
  })

  it.each(['owner', 'editor', 'viewer'] as const)('shows Share and opens the role-aware dialog for %s', async (accessRole) => {
    state.board.accessRole = accessRole
    render(<WhiteboardScreen boardId="board-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Share whiteboard' }))

    expect(await screen.findByRole('dialog', { name: 'Share whiteboard' })).toBeInTheDocument()
    if (accessRole === 'owner') {
      expect(screen.getByRole('button', { name: 'Invite' })).toBeInTheDocument()
    } else {
      expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
    }
  })
})
