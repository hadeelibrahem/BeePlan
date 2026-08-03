import { useState } from 'react'
import { BriefcaseBusiness, Dumbbell, GraduationCap, Home, MapPin, MoreHorizontal } from 'lucide-react'
import { SectionCard } from '../../../components/layout'
import { ConfirmDestructiveModal } from '../../../components/ConfirmDestructiveModal'
import { useSavedPlaceMutations, useSavedPlaces } from '../hooks'
import type { SavedPlace, SavedPlaceInput } from '../types'
import { SavedPlaceEditorModal } from './SavedPlaceEditorModal'

type Props = { accessToken: string | undefined }

function PlaceIcon({ place }: { place: SavedPlace }) {
  const value = `${place.category ?? ''} ${place.name}`.toLowerCase()
  const Icon = value.includes('home') || value.includes('house') ? Home : value.includes('university') || value.includes('school') || value.includes('class') ? GraduationCap : value.includes('work') || value.includes('office') ? BriefcaseBusiness : value.includes('gym') || value.includes('fitness') ? Dumbbell : MapPin
  return <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--bp-accent-soft)] text-[var(--bp-accent-ink)]"><Icon size={17} aria-hidden="true" /></span>
}

export function SavedPlacesSection({ accessToken }: Props) {
  const { data: places = [], isLoading } = useSavedPlaces(accessToken)
  const { create, update, remove } = useSavedPlaceMutations(accessToken)
  const [editorOpen, setEditorOpen] = useState(false); const [editing, setEditing] = useState<SavedPlace | null>(null); const [toDelete, setToDelete] = useState<SavedPlace | null>(null); const [openMenu, setOpenMenu] = useState<string | null>(null)
  const openCreate = () => { setEditing(null); setEditorOpen(true) }; const openEdit = (place: SavedPlace) => { setEditing(place); setOpenMenu(null); setEditorOpen(true) }
  const handleSubmit = (input: SavedPlaceInput) => { const mutation = editing ? update.mutateAsync({ id: editing.id, input }) : create.mutateAsync(input); void mutation.then(() => setEditorOpen(false)) }
  return <SectionCard>
    <div className="flex items-center justify-between gap-4"><div><h3 className="text-sm font-black">Saved Places</h3><p className="mt-1 text-xs text-[var(--bp-muted)]">Places BeePlan should recognize by name.</p></div><button type="button" onClick={openCreate} className="rounded-lg border border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] px-3 py-1.5 text-xs font-black text-[var(--bp-accent-ink)] hover:opacity-90">+ Add place</button></div>
    {isLoading ? <p className="py-4 text-sm text-[var(--bp-muted)]">Loading…</p> : places.length === 0 ? <div className="py-5"><p className="text-sm font-bold">No saved places yet.</p><p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--bp-muted)]">Save places such as Home, University, or Work so BeePlan can understand travel and location-based planning.</p></div> : <ul className="mt-3 max-h-80 divide-y divide-[var(--bp-border)] overflow-y-auto">{places.map((place) => <li key={place.id} className="flex items-center gap-3 py-3"><PlaceIcon place={place} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-black">{place.name}</p><p className="truncate text-xs text-[var(--bp-muted)]">{place.address || 'Location saved'}{place.aliases.length ? ` · ${place.aliases.length} alias${place.aliases.length === 1 ? '' : 'es'}` : ''}</p></div><div className="relative"><button type="button" aria-label={`More options for ${place.name}`} onClick={() => setOpenMenu(openMenu === place.id ? null : place.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--bp-muted)] hover:bg-[var(--bp-bg)] hover:text-[var(--bp-text)]"><MoreHorizontal size={18} /></button>{openMenu === place.id ? <div className="absolute right-0 top-10 z-10 w-32 rounded-xl border border-[var(--bp-border)] bg-[var(--bp-surface-elevated)] p-1 shadow-xl"><button type="button" onClick={() => openEdit(place)} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold hover:bg-[var(--bp-bg)]">Edit</button><button type="button" onClick={() => { setToDelete(place); setOpenMenu(null) }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-red-400 hover:bg-red-500/10">Delete</button></div> : null}</div></li>)}</ul>}
    <SavedPlaceEditorModal open={editorOpen} initial={editing} saving={create.isPending || update.isPending} onClose={() => setEditorOpen(false)} onSubmit={handleSubmit} />
    <ConfirmDestructiveModal open={Boolean(toDelete)} title="Delete saved place?" message={toDelete ? `"${toDelete.name}" and its aliases will be removed. Commitments linked to it stay but lose the place.` : ''} confirmLabel="Delete" onCancel={() => setToDelete(null)} onConfirm={() => { if (toDelete) void remove.mutateAsync(toDelete.id).finally(() => setToDelete(null)) }} />
  </SectionCard>
}
