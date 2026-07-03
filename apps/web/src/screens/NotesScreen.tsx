import { useEffect, useState } from 'react'
import {
  AppLayout,
  EmptyState,
  NotesIcon,
  PageHeader,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { createNote, deleteNote, getNotes, updateNote, type ApiNote } from '../lib/notesApi'

type NotesScreenProps = SidebarNavHandlers & {
  accessToken?: string
  onSignOut?: () => void
}

export default function NotesScreen({ accessToken, onSignOut, ...nav }: NotesScreenProps) {
  const { t, toggleLanguage } = useLanguage()
  const { mode, toggleTheme } = useTheme()

  const [notes, setNotes] = useState<ApiNote[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  useEffect(() => {
    if (!accessToken) return
    setLoading(true)
    setError('')
    getNotes(accessToken)
      .then(setNotes)
      .catch((err) => setError(err instanceof Error ? err.message : 'Unable to load notes.'))
      .finally(() => setLoading(false))
  }, [accessToken])

  async function handleCreate() {
    if (!accessToken || !draftTitle.trim()) return
    setCreating(true)
    setError('')
    try {
      const note = await createNote(accessToken, { title: draftTitle.trim(), content: draftContent.trim() })
      setNotes((current) => [note, ...current])
      setDraftTitle('')
      setDraftContent('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create note.')
    } finally {
      setCreating(false)
    }
  }

  function startEdit(note: ApiNote) {
    setEditingId(note.id)
    setEditTitle(note.title)
    setEditContent(note.content)
  }

  async function handleSaveEdit(noteId: string) {
    if (!accessToken || !editTitle.trim()) return
    try {
      const updated = await updateNote(accessToken, noteId, { title: editTitle.trim(), content: editContent.trim() })
      setNotes((current) => current.map((note) => (note.id === noteId ? updated : note)))
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update note.')
    }
  }

  async function handleDelete(noteId: string) {
    if (!accessToken) return
    try {
      await deleteNote(accessToken, noteId)
      setNotes((current) => current.filter((note) => note.id !== noteId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete note.')
    }
  }

  return (
    <AppLayout active="notes" {...nav} panelTitle="Keep going!" panelCaption="You're doing great today." panelPercent={64}>
      <PageHeader
        title="Notes"
        subtitle="Jot down ideas and quick thoughts"
        toolbar={
          <TopActionBar
            searchValue=""
            onSearchChange={() => {}}
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onProfileClick={onSignOut}
          />
        }
      />

      <SectionCard className="mb-6">
        <h2 className="mb-3 font-bold">New note</h2>
        <div className="space-y-3">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Title"
            className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-4 py-3 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
          />
          <textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            placeholder="Write something..."
            rows={3}
            className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-4 py-3 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
          />
          <div className="flex justify-end">
            <PrimaryButton onClick={handleCreate} disabled={!draftTitle.trim()} loading={creating}>
              Add note
            </PrimaryButton>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading notes...</p>
      ) : notes.length === 0 ? (
        <EmptyState icon={<NotesIcon className="h-6 w-6" />} title="No notes yet" description="Create your first note above to start jotting down ideas." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {notes.map((note) => (
            <SectionCard key={note.id}>
              {editingId === note.id ? (
                <div className="space-y-3">
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-4 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                  />
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-[var(--bp-border)] bg-[var(--bp-bg)] px-4 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                  />
                  <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={() => setEditingId(null)}>Cancel</SecondaryButton>
                    <PrimaryButton onClick={() => handleSaveEdit(note.id)} disabled={!editTitle.trim()}>
                      Save
                    </PrimaryButton>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="font-bold text-[var(--bp-text)]">{note.title}</h3>
                    <span className="shrink-0 text-xs text-slate-400">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {note.content && <p className="mb-3 whitespace-pre-wrap text-sm text-slate-400">{note.content}</p>}
                  <div className="flex justify-end gap-2">
                    <SecondaryButton onClick={() => startEdit(note)}>Edit</SecondaryButton>
                    <SecondaryButton onClick={() => handleDelete(note.id)} className="text-red-300">
                      Delete
                    </SecondaryButton>
                  </div>
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      )}
    </AppLayout>
  )
}
