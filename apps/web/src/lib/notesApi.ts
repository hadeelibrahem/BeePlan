const apiUrl = (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:3000').replace(/\/+$/, '')

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

function authHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const url = `${apiUrl}${path}`
  let response: Response

  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...authHeaders(accessToken),
        ...init?.headers,
      },
    })
  } catch (error) {
    console.error('[BeePlan Notes API] Network request failed', { url, error })
    throw new Error(`Unable to reach BeePlan API at ${apiUrl}.`)
  }

  if (response.status === 204) {
    return undefined as T
  }

  const data = await response.json().catch(() => null)

  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Notes request failed. Please try again.')
  }

  return data as T
}

export function getNotes(accessToken: string) {
  return request<ApiNote[]>(accessToken, '/notes')
}

export function createNote(accessToken: string, payload: NotePayload) {
  return request<ApiNote>(accessToken, '/notes', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateNote(accessToken: string, noteId: string, payload: Partial<NotePayload>) {
  return request<ApiNote>(accessToken, `/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteNote(accessToken: string, noteId: string) {
  return request<void>(accessToken, `/notes/${noteId}`, { method: 'DELETE' })
}
