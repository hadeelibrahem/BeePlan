import { useState } from 'react'
import { SectionCard } from '../../../components/layout'
import { ConfirmDestructiveModal } from '../../../components/ConfirmDestructiveModal'
import { useSavedPlaceMutations, useSavedPlaces } from '../hooks'
import type { SavedPlace, SavedPlaceInput } from '../types'
import { SavedPlaceEditorModal } from './SavedPlaceEditorModal'

type Props = { accessToken: string | undefined }

/**
 * "Saved Places" section of the Personal Context settings. Compact row design:
 *   [icon] [name]            [address]   ✎ 🗑
 */
export function SavedPlacesSection({ accessToken }: Props) {
  const { data: places = [], isLoading } = useSavedPlaces(accessToken)
  const { create, update, remove } = useSavedPlaceMutations(accessToken)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<SavedPlace | null>(null)
  const [toDelete, setToDelete] = useState<SavedPlace | null>(null)

  const openCreate = () => {
    setEditing(null)
    setEditorOpen(true)
  }
  const openEdit = (place: SavedPlace) => {
    setEditing(place)
    setEditorOpen(true)
  }

  const handleSubmit = (input: SavedPlaceInput) => {
    const mutation = editing
      ? update.mutateAsync({ id: editing.id, input })
      : create.mutateAsync(input)
    void mutation.then(() => setEditorOpen(false))
  }

  return (
    <SectionCard>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-[var(--bp-text)]">Saved Places</h3>
          <p className="text-xs text-[var(--bp-muted)]">Permanent places the AI understands by name.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          aria-label="Add saved place"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--bp-accent)] text-lg font-black text-black hover:opacity-90"
        >
          +
        </button>
      </div>

      {isLoading ? (
        <p className="py-4 text-sm text-[var(--bp-muted)]">Loading…</p>
      ) : places.length === 0 ? (
        <p className="py-4 text-sm text-[var(--bp-muted)]">
          No saved places yet. Add Home, University, Work and more.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--bp-border)]">
          {places.map((place) => (
            <li key={place.id} className="flex items-center gap-3 py-2.5">
              <span className="text-xl" aria-hidden>
                {place.icon || '📍'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-[var(--bp-text)]">{place.name}</p>
                <p className="truncate text-xs text-[var(--bp-muted)]">
                  {place.address || `${place.latitude.toFixed(4)}, ${place.longitude.toFixed(4)}`}
                  {place.aliases.length ? ` · ${place.aliases.length} alias${place.aliases.length === 1 ? '' : 'es'}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openEdit(place)}
                aria-label={`Edit ${place.name}`}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--bp-muted)] hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => setToDelete(place)}
                aria-label={`Delete ${place.name}`}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/10"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {editorOpen ? (
        <SavedPlaceEditorModal
          open={editorOpen}
          initial={editing}
          saving={create.isPending || update.isPending}
          onClose={() => setEditorOpen(false)}
          onSubmit={handleSubmit}
        />
      ) : null}

      <ConfirmDestructiveModal
        open={Boolean(toDelete)}
        title="Delete saved place?"
        message={toDelete ? `"${toDelete.name}" and its aliases will be removed. Commitments linked to it stay but lose the place.` : ''}
        confirmLabel="Delete"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) void remove.mutateAsync(toDelete.id).finally(() => setToDelete(null))
        }}
      />
    </SectionCard>
  )
}
