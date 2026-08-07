import { describe, expect, it } from 'vitest'
import { getSnapshotApplyDecision } from './whiteboardSnapshotRestorePolicy'

const base = {
  boardId: 'board-1',
  editorInstanceId: 'editor-1',
  lastAppliedBoardId: 'board-1',
  lastAppliedEditorInstanceId: 'editor-1',
  hasRestoredInitialSnapshot: true,
  reloadKey: 0,
  lastAppliedReloadKey: 0,
  isTextEditing: false,
}

describe('WhiteboardCanvas snapshot restoration policy', () => {
  it('allows initial load once', () => {
    expect(getSnapshotApplyDecision({ ...base, lastAppliedBoardId: null, lastAppliedEditorInstanceId: null, hasRestoredInitialSnapshot: false })).toEqual({ allowed: true, reason: 'initial_load' })
  })

  it('allows board switches and explicit reloads', () => {
    expect(getSnapshotApplyDecision({ ...base, boardId: 'board-2' })).toEqual({ allowed: true, reason: 'board_id_changed' })
    expect(getSnapshotApplyDecision({ ...base, reloadKey: 1 })).toEqual({ allowed: true, reason: 'explicit_reload' })
  })

  it('blocks active text editing and unchanged background/refetch updates', () => {
    expect(getSnapshotApplyDecision({ ...base, isTextEditing: true })).toEqual({ allowed: false, reason: 'unknown' })
    expect(getSnapshotApplyDecision(base)).toEqual({ allowed: false, reason: 'unknown' })
  })

  it('restores once for a newly mounted editor instance', () => {
    expect(getSnapshotApplyDecision({ ...base, editorInstanceId: 'editor-2' })).toEqual({ allowed: true, reason: 'initial_load' })
  })
})
