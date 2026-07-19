import { API_BASE_URL, apiFetch, readJsonOrThrow } from './apiClient'

export type ApiNote = {
  id: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
}

export type NotePayload = {
  title: string
  content?: string
}

async function request<T>(accessToken: string, path: string, init?: RequestInit) {
  const response = await apiFetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...init?.headers },
  })
  if (response.status === 204) return undefined as T
  return readJsonOrThrow<T>(response, `${API_BASE_URL}${path}`)
}

export function getNotes(accessToken: string) {
  return request<ApiNote[]>(accessToken, '/notes')
}

export function createNote(accessToken: string, payload: NotePayload) {
  return request<ApiNote>(accessToken, '/notes', { method: 'POST', body: JSON.stringify(payload) })
}

export function updateNote(accessToken: string, noteId: string, payload: Partial<NotePayload>) {
  return request<ApiNote>(accessToken, `/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(payload) })
}

export function deleteNote(accessToken: string, noteId: string) {
  return request<void>(accessToken, `/notes/${noteId}`, { method: 'DELETE' })
}
