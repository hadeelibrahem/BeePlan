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
import { createNote, deleteNote, getDailyMotivation, getNotes, updateNote, type ApiNote, type DailyMotivation } from '../lib/notesApi'
import { ConfirmDestructiveModal } from '../components/ConfirmDestructiveModal'

type NotesScreenProps = SidebarNavHandlers & {
  accessToken?: string
  onSignOut?: () => void
}

export default function NotesScreen({ accessToken, onSignOut, ...nav }: NotesScreenProps) {
  const { t, toggleLanguage, language } = useLanguage()
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
  const [motivation, setMotivation] = useState<DailyMotivation | null>(null)
  const [motivationLoading, setMotivationLoading] = useState(false)
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

  useEffect(() => {
    if (!accessToken) return
    let active = true
    setMotivationLoading(true)
    getDailyMotivation(accessToken, language)
      .then((result) => active && setMotivation(result))
      // The API has a deterministic fallback; network failures should never block notes.
      .catch(() => active && setMotivation(null))
      .finally(() => active && setMotivationLoading(false))
    return () => { active = false }
  }, [accessToken, language])

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
          <TopActionBar pageOnly
            themeMode={mode}
            onToggleTheme={toggleTheme}
            languageLabel={t('common.languageToggle')}
            onToggleLanguage={toggleLanguage}
            onOpenNotifications={nav.onNavigateNotifications}
            onSignOut={onSignOut}
          />
        }
      />

      <SectionCard className="mb-4 border-[var(--bp-accent)]/30 bg-[linear-gradient(135deg,var(--bp-surface),color-mix(in_srgb,var(--bp-accent)_9%,var(--bp-surface)))]">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bp-accent)]/15 text-lg text-[var(--bp-accent-ink)]">✦</span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--bp-text)]">{t('notesMotivation.label')}</h2>
            {motivationLoading ? <div aria-label={t('notesMotivation.loading')} className="mt-2 h-4 w-11/12 animate-pulse rounded bg-[var(--bp-border)]" /> : motivation ? <p className="mt-1 text-sm leading-6 text-[var(--bp-text)]">{motivation.message}</p> : null}
            <p className="mt-2 text-xs text-[var(--bp-muted)]">{t('notesMotivation.basedOnActivity')}</p>
          </div>
        </div>
      </SectionCard>

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
        <p className="text-sm text-[var(--bp-muted)]">Loading notes...</p>
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
                    <span className="shrink-0 text-xs text-[var(--bp-muted)]">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  {note.content && <p className="mb-2 whitespace-pre-wrap text-sm text-[var(--bp-muted)]">{note.content}</p>}
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
