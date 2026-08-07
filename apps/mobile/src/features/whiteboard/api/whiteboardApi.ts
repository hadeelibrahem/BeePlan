import { z } from 'zod'
import { apiFetch, API_BASE_URL, readJsonOrThrow } from '../../../lib/apiClient'
import { getAuthHeaders } from '../../../lib/api'

const boardSummarySchema = z.object({
  id: z.string(), name: z.string(), previewUrl: z.string().nullable().optional(),
  isPinned: z.boolean().default(false), isArchived: z.boolean().default(false),
  lastOpenedAt: z.string().nullable().optional(), createdAt: z.string(), updatedAt: z.string(),
  accessRole: z.enum(['owner', 'editor', 'viewer']).default('owner'), isShared: z.boolean().default(false),
  memberCount: z.number().optional(),
})
export type WhiteboardSummary = z.infer<typeof boardSummarySchema>
export type WhiteboardRole = WhiteboardSummary['accessRole']
export type WhiteboardInvitation = { id: string; boardId: string; boardName?: string; role: 'editor' | 'viewer'; status: string; expiresAt: string; createdAt: string; inviterUsername?: string; inviterDisplayName?: string; inviterAvatarUrl?: string | null }

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...init, headers: { ...getAuthHeaders(token), ...init?.headers } })
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`)
}

export async function listWhiteboards(token: string, search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}&sort=lastOpenedAt` : '?sort=lastOpenedAt'
  return z.array(boardSummarySchema).parse(await request(`/whiteboards${query}`, token))
}
export async function createWhiteboard(token: string, name?: string) {
  return boardSummarySchema.parse(await request('/whiteboards', token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: name ? JSON.stringify({ name }) : undefined }))
}
export async function deleteWhiteboard(token: string, boardId: string) { await request(`/whiteboards/${boardId}`, token, { method: 'DELETE' }) }
export async function duplicateWhiteboard(token: string, boardId: string) { return boardSummarySchema.parse(await request(`/whiteboards/${boardId}/duplicate`, token, { method: 'POST' })) }
export async function leaveWhiteboard(token: string, boardId: string) { await request(`/whiteboards/${boardId}/leave`, token, { method: 'POST' }) }
export async function archiveWhiteboard(token: string, boardId: string) { return boardSummarySchema.parse(await request(`/whiteboards/${boardId}/archive`, token, { method: 'POST' })) }
export async function pinWhiteboard(token: string, boardId: string) { return boardSummarySchema.parse(await request(`/whiteboards/${boardId}/pin`, token, { method: 'POST' })) }
export async function listWhiteboardInvitations(token: string) { return z.array(z.object({ id: z.string(), boardId: z.string(), boardName: z.string().optional(), role: z.enum(['editor', 'viewer']), status: z.string(), expiresAt: z.string(), createdAt: z.string(), inviterUsername: z.string().optional(), inviterDisplayName: z.string().optional(), inviterAvatarUrl: z.string().nullable().optional() })).parse(await request('/whiteboard-invitations', token)) }
export async function acceptWhiteboardInvitation(token: string, invitationId: string) { return request(`/whiteboard-invitations/${encodeURIComponent(invitationId)}/accept`, token, { method: 'POST' }) }
export async function declineWhiteboardInvitation(token: string, invitationId: string) { return request(`/whiteboard-invitations/${encodeURIComponent(invitationId)}/decline`, token, { method: 'POST' }) }
export async function listMembers(token: string, boardId: string) { return request<Array<{ id: string; role: WhiteboardRole; username?: string; fullName?: string; avatarUrl?: string | null }>>(`/whiteboards/${boardId}/members`, token) }
export async function inviteFriend(token: string, boardId: string, inviteeUserId: string, role: 'editor' | 'viewer') { return request(`/whiteboards/${boardId}/invitations`, token, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteeUserId, role }) }) }
export async function findInviteCandidates(token: string, boardId: string, query: string) { return request<Array<{ id: string; username: string; fullName: string; avatarUrl?: string | null }>>(`/whiteboards/${boardId}/invite-candidates?q=${encodeURIComponent(query)}`, token) }
