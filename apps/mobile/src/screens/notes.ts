import type { ApiNote } from '../lib/notesApi'

export function validateNoteTitle(title: string) {
  return title.trim() ? '' : 'A note title is required.'
}

export function filterNotes(notes: ApiNote[], search: string) {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return notes
  return notes.filter((note) => `${note.title}\n${note.content}`.toLocaleLowerCase().includes(query))
}
