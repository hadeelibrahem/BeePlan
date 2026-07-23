import type {
  RecurringCommitment,
  RecurringCommitmentInput,
  SavedPlace,
  SavedPlaceInput,
} from '../types'

const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

async function apiRequest(path: string, accessToken: string, init?: RequestInit) {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  })

  if (response.status === 204) return null
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message
    throw new Error(message ?? 'Something went wrong. Please try again.')
  }
  return data
}

// --- Saved places ----------------------------------------------------------

export async function getSavedPlaces(accessToken: string): Promise<SavedPlace[]> {
  return (await apiRequest('/context/places', accessToken)) as SavedPlace[]
}

export async function createSavedPlace(input: SavedPlaceInput, accessToken: string): Promise<SavedPlace> {
  return (await apiRequest('/context/places', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as SavedPlace
}

export async function updateSavedPlace(
  id: string,
  input: Partial<SavedPlaceInput>,
  accessToken: string,
): Promise<SavedPlace> {
  return (await apiRequest(`/context/places/${id}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as SavedPlace
}

export async function deleteSavedPlace(id: string, accessToken: string): Promise<void> {
  await apiRequest(`/context/places/${id}`, accessToken, { method: 'DELETE' })
}

// --- Recurring commitments -------------------------------------------------

export async function getCommitments(accessToken: string): Promise<RecurringCommitment[]> {
  return (await apiRequest('/context/commitments', accessToken)) as RecurringCommitment[]
}

export async function createCommitment(
  input: RecurringCommitmentInput,
  accessToken: string,
): Promise<RecurringCommitment> {
  return (await apiRequest('/context/commitments', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  })) as RecurringCommitment
}

export async function updateCommitment(
  id: string,
  input: Partial<RecurringCommitmentInput>,
  accessToken: string,
): Promise<RecurringCommitment> {
  return (await apiRequest(`/context/commitments/${id}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })) as RecurringCommitment
}

export async function deleteCommitment(id: string, accessToken: string): Promise<void> {
  await apiRequest(`/context/commitments/${id}`, accessToken, { method: 'DELETE' })
}
