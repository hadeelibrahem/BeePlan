import { describe, expect, it } from 'vitest'
import { focusParentLabel, focusPrimaryTitle } from './focusDisplay'

describe('Focus display', () => {
  it('puts a selected subtask first and keeps its task as context', () => {
    const item = { taskTitle: 'AI Midterm Exam Preparation', subtaskId: 'sub-1', subtaskTitle: 'Practice Subject 1 problems' }
    expect(focusPrimaryTitle(item)).toBe('Practice Subject 1 problems')
    expect(focusParentLabel(item)).toBe('Part of: AI Midterm Exam Preparation')
  })

  it('keeps a parent recommendation unchanged', () => {
    const item = { taskTitle: 'AI Midterm Exam Preparation', subtaskId: null, subtaskTitle: null }
    expect(focusPrimaryTitle(item)).toBe('AI Midterm Exam Preparation')
    expect(focusParentLabel(item)).toBeNull()
  })
})
