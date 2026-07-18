import assert from 'node:assert/strict'
import test from 'node:test'
import { filterNotes, validateNoteTitle } from './notes.ts'

const notes = [
  { id: 'one', title: 'Project brief', content: '## Goals\nShip mobile notes', createdAt: '', updatedAt: '' },
  { id: 'two', title: 'Shopping', content: 'Milk and coffee', createdAt: '', updatedAt: '' },
]

test('validates a required note title', () => {
  assert.equal(validateNoteTitle('  '), 'A note title is required.')
  assert.equal(validateNoteTitle('Idea'), '')
})

test('searches note titles and markdown content case-insensitively', () => {
  assert.deepEqual(filterNotes(notes, 'project').map((note) => note.id), ['one'])
  assert.deepEqual(filterNotes(notes, 'MOBILE').map((note) => note.id), ['one'])
  assert.deepEqual(filterNotes(notes, 'coffee').map((note) => note.id), ['two'])
})
