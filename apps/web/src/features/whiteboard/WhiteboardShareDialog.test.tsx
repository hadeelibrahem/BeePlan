import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WhiteboardShareDialog } from './WhiteboardShareDialog'

const api = vi.hoisted(() => ({
  createWhiteboardInvitation: vi.fn(),
  listWhiteboardInviteCandidates: vi.fn(),
  listWhiteboardBoardInvitations: vi.fn(),
  listWhiteboardMembers: vi.fn(),
  removeWhiteboardMember: vi.fn(),
  revokeWhiteboardInvitation: vi.fn(),
  updateWhiteboardMember: vi.fn(),
}))
vi.mock('./api/whiteboardApi', () => api)

describe('WhiteboardShareDialog', () => {
  beforeEach(() => { vi.clearAllMocks(); api.listWhiteboardMembers.mockResolvedValue([{ id: 'm1', fullName: 'Editor User', email: 'editor@example.com', role: 'editor' }]); api.listWhiteboardBoardInvitations.mockResolvedValue([{ id: 'i1', email: 'pending@example.com', role: 'viewer', status: 'pending', expiresAt: '2026-08-10T00:00:00.000Z' }]); api.listWhiteboardInviteCandidates.mockResolvedValue([]); api.createWhiteboardInvitation.mockResolvedValue({}) })

  it('lists members and pending invitations for an owner', async () => {
    render(<WhiteboardShareDialog open boardId="board-1" accessRole="owner" token="token" onClose={vi.fn()} />)
    expect(await screen.findByText(/Editor User/)).toBeInTheDocument()
    expect(await screen.findByText(/pending@example.com/)).toBeInTheDocument()
  })

  it('invites with the selected role and prevents duplicate submits', async () => {
    render(<WhiteboardShareDialog open boardId="board-1" accessRole="owner" token="token" onClose={vi.fn()} />)
    api.listWhiteboardInviteCandidates.mockResolvedValue([{ userId: 'u1', fullName: 'New User', username: 'newuser', avatarUrl: null }])
    fireEvent.change(screen.getByLabelText('Search friends'), { target: { value: 'new' } })
    await waitFor(() => expect(screen.getByText('@newuser')).toBeInTheDocument())
    fireEvent.click(screen.getByText('@newuser'))
    fireEvent.click(screen.getByRole('button', { name: 'viewer' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    fireEvent.click(screen.getByRole('button', { name: 'Inviting…' }))
    await waitFor(() => expect(api.createWhiteboardInvitation).toHaveBeenCalledOnce())
    expect(api.createWhiteboardInvitation).toHaveBeenCalledWith('token', 'board-1', { inviteeUserId: 'u1', role: 'viewer' })
  })

  it('shows a read-only member list for editors and viewers', async () => {
    const { rerender } = render(<WhiteboardShareDialog open boardId="board-1" accessRole="editor" token="token" onClose={vi.fn()} />)
    expect(await screen.findByText(/Editor User/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Change role' })).not.toBeInTheDocument()
    rerender(<WhiteboardShareDialog open boardId="board-1" accessRole="viewer" token="token" onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
  })
})
