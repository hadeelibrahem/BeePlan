import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import {
  createCommitment,
  createSavedPlace,
  deleteCommitment,
  deleteSavedPlace,
  getCommitments,
  getSavedPlaces,
  updateCommitment,
  updateSavedPlace,
} from './api/context.api'
import type {
  RecurringCommitmentInput,
  SavedPlaceInput,
} from './types'

// --- Saved places ----------------------------------------------------------

export function useSavedPlaces(accessToken: string | undefined) {
  return useQuery({
    queryKey: queryKeys.context.places,
    queryFn: () => getSavedPlaces(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })
}

export function useSavedPlaceMutations(accessToken: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.context.places })
    // Commitments embed a place name; refresh them too when places change.
    void queryClient.invalidateQueries({ queryKey: queryKeys.context.commitments })
  }

  const create = useMutation({
    mutationFn: (input: SavedPlaceInput) => createSavedPlace(input, accessToken ?? ''),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SavedPlaceInput> }) =>
      updateSavedPlace(id, input, accessToken ?? ''),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteSavedPlace(id, accessToken ?? ''),
    onSuccess: invalidate,
  })

  return { create, update, remove }
}

// --- Recurring commitments -------------------------------------------------

export function useCommitments(accessToken: string | undefined) {
  return useQuery({
    queryKey: queryKeys.context.commitments,
    queryFn: () => getCommitments(accessToken ?? ''),
    enabled: Boolean(accessToken),
  })
}

export function useCommitmentMutations(accessToken: string | undefined) {
  const queryClient = useQueryClient()
  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.context.commitments })

  const create = useMutation({
    mutationFn: (input: RecurringCommitmentInput) => createCommitment(input, accessToken ?? ''),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<RecurringCommitmentInput> }) =>
      updateCommitment(id, input, accessToken ?? ''),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteCommitment(id, accessToken ?? ''),
    onSuccess: invalidate,
  })

  return { create, update, remove }
}
