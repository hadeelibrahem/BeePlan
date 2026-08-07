export type SnapshotApplyReason = 'initial_load' | 'board_id_changed' | 'explicit_reload' | 'background_refetch' | 'autosave_response' | 'updated_at_change' | 'permission_refresh' | 'unknown'

export function getSnapshotApplyDecision(input: { boardId: string; editorInstanceId: string; lastAppliedBoardId: string | null; lastAppliedEditorInstanceId: string | null; hasRestoredInitialSnapshot: boolean; reloadKey: number; lastAppliedReloadKey: number | null; isTextEditing: boolean }) {
  const reason: SnapshotApplyReason = !input.hasRestoredInitialSnapshot || input.lastAppliedEditorInstanceId !== input.editorInstanceId
    ? 'initial_load'
    : input.lastAppliedBoardId !== input.boardId
      ? 'board_id_changed'
      : input.lastAppliedReloadKey !== input.reloadKey
        ? 'explicit_reload'
        : 'unknown'
  return { allowed: reason !== 'unknown' && !input.isTextEditing, reason }
}
