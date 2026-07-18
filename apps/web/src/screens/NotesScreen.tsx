import { useEffect, useRef, useState } from 'react'
import {
  AppLayout,
  EmptyState,
  NotesIcon,
  PageHeader,
  PrimaryButton,
  DangerButton,
  SecondaryButton,
  SectionCard,
  TopActionBar,
  type SidebarNavHandlers,
} from '../components/layout'
import { useLanguage } from '../i18n/LanguageContext'
import { useTheme } from '../theme/ThemeContext'
import { createNote, deleteNote, getNotes, updateNote, type ApiNote } from '../lib/notesApi'
import { ConfirmDestructiveModal } from '../components/ConfirmDestructiveModal'

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
  const [noteToDelete, setNoteToDelete] = useState<ApiNote | null>(null)
  const [isDeletingNote, setIsDeletingNote] = useState(false)
  const [notice, setNotice] = useState('')
  const deletingNoteRef = useRef(false)

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

  async function handleDelete() {
    if (!accessToken || !noteToDelete || deletingNoteRef.current) return
    deletingNoteRef.current = true
    setIsDeletingNote(true)
    setError('')
    try {
      await deleteNote(accessToken, noteToDelete.id)
      setNotes((current) => current.filter((note) => note.id !== noteToDelete.id))
      setNotice('Note deleted.')
      setNoteToDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete note.')
    } finally {
      setIsDeletingNote(false)
      deletingNoteRef.current = false
    }
  }

  return (
    <AppLayout active="notes" {...nav}>
      <PageHeader
        title={t('taskUi.notes.title')}
        subtitle={t('taskUi.notes.subtitle')}
        toolbar={
          <TopActionBar
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      <SectionCard className="mb-4">
        <h2 className="mb-2 text-sm font-bold">New note</h2>
        <div className="space-y-2">
          <input
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Title"
            className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
          />
          <textarea
            value={draftContent}
            onChange={(event) => setDraftContent(event.target.value)}
            placeholder="Write something..."
            rows={3}
            className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-2 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
          />
          <div className="flex justify-end">
            <PrimaryButton size="sm" onClick={handleCreate} disabled={!draftTitle.trim()} loading={creating}>
              Add note
            </PrimaryButton>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</div>
      )}
      {notice && <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">{notice}</div>}

      {loading ? (
        <p className="text-sm text-slate-400">Loading notes...</p>
      ) : notes.length === 0 ? (
        <EmptyState icon={<NotesIcon className="h-5 w-5" />} title={t('taskUi.notes.emptyTitle')} description={t('taskUi.notes.emptyDescription')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {notes.map((note) => (
            <SectionCard key={note.id}>
              {editingId === note.id ? (
                <div className="space-y-2">
                  <input
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                    className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-1.5 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                  />
                  <textarea
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-[var(--bp-border)] bg-[var(--bp-bg)] px-3 py-1.5 text-sm text-[var(--bp-text)] outline-none focus:border-[var(--bp-accent)]"
                  />
                  <div className="flex justify-end gap-2">
                    <SecondaryButton size="sm" onClick={() => setEditingId(null)}>Cancel</SecondaryButton>
                    <PrimaryButton size="sm" onClick={() => handleSaveEdit(note.id)} disabled={!editTitle.trim()}>
                      Save
                    </PrimaryButton>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-1.5 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-bold text-[var(--bp-text)]">{note.title}</h3>
                    <span className="shrink-0 text-xs text-slate-400">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {note.content && <p className="mb-2 whitespace-pre-wrap text-sm text-slate-400">{note.content}</p>}
                  <div className="flex justify-end gap-2">
                    <SecondaryButton size="sm" onClick={() => startEdit(note)}>Edit</SecondaryButton>
                    <DangerButton size="sm" onClick={() => setNoteToDelete(note)}>
                      Delete
                    </DangerButton>
                  </div>
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      )}
      <ConfirmDestructiveModal open={noteToDelete !== null} title="Delete note?" message={`"${noteToDelete?.title?.trim() || noteToDelete?.content?.trim().slice(0, 80) || 'This note'}" cannot be recovered after deletion.`} confirmLabel="Delete note" isConfirming={isDeletingNote} onCancel={() => !isDeletingNote && setNoteToDelete(null)} onConfirm={() => void handleDelete()} />
    </AppLayout>
  )
}
