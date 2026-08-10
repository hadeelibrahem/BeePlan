import { Component, useEffect, useRef, useState, type DragEvent, type ErrorInfo, type ReactNode } from 'react'
import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { useTheme } from '../../theme/ThemeContext'
import type { Whiteboard } from './api/whiteboardApi'
import { BeePlanTaskShapeUtil } from './BeePlanTaskShapeUtil'
import { BeePlanFileShapeUtil } from './BeePlanFileShapeUtil'
import type { VecLike } from '@tldraw/editor'
import { normalizeWhiteboardUrl } from './whiteboardLinkUtils'
import { BeePlanLinkShapeUtil } from './BeePlanLinkShapeUtil'
import { normalizeAssetSnapshot } from './whiteboardSnapshotUtils'
import { traceTextStoreWrite } from './whiteboardRealtime'
import { getSnapshotApplyDecision } from './whiteboardSnapshotRestorePolicy'

type WhiteboardExternalAsset = NonNullable<Awaited<ReturnType<Editor['getAssetForExternalContent']>>>

type WhiteboardCanvasProps = {
  board: Whiteboard | null
  loading: boolean
  error: string | null
  onRetry: () => void
  onMount?: (editor: Editor | null) => void
  onRestored?: (editor: Editor) => void | Promise<void>
  onFiles?: (files: File[], point?: VecLike) => void
  onExternalImageFile?: (file: File, assetId?: string) => Promise<WhiteboardExternalAsset>
  uploading?: boolean
  onPasteUrl?: (url: string, point: VecLike) => void
  readOnly?: boolean
  reloadKey?: number
  editorInstanceId?: string
}


type CanvasErrorBoundaryState = {
  hasError: boolean
}

class CanvasErrorBoundary extends Component<{ children: ReactNode; onRetry: () => void }, CanvasErrorBoundaryState> {
  state: CanvasErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): CanvasErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) console.error('Whiteboard could not be loaded.', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 items-center justify-center rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 text-center">
          <div>
            <h2 className="text-base font-semibold text-[var(--bp-text)]">Whiteboard could not be loaded.</h2>
            <p className="mt-2 text-sm text-[var(--bp-muted)]">Please try again.</p>
            <button type="button" onClick={this.props.onRetry} className="mt-4 rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-semibold text-[var(--bp-accent-text)]">
              Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export function WhiteboardCanvas({ board, loading, error, onRetry, onMount, onRestored, onFiles, onExternalImageFile, onPasteUrl, readOnly = false, reloadKey = 0, editorInstanceId }: WhiteboardCanvasProps) {
  const { mode } = useTheme()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [dropActive, setDropActive] = useState(false)
  const restoredSessionRef = useRef<string | null>(null)
  const restoringSessionRef = useRef<string | null>(null)
  const appliedBoardIdRef = useRef<string | null>(null)
  const appliedEditorInstanceIdRef = useRef<string | null>(null)
  const appliedReloadKeyRef = useRef<number | null>(null)
  const boardRef = useRef<Whiteboard | null>(board)
  const onRestoredRef = useRef(onRestored)
  const snapshotIdentityRef = useRef(new WeakMap<object, string>())
  const snapshotIdentityCounterRef = useRef(0)
  boardRef.current = board
  onRestoredRef.current = onRestored

  const snapshotIdentity = (snapshot: unknown) => {
    if (!snapshot || typeof snapshot !== 'object') return snapshot === null ? 'null' : 'primitive'
    const object = snapshot as object
    let identity = snapshotIdentityRef.current.get(object)
    if (!identity) {
      identity = `snapshot-${++snapshotIdentityCounterRef.current}`
      snapshotIdentityRef.current.set(object, identity)
    }
    return identity
  }

  useEffect(() => {
    const currentBoard = boardRef.current
    const currentBoardId = currentBoard?.id
    const session = `${currentBoardId ?? ''}:${reloadKey}:${editorInstanceId ?? 'editor'}`
    if (!editor || !currentBoard || !currentBoardId || loading || error || restoredSessionRef.current === session || restoringSessionRef.current === session) return

    const decision = getSnapshotApplyDecision({
      boardId: currentBoardId,
      editorInstanceId: editorInstanceId ?? 'editor',
      lastAppliedBoardId: appliedBoardIdRef.current,
      lastAppliedEditorInstanceId: appliedEditorInstanceIdRef.current,
      hasRestoredInitialSnapshot: appliedBoardIdRef.current !== null,
      reloadKey,
      lastAppliedReloadKey: appliedReloadKeyRef.current,
      isTextEditing: editor.getEditingShapeId() !== null,
    })
    const details = { boardId: currentBoardId, editorInstanceId: editorInstanceId ?? 'editor', snapshotIdentity: snapshotIdentity(currentBoard.snapshot), snapshotVersion: currentBoard.updatedAt, hasRestoredInitialSnapshot: appliedBoardIdRef.current !== null, isExplicitReload: decision.reason === 'explicit_reload', isTextEditing: editor.getEditingShapeId() !== null, currentEditingShapeId: editor.getEditingShapeId(), reason: decision.reason }
    if (!decision.allowed) {
      if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] HTTP_SNAPSHOT_APPLY_BLOCKED', details)
      return
    }

    setRestoreError(null)
    restoringSessionRef.current = session
    const restore = async () => {
      try {
      if (currentBoard.snapshot !== null) {
        const repairedSnapshot = normalizeAssetSnapshot(currentBoard.snapshot)
        const restoreSource = decision.reason === 'explicit_reload' ? 'http-reload' : decision.reason === 'board_id_changed' ? 'http-reload' : 'snapshot-restore'
        if (import.meta.env.DEV) console.error('[WhiteboardTextTrace] HTTP_SNAPSHOT_APPLY_ALLOWED', { ...details, source: restoreSource })
        const snapshotStore = (repairedSnapshot as { document?: { store?: Record<string, Record<string, unknown>> } }).document?.store ?? {}
        Object.values(snapshotStore).forEach((record) => traceTextStoreWrite(record, restoreSource, undefined, editor.getEditingShapeId()))
        // Snapshot/revision reconciliation is system state, not a user edit. Mark the
        // entire load as remote so collaboration and autosave listeners cannot echo
        // every restored document record back through Socket.IO.
        editor.store.mergeRemoteChanges(() => {
          editor.loadSnapshot(repairedSnapshot as Parameters<Editor['loadSnapshot']>[0])
        })
        if (import.meta.env.DEV) console.debug('[Whiteboard] snapshot restored into live editor', { boardId: currentBoardId })
      }
      editor.setCamera({ x: currentBoard.camera.x, y: currentBoard.camera.y, z: currentBoard.camera.zoom })
      await onRestoredRef.current?.(editor)
      restoredSessionRef.current = session
      restoringSessionRef.current = null
      appliedBoardIdRef.current = currentBoardId
      appliedEditorInstanceIdRef.current = editorInstanceId ?? 'editor'
      appliedReloadKeyRef.current = reloadKey
      } catch (reason: unknown) {
        restoringSessionRef.current = null
        setRestoreError(reason instanceof Error ? reason.message : 'Saved whiteboard data is invalid.')
      }
    }
    void restore()
  }, [board?.id, editor, editorInstanceId, error, loading, reloadKey])

  const handleMount = (mountedEditor: Editor) => {
    if (import.meta.env.DEV) console.debug('[Whiteboard] editor mounted')
    if (onExternalImageFile) {
      mountedEditor.registerExternalAssetHandler('file', async ({ file, assetId }) => {
        if (!file.type.startsWith('image/')) throw new Error('Only image files can be inserted with the tldraw image tool.')
        return onExternalImageFile(file, assetId)
      })
    }
    setEditor(mountedEditor)
    onMount?.(mountedEditor)
  }

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault()
    setDropActive(false)
    const files = Array.from(event.dataTransfer.files)
    if (!files.length || !editor) return
    const rect = event.currentTarget.getBoundingClientRect()
    onFiles?.(files, editor.screenToPage({ x: event.clientX - rect.left, y: event.clientY - rect.top }))
  }

  useEffect(() => () => onMount?.(null), [onMount])

  useEffect(() => {
    if (editor) editor.updateInstanceState({ isReadonly: readOnly })
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor || !onFiles) return
    const handlePaste = (event: ClipboardEvent) => {
      const image = Array.from(event.clipboardData?.items ?? []).find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      const file = image?.getAsFile()
      if (file) {
        event.preventDefault()
        onFiles([file], editor.getViewportPageBounds().center)
        return
      }
      const target = event.target as HTMLElement | null
      if (editor.getEditingShapeId() || target?.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return
      const text = event.clipboardData?.getData('text/plain') ?? ''
      const url = normalizeWhiteboardUrl(text)
      if (!url) return
      event.preventDefault()
      onPasteUrl?.(url, editor.getViewportPageBounds().center)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [editor, onFiles])

  const message = error ?? restoreError

  if (loading) {
    return (
      <section aria-label="Whiteboard loading" className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
        <p className="text-sm text-[var(--bp-muted)]">Loading...</p>
      </section>
    )
  }

  if (message) {
    return (
      <section aria-label="Whiteboard error" className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)] p-6 text-center">
        <div>
          <h2 className="text-base font-semibold text-[var(--bp-text)]">Error</h2>
          <p className="mt-2 max-w-md text-sm text-[var(--bp-muted)]">{message}</p>
          <button type="button" onClick={onRetry} className="mt-4 rounded-lg bg-[var(--bp-accent)] px-3 py-2 text-sm font-semibold text-[var(--bp-accent-text)]">
            Retry
          </button>
        </div>
      </section>
    )
  }

  return (
      <section aria-label="Personal Whiteboard canvas" className="relative h-full min-h-0 w-full flex-1 overflow-hidden rounded-2xl border border-[var(--bp-border)] bg-[var(--bp-surface)]">
      <CanvasErrorBoundary onRetry={onRetry}>
        <div className="relative h-full w-full" onDragEnter={(event) => { event.preventDefault(); setDropActive(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false) }} onDrop={handleDrop}>
          <Tldraw colorScheme={mode} shapeUtils={[BeePlanTaskShapeUtil, BeePlanFileShapeUtil, BeePlanLinkShapeUtil]} onMount={handleMount} />
          {dropActive && <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-[var(--bp-accent)] bg-[var(--bp-accent-soft)] text-sm font-semibold text-[var(--bp-accent)]">Drop files to upload</div>}
        </div>
      </CanvasErrorBoundary>
    </section>
  )
}
