import { z } from 'zod'
import { API_BASE_URL, apiRequest, getAuthHeaders } from '../../../lib/api'

export const WHITEBOARD_API_PATH = '/whiteboard'
export const WHITEBOARDS_API_PATH = '/whiteboards'

const cameraSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  zoom: z.number().finite().min(0.05).max(8),
})

const whiteboardSchema = z.object({
  id: z.string(),
  name: z.string(),
  snapshot: z.unknown().nullable(),
  assetReferences: z.record(z.string(), z.object({ tldrawAssetId: z.string().min(1), beeplanAssetId: z.string().min(1), stableResolverUrl: z.string().url() })).default({}),
  camera: cameraSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  previewUrl: z.string().nullable().default(null),
  isPinned: z.boolean().default(false),
  isArchived: z.boolean().default(false),
  lastOpenedAt: z.string().nullable().default(null),
  accessRole: z.enum(['owner', 'editor', 'viewer']).default('owner'),
  isShared: z.boolean().default(false),
  memberCount: z.number().optional(),
})

export type WhiteboardCamera = z.infer<typeof cameraSchema>
export type Whiteboard = z.infer<typeof whiteboardSchema>
export type WhiteboardAssetReferences = Whiteboard['assetReferences']
export type WhiteboardAssetReference = WhiteboardAssetReferences[string]
export type WhiteboardUpdate = {
  name?: string
  snapshot?: unknown
  assetReferences?: WhiteboardAssetReferences
  camera?: WhiteboardCamera
}

export type WhiteboardSummary = Pick<Whiteboard, 'id' | 'name' | 'previewUrl' | 'isPinned' | 'isArchived' | 'lastOpenedAt' | 'createdAt' | 'updatedAt' | 'accessRole' | 'isShared' | 'memberCount'>
export type WhiteboardAccessRole = Whiteboard['accessRole']
export type WhiteboardTaskCard = {
  taskId: string
  title: string
  priority: string
  status: string
  dueDate: string | null
  progress: { completed: number; total: number; percentage: number }
}
export type WhiteboardAccessMetadata = { boardId: string; accessRole: WhiteboardAccessRole; updatedAt: string }
export type WhiteboardInvitation = { id: string; boardId: string; boardName?: string; role: 'editor' | 'viewer'; status: string; expiresAt: string; createdAt: string; inviterUsername?: string; inviterDisplayName?: string; inviterAvatarUrl?: string | null }

const assetSchema = z.object({
  id: z.string(),
  type: z.enum(['image', 'file']),
  fileName: z.string(),
  url: z.string(),
  mimeType: z.string(),
  size: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  createdAt: z.string(),
})

export type WhiteboardAsset = z.infer<typeof assetSchema>

export async function getWhiteboard(accessToken: string, signal?: AbortSignal, boardId?: string): Promise<Whiteboard> {
  const response = await apiRequest(boardId ? `${WHITEBOARDS_API_PATH}/${boardId}` : WHITEBOARD_API_PATH, { signal, headers: getAuthHeaders(accessToken) })
  if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] GET /whiteboard response', response)
  return whiteboardSchema.parse(response)
}
export async function getWhiteboardAccess(accessToken: string, boardId: string, signal?: AbortSignal): Promise<WhiteboardAccessMetadata> {
  return z.object({ boardId: z.string(), accessRole: z.enum(['owner', 'editor', 'viewer']), updatedAt: z.string() }).parse(await apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/access`, { signal, headers: getAuthHeaders(accessToken) }))
}

export async function updateWhiteboard(
  accessToken: string,
  payload: WhiteboardUpdate,
  signal?: AbortSignal,
  boardId?: string,
): Promise<Whiteboard> {
  const response = await apiRequest(boardId ? `${WHITEBOARDS_API_PATH}/${boardId}` : WHITEBOARD_API_PATH, {
    method: 'PATCH',
    signal,
    headers: getAuthHeaders(accessToken),
    body: JSON.stringify(payload),
  })
  if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] PATCH /whiteboard response', response)
  return whiteboardSchema.parse(response)
}

const summarySchema = whiteboardSchema.pick({ id: true, name: true, previewUrl: true, isPinned: true, isArchived: true, lastOpenedAt: true, createdAt: true, updatedAt: true, accessRole: true, isShared: true, memberCount: true })
const summariesSchema = z.array(summarySchema)

export async function listWhiteboards(accessToken: string, options: { archived?: boolean; search?: string; sort?: string } = {}) {
  const params = new URLSearchParams()
  if (options.archived !== undefined) params.set('archived', String(options.archived))
  if (options.search) params.set('search', options.search)
  if (options.sort) params.set('sort', options.sort)
  return summariesSchema.parse(await apiRequest(`${WHITEBOARDS_API_PATH}?${params}`, { headers: getAuthHeaders(accessToken) }))
}

export async function listWhiteboardInvitations(accessToken: string) { return z.array(z.object({ id: z.string(), boardId: z.string(), boardName: z.string().optional(), role: z.enum(['editor', 'viewer']), status: z.string(), expiresAt: z.string(), createdAt: z.string(), inviterUsername: z.string().optional(), inviterDisplayName: z.string().optional(), inviterAvatarUrl: z.string().nullable().optional() })).parse(await apiRequest('/whiteboard-invitations', { headers: getAuthHeaders(accessToken) })) }
export async function acceptWhiteboardInvitation(accessToken: string, token: string) { return apiRequest(`/whiteboard-invitations/${encodeURIComponent(token)}/accept`, { method: 'POST', headers: getAuthHeaders(accessToken) }) }
export async function declineWhiteboardInvitation(accessToken: string, token: string) { return apiRequest(`/whiteboard-invitations/${encodeURIComponent(token)}/decline`, { method: 'POST', headers: getAuthHeaders(accessToken) }) }
export async function listWhiteboardMembers(accessToken: string, boardId: string) { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/members`, { headers: getAuthHeaders(accessToken) }) }
export async function listWhiteboardInviteCandidates(accessToken: string, boardId: string, query = '') { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/invite-candidates?q=${encodeURIComponent(query)}`, { headers: getAuthHeaders(accessToken) }) }
export async function listWhiteboardBoardInvitations(accessToken: string, boardId: string) { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/invitations`, { headers: getAuthHeaders(accessToken) }) }
export async function createWhiteboardInvitation(accessToken: string, boardId: string, payload: { inviteeUserId: string; role: 'editor' | 'viewer' }) { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/invitations`, { method: 'POST', headers: getAuthHeaders(accessToken), body: JSON.stringify(payload) }) }
export async function updateWhiteboardMember(accessToken: string, boardId: string, memberId: string, role: 'editor' | 'viewer') { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/members/${memberId}`, { method: 'PATCH', headers: getAuthHeaders(accessToken), body: JSON.stringify({ role }) }) }
export async function removeWhiteboardMember(accessToken: string, boardId: string, memberId: string) { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/members/${memberId}`, { method: 'DELETE', headers: getAuthHeaders(accessToken) }) }
export async function revokeWhiteboardInvitation(accessToken: string, boardId: string, invitationId: string) { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/invitations/${invitationId}`, { method: 'DELETE', headers: getAuthHeaders(accessToken) }) }
export async function leaveWhiteboard(accessToken: string, boardId: string) { return apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/leave`, { method: 'POST', headers: getAuthHeaders(accessToken) }) }

export async function createWhiteboard(accessToken: string, name?: string) {
  return whiteboardSchema.parse(await apiRequest(WHITEBOARDS_API_PATH, { method: 'POST', headers: getAuthHeaders(accessToken), body: JSON.stringify(name ? { name } : {}) }))
}

async function boardAction(accessToken: string, boardId: string, action: string) {
  return summarySchema.parse(await apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/${action}`, { method: 'POST', headers: getAuthHeaders(accessToken) }))
}
export const pinWhiteboard = (token: string, id: string) => boardAction(token, id, 'pin')
export const unpinWhiteboard = (token: string, id: string) => boardAction(token, id, 'unpin')
export const archiveWhiteboard = (token: string, id: string) => boardAction(token, id, 'archive')
export const restoreWhiteboard = (token: string, id: string) => boardAction(token, id, 'restore')
export async function deleteWhiteboard(accessToken: string, boardId: string) { await apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}`, { method: 'DELETE', headers: getAuthHeaders(accessToken) }) }
export async function duplicateWhiteboard(accessToken: string, boardId: string) { return whiteboardSchema.parse(await apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/duplicate`, { method: 'POST', headers: getAuthHeaders(accessToken) })) }
export async function openWhiteboard(accessToken: string, boardId: string) { return whiteboardSchema.parse(await apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/open`, { method: 'POST', headers: getAuthHeaders(accessToken) })) }
export async function getWhiteboardTaskCard(accessToken: string, boardId: string, taskId: string): Promise<WhiteboardTaskCard> {
  return z.object({ taskId: z.string(), title: z.string(), priority: z.string(), status: z.string(), dueDate: z.string().nullable(), progress: z.object({ completed: z.number(), total: z.number(), percentage: z.number() }) }).parse(await apiRequest(`${WHITEBOARDS_API_PATH}/${boardId}/task-cards/${taskId}`, { headers: getAuthHeaders(accessToken) }))
}

export async function uploadWhiteboardAsset(accessToken: string, file: File, signal?: AbortSignal): Promise<WhiteboardAsset> {
  const body = new FormData()
  body.append('file', file)
  const response = await apiRequest(`${WHITEBOARD_API_PATH}/assets`, {
    method: 'POST', signal, headers: getAuthHeaders(accessToken), body,
  })
  if (import.meta.env.DEV) console.debug('[WhiteboardImageTrace] raw upload response JSON', response)
  return assetSchema.parse(response)
}

export async function getWhiteboardAsset(accessToken: string, assetId: string, signal?: AbortSignal): Promise<WhiteboardAsset> {
  return assetSchema.parse(await apiRequest(`${WHITEBOARD_API_PATH}/assets/${assetId}`, { signal, headers: getAuthHeaders(accessToken) }))
}

export async function downloadWhiteboardAsset(accessToken: string, asset: Pick<WhiteboardAsset, 'url' | 'mimeType'>, signal?: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}${asset.url}`, { signal, headers: getAuthHeaders(accessToken) })
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  if (import.meta.env.DEV) console.debug('[Whiteboard asset] fetch', { url: `${API_BASE_URL}${asset.url}`, status: response.status, contentType })
  if (!response.ok) throw new Error(`Unable to load this whiteboard asset (HTTP ${response.status}).`)
  const blob = await response.blob()
  if (asset.mimeType.startsWith('image/') && (!contentType.startsWith('image/') || blob.size === 0)) {
    throw new Error('The whiteboard image response was not valid image data.')
  }
  if (blob.size === 0) throw new Error('The whiteboard asset is empty.')
  return blob
}
