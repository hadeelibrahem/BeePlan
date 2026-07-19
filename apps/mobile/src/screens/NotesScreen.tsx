import { useEffect, useMemo, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { AppScreen, EmptyState, InputField, LoadingState, PageHeader, PrimaryButton, SearchInput, SectionCard, SecondaryButton } from '../components/layout'
import { createNote, deleteNote, getNotes, updateNote, type ApiNote } from '../lib/notesApi'
import { useTheme } from '../theme/useTheme'
import { filterNotes, validateNoteTitle } from './notes'

export default function NotesScreen({ accessToken, onBack }: { accessToken: string; onBack: () => void }) {
  const { theme } = useTheme()
  const { colors } = theme
  const [notes, setNotes] = useState<ApiNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try { setNotes(await getNotes(accessToken)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load notes.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [accessToken])

  const visibleNotes = useMemo(() => filterNotes(notes, search), [notes, search])
  const beginEdit = (note: ApiNote) => { setEditingId(note.id); setEditTitle(note.title); setEditContent(note.content); setError('') }

  const create = async () => {
    const titleError = validateNoteTitle(draftTitle)
    if (titleError) { setError(titleError); return }
    setCreating(true)
    setError('')
    try {
      const note = await createNote(accessToken, { title: draftTitle.trim(), content: draftContent.trim() })
      setNotes((current) => [note, ...current])
      setDraftTitle('')
      setDraftContent('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create note.') }
    finally { setCreating(false) }
  }

  const save = async (noteId: string) => {
    const titleError = validateNoteTitle(editTitle)
    if (titleError) { setError(titleError); return }
    setSavingId(noteId)
    setError('')
    try {
      const updated = await updateNote(accessToken, noteId, { title: editTitle.trim(), content: editContent.trim() })
      setNotes((current) => current.map((note) => note.id === noteId ? updated : note))
      setEditingId(null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update note.') }
    finally { setSavingId(null) }
  }

  const remove = (note: ApiNote) => Alert.alert('Delete note?', `“${note.title}” cannot be recovered.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => void (async () => {
      setSavingId(note.id)
      setError('')
      try { await deleteNote(accessToken, note.id); setNotes((current) => current.filter((item) => item.id !== note.id)) }
      catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to delete note.') }
      finally { setSavingId(null) }
    })() },
  ])

  return <AppScreen>
    <PageHeader title="Notes" subtitle="Jot down ideas and quick thoughts" onBack={onBack} />
    <SectionCard className="mb-3">
      <Text className="mb-2 text-sm font-black" style={{ color: colors.text }}>New note</Text>
      <InputField label="Title" value={draftTitle} onChangeText={setDraftTitle} placeholder="Title" />
      <InputField label="Content" value={draftContent} onChangeText={setDraftContent} placeholder="Write something... Markdown text is preserved." multiline />
      <PrimaryButton onPress={() => void create()} disabled={!draftTitle.trim()} loading={creating} size="sm">Add note</PrimaryButton>
    </SectionCard>
    <SearchInput value={search} onChangeText={setSearch} placeholder="Search notes" />
    {error ? <View className="mb-3 rounded-xl p-3" style={{ backgroundColor: `${colors.error}18` }}><Text style={{ color: colors.error }}>{error}</Text><Pressable onPress={() => void load()} accessibilityRole="button" accessibilityLabel="Retry loading notes" className="mt-2"><Text className="font-bold" style={{ color: colors.accent }}>Retry</Text></Pressable></View> : null}
    {loading ? <LoadingState /> : visibleNotes.length === 0 ? <EmptyState icon="N" title={search ? 'No matching notes' : 'No notes yet'} description={search ? 'Try a different search term.' : 'Create your first note above.'} /> : visibleNotes.map((note) => <SectionCard key={note.id} className="mb-3">
      {editingId === note.id ? <View>
        <InputField label="Title" value={editTitle} onChangeText={setEditTitle} />
        <InputField label="Content" value={editContent} onChangeText={setEditContent} multiline />
        <View className="flex-row gap-2"><SecondaryButton size="sm" onPress={() => setEditingId(null)}>Cancel</SecondaryButton><PrimaryButton size="sm" onPress={() => void save(note.id)} loading={savingId === note.id} disabled={!editTitle.trim()}>Save</PrimaryButton></View>
      </View> : <View>
        <View className="mb-1 flex-row items-start justify-between gap-3"><Text className="flex-1 text-sm font-black" style={{ color: colors.text }}>{note.title}</Text><Text className="text-xs" style={{ color: colors.secondaryText }}>{new Date(note.updatedAt).toLocaleDateString()}</Text></View>
        {note.content ? <Text className="mb-3 text-sm" style={{ color: colors.secondaryText }}>{note.content}</Text> : null}
        <View className="flex-row gap-2"><SecondaryButton size="sm" onPress={() => beginEdit(note)}>Edit</SecondaryButton><SecondaryButton size="sm" disabled={savingId === note.id} onPress={() => remove(note)}>Delete</SecondaryButton></View>
      </View>}
    </SectionCard>)}
  </AppScreen>
}
