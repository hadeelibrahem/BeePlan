import { apiFetch, readJsonOrThrow } from '../../../lib/apiClient';
import type {
  RecurringCommitment,
  RecurringCommitmentInput,
  SavedPlace,
  SavedPlaceInput,
} from '../types';

async function apiRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await apiFetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  return readJsonOrThrow<T>(response, path);
}

// --- Saved places ----------------------------------------------------------

export function getSavedPlaces(accessToken: string): Promise<SavedPlace[]> {
  return apiRequest<SavedPlace[]>('/context/places', accessToken);
}

export function createSavedPlace(
  input: SavedPlaceInput,
  accessToken: string,
): Promise<SavedPlace> {
  return apiRequest<SavedPlace>('/context/places', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateSavedPlace(
  id: string,
  input: Partial<SavedPlaceInput>,
  accessToken: string,
): Promise<SavedPlace> {
  return apiRequest<SavedPlace>(`/context/places/${id}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteSavedPlace(id: string, accessToken: string): Promise<void> {
  return apiRequest<void>(`/context/places/${id}`, accessToken, { method: 'DELETE' });
}

// --- Recurring commitments -------------------------------------------------

export function getCommitments(accessToken: string): Promise<RecurringCommitment[]> {
  return apiRequest<RecurringCommitment[]>('/context/commitments', accessToken);
}

export function createCommitment(
  input: RecurringCommitmentInput,
  accessToken: string,
): Promise<RecurringCommitment> {
  return apiRequest<RecurringCommitment>('/context/commitments', accessToken, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function updateCommitment(
  id: string,
  input: Partial<RecurringCommitmentInput>,
  accessToken: string,
): Promise<RecurringCommitment> {
  return apiRequest<RecurringCommitment>(`/context/commitments/${id}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export function deleteCommitment(id: string, accessToken: string): Promise<void> {
  return apiRequest<void>(`/context/commitments/${id}`, accessToken, { method: 'DELETE' });
}
